// Mechanical part of the ut-requirements-review and self-review skills; judgment-based review stays with the reviewer.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIREMENTS = "docs/j1979-pid-mvp-training-requirements.md";
const SWDD = "docs/swdd.md";
const UT_DESIGN = "docs/ut.md";
const UT_CSV = "docs/ut-testcases.csv";
const TEST_FILE = "test/decoder.test.js";
const DECODER = "src/decoder.js";
const APP = "src/app.js";
const PAGE = "index.html";

const read = (file) =>
  readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

const between = (text, start, end) => {
  const from = text.indexOf(start);
  if (from < 0) {
    return "";
  }
  const rest = text.slice(from + start.length);
  const to = end ? rest.search(end) : -1;
  return to < 0 ? rest : rest.slice(0, to);
};

const tableRows = (text) =>
  text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^-+$/.test(cell)));

const idsIn = (text) => text.match(/(?:FR|QR)-\d+/g) ?? [];

const pad = (n) => `UT-${String(n).padStart(2, "0")}`;

function expandTestIds(text) {
  const ids = new Set();
  for (const match of text.matchAll(/UT-(\d+)(?: to UT-(\d+))?/g)) {
    const first = Number(match[1]);
    const last = match[2] ? Number(match[2]) : first;
    for (let n = first; n <= last; n += 1) {
      ids.add(pad(n));
    }
  }
  return ids;
}

function parseCsv() {
  const lines = read(UT_CSV).split("\n").filter(Boolean);
  const rows = lines.slice(1).map((line) =>
    [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1].replace(/""/g, '"'))
  );
  return { header: lines[0].split(","), rows };
}

function requirementRows() {
  return tableRows(read(REQUIREMENTS))
    .filter((cells) => /^(FR|QR)-\d+$/.test(cells[0]))
    .map(([id, statement, criteria]) => ({ id, statement, criteria }));
}

const checks = {
  requirements() {
    const findings = [];
    const rows = requirementRows();
    if (rows.length === 0) {
      findings.push("no FR/QR rows found");
    }
    const seen = new Set();
    for (const { id, statement, criteria } of rows) {
      if (seen.has(id)) {
        findings.push(`${id} is defined more than once`);
      }
      seen.add(id);
      if (!statement || !criteria) {
        findings.push(`${id} has an empty statement or acceptance criteria`);
      }
    }
    return findings;
  },

  swdd() {
    const findings = [];
    const text = read(SWDD);
    const known = new Set(requirementRows().map((row) => row.id));

    const trace = tableRows(between(text, "## 4. Requirements traceability", /\n## /));
    const traced = new Set(trace.flatMap((cells) => idsIn(cells[0])));
    for (const id of known) {
      if (!traced.has(id)) {
        findings.push(`${id} is missing from the SWDD traceability table`);
      }
    }
    for (const id of traced) {
      if (!known.has(id)) {
        findings.push(`SWDD traceability cites unknown requirement ${id}`);
      }
    }

    const paths = new Set(
      [...text.matchAll(/`([\w.-]+(?:\/[\w.-]+)+\.(?:js|ya?ml|html|css|md|csv|json))`/g)].map((m) => m[1])
    );
    for (const file of paths) {
      if (!file.startsWith("reports/") && !existsSync(path.join(root, file))) {
        findings.push(`SWDD mentions ${file}, which does not exist`);
      }
    }
    return findings;
  },

  "ut-design"() {
    const findings = [];
    const known = new Set(requirementRows().map((row) => row.id));
    const { header, rows } = parseCsv();

    if (header.length !== 8) {
      findings.push(`CSV header has ${header.length} columns, expected 8`);
    }
    const csvIds = rows.map((row) => row[0]);
    if (new Set(csvIds).size !== csvIds.length) {
      findings.push("CSV has duplicate test IDs");
    }
    csvIds.forEach((id, index) => {
      if (id !== pad(index + 1)) {
        findings.push(`CSV row ${index + 1} has ID ${id}, expected ${pad(index + 1)}`);
      }
    });
    for (const row of rows) {
      if (row.length !== 8 || row.some((cell) => !cell.trim())) {
        findings.push(`${row[0]} has a missing CSV field`);
      }
      for (const id of idsIn(row[6] ?? "")) {
        if (!known.has(id)) {
          findings.push(`${row[0]} cites unknown requirement ${id}`);
        }
      }
    }

    const design = read(UT_DESIGN);
    const specification = between(design, "## 3. Test case specification", /\n## 4\. /);
    const designIds = [...specification.matchAll(/^\| (UT-\d+) \|/gm)].map((match) => match[1]);
    for (const id of csvIds.filter((item) => !designIds.includes(item))) {
      findings.push(`${id} is in the CSV but not in ut.md section 3`);
    }
    for (const id of designIds.filter((item) => !csvIds.includes(item))) {
      findings.push(`${id} is in ut.md section 3 but not in the CSV`);
    }

    const trace = tableRows(between(design, "## 5. Requirements traceability", /\nMapping to/));
    const traced = new Set();
    for (const [label, unitTests, otherChecks] of trace) {
      const labelIds = idsIn(label);
      if (/all decoder tests/i.test(unitTests)) {
        labelIds.forEach((id) => traced.add(id));
        continue;
      }
      const designSet = /^none$/i.test(unitTests) ? new Set() : expandTestIds(unitTests);
      if (labelIds.length > 0 && designSet.size === 0 && !otherChecks) {
        findings.push(`${label} has no unit test and no other verification`);
      }
      for (const id of labelIds) {
        traced.add(id);
        const csvSet = new Set(
          rows.filter((row) => idsIn(row[6]).includes(id)).map((row) => row[0])
        );
        const onlyDesign = [...designSet].filter((item) => !csvSet.has(item));
        const onlyCsv = [...csvSet].filter((item) => !designSet.has(item));
        if (onlyDesign.length > 0 || onlyCsv.length > 0) {
          findings.push(
            `${id} traceability differs; ut.md only: ${onlyDesign.join(", ") || "-"}; CSV only: ${onlyCsv.join(", ") || "-"}`
          );
        }
      }
    }
    for (const id of known) {
      if (id.startsWith("FR-") && !traced.has(id)) {
        findings.push(`${id} is missing from the ut.md traceability table`);
      }
    }
    return findings;
  },

  tests() {
    const findings = [];
    const csvIds = new Set(parseCsv().rows.map((row) => row[0]));
    const code = read(TEST_FILE);
    const codeIds = new Set(code.match(/UT-\d\d/g) ?? []);

    for (const id of csvIds) {
      if (!codeIds.has(id)) {
        findings.push(`${id} is in the CSV but has no test in ${TEST_FILE}`);
      }
    }
    for (const id of codeIds) {
      if (!csvIds.has(id)) {
        findings.push(`${TEST_FILE} references ${id}, which is not in the CSV`);
      }
    }
    for (const match of code.matchAll(/\btest\(\s*[`"']([^`"']*)/g)) {
      if (!/^(UT-\d\d|\$\{id\})/.test(match[1])) {
        findings.push(`test title does not start with a test ID: ${match[1].slice(0, 40)}`);
      }
    }
    return findings;
  },

  code() {
    const findings = [];
    const swdd = read(SWDD);
    const decoder = read(DECODER);

    const functions = tableRows(between(swdd, "#### 3.1.3 Functions", /\n#{2,4} /))
      .map((cells) => /^`(\w+)`$/.exec(cells[0])?.[1])
      .filter(Boolean);
    for (const name of functions) {
      if (!new RegExp(`export function ${name}\\b`).test(decoder)) {
        findings.push(`${DECODER} does not export ${name} (SWDD 3.1.3)`);
      }
    }

    const designed = new Map(
      tableRows(between(swdd, "## 5. Error messages", /\n## /))
        .map((cells) => [/^`([A-Z_]+)`$/.exec(cells[0])?.[1], cells[1]])
        .filter(([code]) => code)
    );
    const implemented = new Map(
      [...between(decoder, "const MESSAGES = {", /\n};/).matchAll(/^\s+([A-Z_]+):\s*"((?:[^"\\]|\\.)*)"/gm)].map(
        (match) => [match[1], match[2]]
      )
    );
    for (const [code, message] of designed) {
      if (implemented.get(code) !== message) {
        findings.push(`error ${code} differs between SWDD section 5 and ${DECODER}`);
      }
    }
    for (const code of implemented.keys()) {
      if (!designed.has(code)) {
        findings.push(`${DECODER} defines error ${code}, which is not in SWDD section 5`);
      }
    }

    const page = read(PAGE);
    for (const match of read(APP).matchAll(/getElementById\("([^"]+)"\)/g)) {
      if (!page.includes(`id="${match[1]}"`)) {
        findings.push(`${APP} uses #${match[1]}, which is not in ${PAGE}`);
      }
    }
    return findings;
  }
};

export const STAGE_NAMES = Object.keys(checks);

export function runChecks(stage) {
  return checks[stage]().map((message) => ({ stage, message }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const requested = process.argv[2] && process.argv[2] !== "all" ? [process.argv[2]] : STAGE_NAMES;
  let total = 0;
  for (const stage of requested) {
    if (!checks[stage]) {
      console.error(`Unknown stage "${stage}". Stages: ${STAGE_NAMES.join(", ")}`);
      process.exit(2);
    }
    const findings = runChecks(stage);
    total += findings.length;
    console.log(`${findings.length === 0 ? "PASS" : "FAIL"}  ${stage}`);
    for (const { message } of findings) {
      console.log(`      - ${message}`);
    }
  }
  console.log(total === 0 ? "\nReview checks: no findings." : `\nReview checks: ${total} finding(s).`);
  process.exit(total === 0 ? 0 : 1);
}
