---
name: self-review
description: 'Review your own just-finished work before hand-off: check the change against the request, requirements and design, read the diff critically, run the checks, and report what was verified and what was not. Use when asked to self review, review my changes, double-check my work, verify before commit or pull request, sanity-check what was generated, or confirm code, tests, docs and CSV agree.'
argument-hint: 'Optional scope, e.g. "src/decoder.js" or "everything changed this session"'
---

# Self Review

Review work you or the agent just produced, as a skeptical second reader. Fix defects you introduced; report everything else. Do not widen scope.

## Inputs (discover, then state what you used)

| Artifact | Where to look |
|---|---|
| The request | The user's latest ask and any earlier constraints in the conversation |
| Requirements and acceptance criteria | `docs/*requirements*.md` |
| Design | `docs/swdd.md`, `docs/ut.md`, `docs/ut-testcases.csv` |
| Project conventions | `.github/copilot-instructions.md`, `.github/workflows/copilot-instructions.md`, `README.md` |
| The change | `git status` and `git diff` if a repository exists; otherwise the files touched in this session |

If an artifact is missing, say so and review against what exists.

## Procedure

1. **Scope the change.** List every file created, edited, renamed, or deleted. Note generated outputs and scratch files separately.
2. **Check against the ask.** Restate the request in one line, then map each part to evidence (file and line). Flag:
   - Parts of the request with no matching change.
   - Changes nobody asked for (scope creep, extra files, refactors).
   - Conflicts between sources (request vs design, design vs conventions). Record them as open questions; do not silently pick one.
3. **Read the diff critically.** For each changed file check:
   - Logic and edge cases: boundaries, empty and non-string input, error paths, ordering of checks.
   - Security and privacy: no injection paths (for example unsafe HTML insertion), no secrets or real data in files, logs, or output, no data sent off the device unless required.
   - Accessibility and UI behavior when a UI changed: labels, keyboard use, announced status, stale state cleared.
   - Style: matches the existing code and the conventions file.
4. **Verify by running.** Run the project's own checks (typically `npm test` and `node --check` per file) and report actual results.
   - If a tool is unavailable (for example Node not on `PATH`), say so, name any substitute used, and mark the result as substitute evidence.
   - Never state that something passes unless it was executed in this review.
5. **Prove the tests can fail.** For new or changed tests, apply one or two deliberate defects to a **scratch copy outside the workspace** (for example swapped byte order, removed validation) and confirm at least one test fails. Delete the scratch copy afterwards.
6. **Check consistency after changes.** Confirm these still agree:
   - Test IDs, counts, and names across the design, the CSV, and the test code.
   - Requirement IDs cited by tests exist.
   - File names and paths mentioned in docs, instructions, and workflows after renames or moves.
   - Commands documented in docs match the scripts in `package.json`.
7. **Check hygiene.**
   - Scratch files, temporary folders, and backup files are removed.
   - Generated output (for example `reports/`) is intentional and mentioned to the user.
   - Nothing sensitive was written to a file or echoed; mask secrets when showing log or config output.
   - No debug statements or commented-out code left behind.
8. **Fix or report.**
   - Fix a defect right away when you introduced it, it is small, and the fix is inside the requested scope. Re-run the affected checks.
   - Otherwise list it with a suggested fix and ask before changing anything larger.

## Report format

1. **Verdict:** Ready, Ready with findings, or Not ready, with one sentence why.
2. **Verified vs not verified:**

| Item | Evidence | Status |
|---|---|---|
| e.g. Unit tests | `npm test`, 60 pass, 0 fail | Verified by run |
| e.g. Page in a browser | Not opened | Not verified |

   Use exactly one of: Verified by run, Verified by reading, Substitute evidence, Not verified.
3. **Findings** (sorted by severity):

| # | Severity | File | Finding | Fix applied or suggested |
|---|---|---|---|---|

   - **High:** wrong behavior, security or privacy problem, request not met, tests that cannot fail.
   - **Medium:** inconsistency between code, tests, docs, or CSV; missing edge case.
   - **Low:** naming, formatting, stale wording.
4. **Open questions** for the user (source conflicts, ambiguous requirements).
5. **Suggested next steps**, at most three.

## Rules

- Cite files with workspace-relative links and line numbers.
- Distinguish what you ran from what you read; state limits plainly.
- Do not invent requirements. An ambiguous criterion is an open question, not a defect.
- Keep the report short: findings and evidence, not a narrative of the work.
