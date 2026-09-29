---
name: ut-requirements-review
description: 'Review unit tests (UT) against requirements: traceability, coverage of acceptance criteria, boundary and error cases, UT design/CSV/test-code consistency, and assertion quality. Use when asked to review, audit, or check unit tests, UT design, ut.md, ut-testcases.csv, or test files against requirements, FR/QR IDs, SWDD, or the traceability matrix.'
argument-hint: 'Optional scope, e.g. "FR-03 only" or "test/decoder.test.js"'
---

# Unit Test Review Against Requirements

Read-only review. Produce findings; do not edit requirements, design, tests, or the CSV unless the user asks.

## Inputs (discover, then confirm in the report)

| Artifact | Default location |
|---|---|
| Requirements (IDs, acceptance criteria, error messages, check order) | `docs/*requirements*.md` |
| Software design (pipeline, error codes, exported API) | `docs/swdd.md` |
| UT design (scope, test list, traceability table) | `docs/ut.md` |
| UT case list | `docs/ut-testcases.csv` |
| Test code | `test/*.test.js` |
| Unit under test | `src/` |

If an artifact is missing, say so and review what exists.

## Procedure

1. **Extract requirements.** List every requirement ID with its acceptance criteria, including literal examples and values. Mark each as in unit-test scope or not, using the scope table in the UT design (for example UI-only requirements are verified manually).
2. **Inventory the tests.** Collect test IDs from the UT design, the CSV, and the test code. Check:
   - Every ID exists in all three, with no duplicates or gaps in numbering.
   - Test names in code start with their ID.
   - CSV has all columns filled (ID, Name, Type, Precondition, Action, Expected Result, Requirement, Result) and no row without Action or Expected Result.
   - Action and Expected Result in the CSV and design agree with what the code asserts.
3. **Check traceability both ways.**
   - Forward: every in-scope requirement has at least one test; out-of-scope ones name another verification method.
   - Backward: every test cites a requirement that exists; no test cites the wrong one.
   - Compare with the traceability table in the UT design and flag mismatches.
4. **Check criteria coverage.** For each in-scope requirement confirm tests cover:
   - Every literal example from the acceptance criteria, with the same values.
   - Boundary values (min, max, off-by-one, sign or width boundaries).
   - Each error code and message defined in the design, and the required check order (inputs with two faults).
   - Both outcomes of each decision in the design's processing pipeline.
5. **Check assertion quality.** Flag tests that:
   - Assert only `ok` or "no throw" where a specific value, code, or message is required.
   - Derive the expected value by re-implementing the formula instead of using a literal.
   - Depend on order, time, network, or shared state; are skipped or commented out.
   - Would still pass if the requirement were violated (name the mutation that would survive).
6. **Run and report actuals.** Run the commands from the UT design (typically `npm test`, `node --check` on the source and test file). Report the real result. Never state that tests pass unless they were executed in this review. If a reporter tool exists under `tools/`, use it only as documented.
7. **Report.**

## Report format

1. Verdict: Pass, Pass with findings, or Fail, plus one sentence why.
2. Findings table, sorted by severity:

| # | Severity | Requirement / Test ID | Finding | Evidence (file link) | Suggested fix |
|---|---|---|---|---|---|

   - **High:** in-scope requirement with no test, wrong expected value, test that cannot fail, CSV/design/code contradiction.
   - **Medium:** missing boundary, error code, or precedence case; wrong traceability entry.
   - **Low:** naming, formatting, incomplete CSV metadata.
3. Coverage summary: requirements in scope, covered, uncovered; tests total, with and without a valid requirement link.
4. Commands run and their actual results.

## Rules

- Cite files with workspace-relative links and line numbers.
- Do not invent requirements; if a criterion is ambiguous, list it as an open question instead of a defect.
- Keep suggested fixes to one line each; do not rewrite tests unless asked.
