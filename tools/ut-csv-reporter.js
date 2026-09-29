import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// node:test reporter: joins test results with the design in docs/ut-testcases.csv
// and writes reports/ut-report.csv (one row per UT id).

const root = new URL("../", import.meta.url);
const designPath = fileURLToPath(new URL("docs/ut-testcases.csv", root));
const reportPath = fileURLToPath(new URL("reports/ut-report.csv", root));
const ID_PATTERN = /^(UT-\d+)\b/;

const REPORT_COLUMNS = [
  "Test Case ID",
  "Test Case Name",
  "Test Case Type",
  "Precondition",
  "Action",
  "Expected Result",
  "Requirement",
  "Result",
  "Automated Tests Run",
  "Duration (ms)",
  "Failure Details"
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === "\"" && text[i + 1] === "\"") {
        field += "\"";
        i += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell !== ""));
}

function loadDesign() {
  try {
    const [header, ...rows] = parseCsv(readFileSync(designPath, "utf8").replace(/^\uFEFF/, ""));
    return rows.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])));
  } catch {
    return [];
  }
}

function escapeCell(value) {
  let text = String(value ?? "");
  // Stop spreadsheet apps from treating a cell as a formula.
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function failureText(details) {
  const error = details?.error;
  const cause = error?.cause ?? error;
  const message = cause?.message ?? (cause ? String(cause) : "");
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}

export default async function* utCsvReporter(source) {
  const results = new Map();
  let fileFailure = "";
  let stderrText = "";

  for await (const event of source) {
    if (event.type === "test:stderr") {
      stderrText += event.data.message;
      continue;
    }
    if (event.type !== "test:pass" && event.type !== "test:fail") {
      continue;
    }

    const { name, details } = event.data;
    const match = ID_PATTERN.exec(name);

    if (!match) {
      if (event.type === "test:fail" && /\.[cm]?js$/.test(name)) {
        fileFailure = failureText(details);
      }
      continue;
    }

    const entry = results.get(match[1]) ?? { runs: 0, failed: 0, duration: 0, messages: [] };
    entry.runs += 1;
    entry.duration += details?.duration_ms ?? 0;
    if (event.type === "test:fail") {
      entry.failed += 1;
      entry.messages.push(failureText(details));
    }
    results.set(match[1], entry);
  }

  if (fileFailure) {
    const loadError = stderrText.split(/\r?\n/).find((line) => /Error/.test(line));
    if (loadError) {
      fileFailure = loadError.replace(/\s+/g, " ").trim().slice(0, 300);
    }
  }

  const design = loadDesign();
  const known = new Set(design.map((row) => row["Test Case ID"]));
  const extra = [...results.keys()]
    .filter((id) => !known.has(id))
    .map((id) => ({ "Test Case ID": id }));

  const counts = { Pass: 0, Fail: 0, "Not Run": 0 };
  const lines = [REPORT_COLUMNS.map(escapeCell).join(",")];

  for (const row of [...design, ...extra]) {
    const id = row["Test Case ID"];
    const entry = results.get(id);
    const result = !entry ? "Not Run" : entry.failed > 0 ? "Fail" : "Pass";
    counts[result] += 1;

    const details = entry ? entry.messages.join(" | ") : fileFailure && `Test file failed to run: ${fileFailure}`;
    const cells = [
      id,
      row["Test Case Name"],
      row["Test Case Type"],
      row.Precondition,
      row.Action,
      row["Expected Result"],
      row.Requirement,
      result,
      entry ? entry.runs : 0,
      entry ? entry.duration.toFixed(1) : "",
      details
    ];
    lines.push(cells.map(escapeCell).join(","));
  }

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

  const total = counts.Pass + counts.Fail + counts["Not Run"];
  yield `\nUT report: ${counts.Pass} pass, ${counts.Fail} fail, ${counts["Not Run"]} not run of ${total} -> reports/ut-report.csv\n`;
}
