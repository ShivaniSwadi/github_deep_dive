// Freezes each stage (requirements, SWDD, UT design, tests, code) after review; see docs/stage-baseline.json.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { runChecks } from "./review-check.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = "docs/stage-baseline.json";

export const STAGES = [
  { name: "requirements", files: ["docs/j1979-pid-mvp-training-requirements.md"], upstream: [] },
  { name: "swdd", files: ["docs/swdd.md"], upstream: ["requirements"] },
  { name: "ut-design", files: ["docs/ut.md", "docs/ut-testcases.csv"], upstream: ["swdd"] },
  { name: "tests", files: ["test/decoder.test.js", "tools/ut-csv-reporter.js"], upstream: ["ut-design"] },
  {
    name: "code",
    files: ["src/decoder.js", "src/app.js", "src/styles.css", "index.html"],
    upstream: ["swdd", "ut-design"]
  }
];

const stageByName = (name) => STAGES.find((stage) => stage.name === name);

// Line endings and BOM are normalized so Windows and Linux checkouts hash the same.
function hashStage(stage) {
  const hash = createHash("sha256");
  for (const file of [...stage.files].sort()) {
    const text = readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    hash.update(`${file}\n${text}\n`);
  }
  return hash.digest("hex");
}

function loadBaseline() {
  const file = path.join(root, BASELINE);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { stages: {} };
}

function saveBaseline(baseline) {
  writeFileSync(path.join(root, BASELINE), `${JSON.stringify(baseline, null, 2)}\n`);
}

// A stage is frozen when its files match the baseline and it was reviewed against the current upstream stages.
function stageProblems(stage, baseline) {
  const entry = baseline.stages[stage.name];
  if (!entry) {
    return [`not frozen yet`];
  }
  const problems = [];
  if (hashStage(stage) !== entry.hash) {
    problems.push(`changed after it was frozen (${stage.files.join(", ")})`);
  }
  for (const upstream of stage.upstream) {
    if (entry.basedOn?.[upstream] !== baseline.stages[upstream]?.hash) {
      problems.push(`was reviewed against an older ${upstream}; re-review and re-freeze`);
    }
  }
  return problems;
}

function verify() {
  const baseline = loadBaseline();
  let failed = false;
  for (const stage of STAGES) {
    const problems = stageProblems(stage, baseline);
    const entry = baseline.stages[stage.name];
    if (problems.length === 0) {
      console.log(`FROZEN    ${stage.name.padEnd(13)} reviewed by ${entry.reviewedBy} on ${entry.reviewedAt}`);
    } else {
      failed = true;
      console.log(`NOT OK    ${stage.name.padEnd(13)} ${problems.join("; ")}`);
    }
  }
  if (failed) {
    console.log(
      "\nA frozen stage changes only when its upstream stage changes. Review the stage, then run:\n" +
        '  npm run freeze -- <stage> --reviewer "<name>"   (add --amend "<reason>" to fix a stage whose upstream did not change)'
    );
  }
  return failed ? 1 : 0;
}

function freeze(name, options) {
  const stage = stageByName(name);
  if (!stage) {
    console.error(`Unknown stage "${name}". Stages: ${STAGES.map((item) => item.name).join(", ")}`);
    return 2;
  }
  if (!options.reviewer) {
    console.error("--reviewer is required: name the person who reviewed this stage.");
    return 2;
  }

  const baseline = loadBaseline();
  for (const upstream of stage.upstream) {
    const problems = stageProblems(stageByName(upstream), baseline);
    if (problems.length > 0) {
      console.error(`Freeze ${upstream} first: ${problems.join("; ")}`);
      return 1;
    }
  }

  const findings = runChecks(name);
  if (findings.length > 0) {
    console.error(`Review checks failed for ${name}:`);
    findings.forEach(({ message }) => console.error(`  - ${message}`));
    return 1;
  }

  const entry = baseline.stages[name];
  const currentHash = hashStage(stage);
  const upstreamChanged =
    !entry || stage.upstream.some((upstream) => entry.basedOn?.[upstream] !== baseline.stages[upstream].hash);
  const stageChanged = !entry || entry.hash !== currentHash;

  if (entry && !upstreamChanged && !stageChanged) {
    console.log(`${name} is already frozen and unchanged.`);
    return 0;
  }
  if (entry && stage.upstream.length > 0 && !upstreamChanged && !options.amend) {
    console.error(
      `${name} is frozen and its upstream did not change. Change the requirement first, or record a reason with --amend "<reason>".`
    );
    return 1;
  }

  const today = new Date().toISOString().slice(0, 10);
  const amendments = entry?.amendments ?? [];
  if (options.amend && entry && !upstreamChanged) {
    amendments.push({ date: today, reviewedBy: options.reviewer, reason: options.amend });
  }
  baseline.stages[name] = {
    hash: currentHash,
    basedOn: Object.fromEntries(stage.upstream.map((upstream) => [upstream, baseline.stages[upstream].hash])),
    reviewedBy: options.reviewer,
    reviewedAt: today,
    ...(amendments.length > 0 ? { amendments } : {})
  };
  saveBaseline(baseline);

  const downstream = STAGES.filter((item) => item.upstream.includes(name)).map((item) => item.name);
  console.log(`Froze ${name} (reviewed by ${options.reviewer}, ${today}).`);
  if (downstream.length > 0) {
    console.log(`Now re-review and re-freeze: ${downstream.join(", ")}.`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { reviewer: { type: "string" }, amend: { type: "string" } }
  });
  const [command, stage] = positionals;
  if (command === "verify") {
    process.exit(verify());
  } else if (command === "freeze" && stage) {
    process.exit(freeze(stage, values));
  } else {
    console.error('Usage: stage-gate.js verify | freeze <stage> --reviewer "<name>" [--amend "<reason>"]');
    process.exit(2);
  }
}
