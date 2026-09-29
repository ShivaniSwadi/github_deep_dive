# Unit Test Design (UT): RPM Lens

Sources: [j1979-pid-mvp-training-requirements.md](j1979-pid-mvp-training-requirements.md), [swdd.md](swdd.md)

Status: design updated for FR-11 (compact input form). Test code and CSV must match this document; UT-01 to UT-71.

## 1. Purpose and scope

This document defines the unit tests for RPM Lens: what is tested, how, with which data, and which requirement each test traces to. It is the input for implementing `test/decoder.test.js`.

| Item | Decision |
|---|---|
| Unit under test | `src/decoder.js` (pure functional core): `decodeRpmResponse`, and `calculateRpm` / `formatRpm` if exported |
| Not unit tested | `src/app.js`, `index.html`, `src/styles.css`, `infra/site.yaml`, CI/CD workflow (covered by the manual checks in swdd.md Section 6.2) |
| Test level | Unit only; no integration, browser, or network tests |

`app.js` is excluded because a DOM test would need a browser or a DOM library, which conflicts with the no-runtime-dependency constraint (swdd.md 1.4). The logic that matters (validation and decoding) lives in the decoder, which is why the design keeps it DOM-free (QR-06).

## 2. Test approach

### 2.1 Tooling and conventions

- Node.js 20 or later, built-in `node:test` runner and `node:assert/strict`. No test framework, mocking library, or DOM library.
- The test file imports only from `../src/decoder.js`.
- Tests are deterministic and independent: no timers, network, file writes, randomness, or shared mutable state. The one exception is the static guard (UT-60), which reads `src/decoder.js` as text.
- Table-driven style for groups of similar vectors: one data array, one loop, one named test per row.
- Each test name starts with its ID (for example `UT-05 ...`) so failures map back to this document.
- Expected values are written as literals, hand-computed from the formula, not derived by re-implementing the formula in the test (except the labelled exhaustive test UT-59, which uses an independent integer oracle).

### 2.2 Commands (from the repository root)

```text
npm test
node --check src/decoder.js
node --check test/decoder.test.js
```

Coverage is optional and informational: `node --test --experimental-test-coverage`.

### 2.2.1 CSV test report

`npm test` also writes `reports/ut-report.csv` through the custom reporter `tools/ut-csv-reporter.js`. The reporter joins the run results with the design in [ut-testcases.csv](ut-testcases.csv) and writes one row per test case ID:

| Column | Content |
|---|---|
| Test Case ID, Name, Type, Precondition, Action, Expected Result, Requirement | Copied from `docs/ut-testcases.csv` |
| Result | `Pass`, `Fail` (any automated test with that ID failed), or `Not Run` (no test with that ID executed) |
| Automated Tests Run | Number of automated tests carrying the ID (UT-48 runs six) |
| Duration (ms) | Total duration of those tests |
| Failure Details | Assertion message for a failure, or the load error when the test file cannot run (for example a missing `src/decoder.js`) |

The report is written on every run, including failing runs, and `npm test` still exits non-zero when any test fails. `reports/` holds generated output and is not source.

### 2.3 Design techniques applied

| Technique | Where |
|---|---|
| Equivalence classes | Valid response (spaced and compact); each error class (empty, byte count, byte syntax, service, PID) |
| Boundary values | A and B at 0, 1, 0x7F, 0x80, 0xFF; 0 rpm; 16,383.75 rpm; byte-count 3 / 4 / 5; hex-length 1 / 2 / 3; compact token length 6 / 7 / 8 / 9 / 10 |
| Decision coverage | Every decision in the swdd.md 3.1.4 pipeline is exercised to both outcomes |
| Precedence testing | Inputs with two simultaneous faults to prove the fixed check order |
| Robustness | Non-string input, very long input, repeated calls |
| Contract testing | Shape of success and error results, error codes and messages |
| Exhaustive check | All 65,536 combinations of A and B, in spaced form (UT-59) and compact form equivalence (UT-71) |
| Static guard | Decoder source has no DOM, network, storage, logging, or dynamic-code access |

## 3. Test case specification

Notation: input strings are shown in backticks; `\t`, `\r`, `\n` denote tab, carriage return, and newline characters. `rpm` is the numeric result; `display` is the formatted string. "Error `X`" means `ok` is `false` with `code` equal to `X`.

### 3.1 Valid responses (FR-02, FR-06)

| ID | Input | Expected |
|---|---|---|
| UT-01 | `41 0C 1A F8` | ok; `rpm` 1726; `bytes` [0x41, 0x0C, 0x1A, 0xF8]; `normalized` `41 0C 1A F8` |
| UT-02 | `41 0c 1a f8` | ok; `rpm` 1726; `normalized` `41 0C 1A F8` (upper-cased) |
| UT-03 | `41 0C 1a F8` | ok; same result as UT-01 (mixed case) |

### 3.2 Calculation and boundary values (FR-06, FR-07, QR-01)

Formula: `rpm = ((A * 256) + B) / 4`.

| ID | Input | Expected `rpm` | Purpose |
|---|---|---|---|
| UT-04 | `41 0C 00 00` | 0 | Minimum |
| UT-05 | `41 0C 00 01` | 0.25 | Smallest non-zero step |
| UT-06 | `41 0C 00 02` | 0.5 | Fractional |
| UT-07 | `41 0C 00 03` | 0.75 | Fractional |
| UT-08 | `41 0C 00 04` | 1 | First whole value |
| UT-09 | `41 0C 00 FF` | 63.75 | Maximum B with A = 0 |
| UT-10 | `41 0C 01 00` | 64 | A contributes 256 per step |
| UT-11 | `41 0C 7F FF` | 8191.75 | Below sign boundary |
| UT-12 | `41 0C 80 00` | 8192 | Bytes are unsigned (no sign interpretation) |
| UT-13 | `41 0C FF 00` | 16320 | Maximum A with B = 0 |
| UT-14 | `41 0C FF FF` | 16383.75 | Maximum |

### 3.3 Whitespace handling (FR-02)

All rows are expected to decode successfully with `rpm` 1726 and `normalized` `41 0C 1A F8` (single spaces, no leading or trailing whitespace).

| ID | Input |
|---|---|
| UT-15 | `  41 0C 1A F8  ` (leading and trailing spaces) |
| UT-16 | `41  0C   1A    F8` (multiple internal spaces) |
| UT-17 | `41\t0C\t1A\tF8` (tabs) |
| UT-18 | `41 0C 1A F8\r\n` (trailing line ending, as pasted from a file) |

### 3.4 Empty input (FR-03)

| ID | Input | Expected |
|---|---|---|
| UT-19 | `` (empty string) | Error `EMPTY` |
| UT-20 | `   ` (spaces only) | Error `EMPTY` |
| UT-21 | `\t\r\n` (whitespace characters only) | Error `EMPTY` |

### 3.5 Wrong byte count (FR-03)

| ID | Input | Expected | Note |
|---|---|---|---|
| UT-22 | `41` | Error `WRONG_BYTE_COUNT` | 1 byte |
| UT-23 | `41 0C` | Error `WRONG_BYTE_COUNT` | 2 bytes |
| UT-24 | `41 0C F8` | Error `WRONG_BYTE_COUNT` | 3 bytes (requirements example) |
| UT-25 | `41 0C 1A F8 00` | Error `WRONG_BYTE_COUNT` | 5 bytes (requirements example) |
| UT-26 | `41 0C 1A F8 41 0C 1A F8` | Error `WRONG_BYTE_COUNT` | 8 bytes |
| UT-27 | `410C 1AF8`, `41 0C1AF8`, and `410C1AF8 00` | Error `WRONG_BYTE_COUNT` | Mixed grouping and a compact token followed by more tokens are not accepted (FR-11); only exactly one 8-character token is expanded |
| UT-28 | `41,0C,1A,F8` | Error `WRONG_BYTE_COUNT` | Wrong separator gives one token of 11 characters, not 8 |

### 3.6 Invalid byte syntax (FR-03)

Each row has exactly four tokens, so the count check passes and the syntax check fails.

| ID | Input | Expected | Note |
|---|---|---|---|
| UT-29 | `41 0C 1G F8` | Error `INVALID_BYTE` | Non-hex character (requirements example) |
| UT-30 | `41 0C 1 F8` | Error `INVALID_BYTE` | One hex digit |
| UT-31 | `41 0C 1AF F8` | Error `INVALID_BYTE` | Three hex digits |
| UT-32 | `0x41 0C 1A F8` | Error `INVALID_BYTE` | `0x` prefix not accepted |
| UT-33 | `41 0C -1 F8` | Error `INVALID_BYTE` | Sign character |
| UT-34 | `41 0C +1 F8` | Error `INVALID_BYTE` | Sign character |
| UT-35 | `41 0C 1. F8` | Error `INVALID_BYTE` | Punctuation |
| UT-36 | `４１ 0C 1A F8` | Error `INVALID_BYTE` | Full-width digits are not ASCII hex |
| UT-61 | `41 0C` followed by U+FB00 (`ﬀ`) and `F8` | Error `INVALID_BYTE` | The ligature upper-cases to `FF`; the check on the raw token must reject it |

### 3.7 Wrong service (FR-04)

| ID | Input | Expected |
|---|---|---|
| UT-37 | `42 0C 1A F8` | Error `WRONG_SERVICE` |
| UT-38 | `01 0C 1A F8` | Error `WRONG_SERVICE` (request service, not a positive response) |
| UT-39 | `7F 0C 1A F8` | Error `WRONG_SERVICE` (negative-response marker) |

### 3.8 Wrong PID (FR-05)

| ID | Input | Expected |
|---|---|---|
| UT-40 | `41 0D 1A F8` | Error `WRONG_PID` |
| UT-41 | `41 00 1A F8` | Error `WRONG_PID` |
| UT-42 | `41 0B 1A F8` | Error `WRONG_PID` (adjacent value below the target) |

### 3.9 Check-order precedence (requirements Section 8)

Fixed order: empty, byte count, byte syntax, service, PID, decode.

| ID | Input | Faults present | Expected |
|---|---|---|---|
| UT-43 | `41 0C 1G` | Count and syntax | Error `WRONG_BYTE_COUNT` |
| UT-44 | `ZZ 0C 1A F8` | Syntax and service | Error `INVALID_BYTE` |
| UT-45 | `42 0C 1G F8` | Service and syntax | Error `INVALID_BYTE` |
| UT-46 | `41 0D 1G F8` | PID and syntax | Error `INVALID_BYTE` |
| UT-47 | `42 0D 1A F8` | Service and PID | Error `WRONG_SERVICE` |

### 3.10 Robustness

| ID | Scenario | Expected |
|---|---|---|
| UT-48 | Input is `undefined`, `null`, the number `123`, `true`, `{}`, or `[]` (one test per value) | Error `EMPTY`; no exception; value is never coerced to a string |
| UT-49 | Input is a string of 10,000 tokens | Error `WRONG_BYTE_COUNT`; no exception |
| UT-50 | Call sequence: invalid input, valid input, invalid input, valid input | Each result depends only on its own input; results equal those of fresh single calls |
| UT-51 | Same valid input decoded twice | The two results are deeply equal (deterministic, no hidden state) |

### 3.11 Result contract

| ID | Scenario | Expected |
|---|---|---|
| UT-52 | Success result for UT-01 | `ok` is `true`; `bytes` has four integers in 0-255; `rpm` is a finite number; `normalized` and `display` are strings; no `code` and no `message` property |
| UT-53 | Any error result | `ok` is `false`; `code` is a non-empty string; `message` is a non-empty string; no `rpm`, `bytes`, `normalized`, or `display` property (so no stale RPM can be shown) |
| UT-54 | One error vector per code (UT-19, UT-24, UT-29, UT-37, UT-40) | `message` equals the exact text in swdd.md Section 5 for that code |
| UT-55 | Union of `code` values across all error vectors in this document | Exactly the set `EMPTY`, `WRONG_BYTE_COUNT`, `INVALID_BYTE`, `WRONG_SERVICE`, `WRONG_PID` (stable codes, no others) |

Exact message texts for UT-54:

| Code | Message |
|---|---|
| `EMPTY` | Enter four hexadecimal bytes, for example: 41 0C 1A F8. |
| `WRONG_BYTE_COUNT` | Enter exactly four bytes: service, PID, A, and B. |
| `INVALID_BYTE` | Each byte must contain exactly two hexadecimal characters. |
| `WRONG_SERVICE` | This is not a positive response for Mode 01; expected service 41. |
| `WRONG_PID` | This response is for a different PID; expected 0C (engine speed). |

### 3.12 Calculation and formatting helpers (FR-07)

These tests apply because `calculateRpm` and `formatRpm` are exported (resolved in open item 8.1).

| ID | Call | Expected |
|---|---|---|
| UT-56 | `calculateRpm(0x1A, 0xF8)`; `calculateRpm(0, 1)`; `calculateRpm(255, 255)` | 1726; 0.25; 16383.75 |
| UT-57 | `formatRpm` for 0, 0.25, 0.5, 1.5, 64, 1726, 16320, 16383.75 | `0 rpm`, `0.25 rpm`, `0.5 rpm`, `1.5 rpm`, `64 rpm`, `1,726 rpm`, `16,320 rpm`, `16,383.75 rpm` (thousands grouping; no trailing zeroes; no rounding) |
| UT-58 | `display` of a successful decode of UT-01, UT-05, UT-14 | `1,726 rpm`, `0.25 rpm`, `16,383.75 rpm`; equals `formatRpm(rpm)` |

### 3.13 Exhaustive and static checks (QR-01, QR-02, QR-06)

| ID | Scenario | Expected |
|---|---|---|
| UT-59 | For every A and B in 0-255, decode `41 0C <A> <B>` written as two-digit hex | `ok` is `true`; `rpm * 4` is an integer equal to `A * 256 + B`; `rpm` is between 0 and 16383.75; the number parsed back from `display` (commas and ` rpm` removed) equals `rpm` (no rounding for any input) |
| UT-60 | Read `src/decoder.js` as text | Contains none of: `document`, `window`, `fetch`, `XMLHttpRequest`, `localStorage`, `sessionStorage`, `console`, `innerHTML`, `eval`; contains no `import` statements |

UT-59 is fast (65,536 iterations of a pure function) and gives independent evidence for FR-07, because it checks the displayed value against the input bytes rather than against a copy of the formula.

### 3.14 Compact input form (FR-11)

The compact form is exactly one token of exactly 8 characters after trimming; it is split into four 2-character bytes before the normal pipeline runs (swdd.md 3.1.4). Mixed grouping is covered by UT-27.

| ID | Input | Expected |
|---|---|---|
| UT-62 | `410C1AF8` | ok; `rpm` 1726; `bytes` [0x41, 0x0C, 0x1A, 0xF8]; `normalized` `41 0C 1A F8`; `display` `1,726 rpm` (requirements acceptance example) |
| UT-63 | `410c1af8` and `410C1af8` | ok; same result as UT-62 (letter case ignored, `normalized` upper-case) |
| UT-64 | `  410C1AF8  `, `410C1AF8\r\n`, `\t410C1AF8` | ok; same result as UT-62 (surrounding whitespace trimmed before the token length is checked) |
| UT-65 | `410C0000`, `410C0001`, `410C00FF`, `410C8000`, `410CFFFF` | ok; `rpm` 0, 0.25, 63.75, 8192, 16383.75 (boundaries in compact form) |
| UT-66 | `410C1A` (6), `410C1AF` (7), `410C1AF80` (9), `410C1AF800` (10) | Error `WRONG_BYTE_COUNT` (a single token that is not 8 characters is not expanded) |
| UT-67 | `410C1AG8`, `0x410C1A`, `410C1A.8`, full-width `４１` followed by `0C1AF8` | Error `INVALID_BYTE` (8-character token is split, then fails the syntax check) |
| UT-68 | `420C1AF8`, `010C1AF8` | Error `WRONG_SERVICE` |
| UT-69 | `410D1AF8`, `41001AF8` | Error `WRONG_PID` |
| UT-70 | `420D1AF8` (service and PID); `410D1AG8` (PID and syntax) | Error `WRONG_SERVICE`; Error `INVALID_BYTE` (same precedence as the spaced form) |
| UT-71 | For every A and B in 0-255, decode the compact string `410C<AA><BB>` and the spaced string `41 0C <AA> <BB>` | The two results are deeply equal (equivalence of the two forms for all 65,536 inputs) |

No test is specified for a token of 8 characters in which the split would separate a surrogate pair: such input fails the byte syntax check like any other non-hex content (UT-67 covers non-hex content).

## 4. Test data

| Data set | Values | Used by |
|---|---|---|
| Reference response | `41 0C 1A F8` (1726 rpm: 0x1A = 26; 26 * 256 = 6656; 6656 + 248 = 6904; 6904 / 4 = 1726) and its compact form `410C1AF8` | UT-01 to UT-03, UT-15 to UT-18, UT-52, UT-58, UT-62 to UT-64 |
| Boundary bytes | 0x00, 0x01, 0x02, 0x03, 0x04, 0x7F, 0x80, 0xFF for B or A | UT-04 to UT-14, UT-65 |
| Invalid syntax tokens | `1G`, `1`, `1AF`, `0x41`, `-1`, `+1`, `1.`, `４１`, U+FB00 | UT-29 to UT-36, UT-61 |
| Compact tokens | 6, 7, 9, 10 characters (wrong length); `410C1AG8`, `0x410C1A`, `410C1A.8` (invalid); `420C1AF8`, `010C1AF8`, `410D1AF8`, `41001AF8` | UT-66 to UT-70 |
| Non-service values | `42`, `01`, `7F` | UT-37 to UT-39 |
| Non-target PIDs | `0D`, `00`, `0B` | UT-40 to UT-42 |
| Non-string values | `undefined`, `null`, `123`, `true`, `{}`, `[]` | UT-48 |

All data is synthetic; no real vehicle data is used (requirements Section 14).

## 5. Requirements traceability

| Requirement | Unit tests | Other verification |
|---|---|---|
| FR-01 | None | Manual UI check (swdd.md 6.2) |
| FR-02 | UT-01 to UT-03, UT-15 to UT-18, UT-63 | |
| FR-03 | UT-19 to UT-36, UT-43 to UT-46, UT-48, UT-49, UT-53, UT-61, UT-66, UT-67 | |
| FR-04 | UT-37 to UT-39, UT-44, UT-45, UT-47, UT-68 | |
| FR-05 | UT-40 to UT-42, UT-46, UT-47, UT-69 | |
| FR-06 | UT-01, UT-04 to UT-14, UT-52, UT-56, UT-59, UT-62, UT-65, UT-71 | |
| FR-07 | UT-05 to UT-07, UT-09, UT-14, UT-57 to UT-59 | |
| FR-08 | UT-50, UT-53 (core-level: no stale data in results) | Manual error and stale-state check for the UI |
| FR-09 | None | Manual keyboard and accessibility checks |
| FR-10, QR-02 | UT-60 (no network, storage, or logging in the decoder) | Manual network-panel privacy check |
| FR-11 | UT-27, UT-28, UT-62 to UT-71 | Manual check: enter `410C1AF8` in the UI and read the hint text (swdd.md 6.2) |
| QR-01 | All decoder tests | |
| QR-06 | UT-60; tests import only the decoder | Code review |
| Requirements Section 8 (error messages, check order) | UT-43 to UT-47, UT-54, UT-55, UT-70 | |
| Requirements Section 10 (minimum decoder tests 1-14) | See mapping below | |

Mapping to the fourteen minimum tests in requirements Section 10:

| Requirements test | Unit test |
|---|---|
| 1. `41 0C 1A F8` gives 1726 | UT-01 |
| 2. `41 0C 00 01` gives 0.25 | UT-05 |
| 3. `41 0C FF FF` gives 16383.75 | UT-14 |
| 4. Lowercase accepted | UT-02 |
| 5. Leading and trailing whitespace | UT-15 |
| 6. Empty input rejected | UT-19 to UT-21 |
| 7. Too few and too many bytes | UT-22 to UT-26 |
| 8. Malformed byte | UT-29 to UT-36 |
| 9. Service other than `41` | UT-37 to UT-39 |
| 10. PID other than `0C` | UT-40 to UT-42 |
| 11. Compact form `410C1AF8` gives 1726 and is normalized | UT-62 |
| 12. Compact token of wrong length | UT-66 |
| 13. Compact token with non-hex character | UT-67 |
| 14. Mixed grouping rejected | UT-27 |

## 6. Planned structure of the test file

`test/decoder.test.js`, grouped by suite so that a failure points to one area:

| Suite | Contains |
|---|---|
| Valid responses | UT-01 to UT-03 |
| Calculation and boundaries | UT-04 to UT-14, UT-56 |
| Whitespace | UT-15 to UT-18 |
| Empty input | UT-19 to UT-21 |
| Byte count | UT-22 to UT-28 |
| Byte syntax | UT-29 to UT-36, UT-61 |
| Service and PID | UT-37 to UT-42 |
| Check order | UT-43 to UT-47 |
| Robustness | UT-48 to UT-51 |
| Result contract | UT-52 to UT-55 |
| Formatting | UT-57, UT-58 |
| Exhaustive and static | UT-59, UT-60 |
| Compact input form | UT-62 to UT-71 |

## 7. Entry, exit, and quality criteria

Entry:

- `src/decoder.js` exists and exports the public API from swdd.md 3.1.3.
- This document is reviewed against the requirements and the design.

Exit (all must hold):

- Every test in Section 3 is implemented, and `npm test` passes with zero failures and zero skipped tests.
- `node --check` passes for the decoder and the test file.
- Each error code is produced by at least one test, and every decision in the swdd.md 3.1.4 pipeline is exercised to both outcomes (informational coverage report is acceptable evidence).
- No test depends on execution order, wall-clock time, or the network.
- Results are reported as run; no test is claimed as passing unless it was executed.

Pull-request checklist for the test change:

- Expected values were checked by hand against the formula, not copied from decoder output.
- A deliberate defect (for example wrong byte order, rounding to an integer, or swapped service and PID checks) makes at least one test fail. This is a review-time mutation check, done manually.
- Copilot-generated tests were reviewed against this document before merge.

## 8. Assumptions and open items

1. **Location of formatting (resolved).** Formatting stays in the decoder as designed in swdd.md 3.1 (decision recorded for FR-11). UT-56 to UT-58 apply, and `display` remains part of the success contract (UT-52). `.github/workflows/copilot-instructions.md` must not contradict this.
2. **Unicode whitespace.** The design splits on `\s`, which in JavaScript also matches non-breaking space and other Unicode spaces. The requirements do not say whether these should be accepted. No test is specified; add one once the intended behavior is confirmed.
3. **UI logic.** DOM behavior (stale-result clearing, focus, `aria-invalid`, live-region announcement) is verified manually. A no-dependency DOM test can be reconsidered if `app.js` grows logic beyond calling the decoder and setting `textContent`.
4. **Standard verification.** The service, PID, and formula must be checked against an authorized, current SAE J1979 reference. The hand-computed vectors in Section 3.2 assume the formula stated in the requirements.
5. **Deletion of earlier code.** The previous implementation and tests were removed. This design describes the tests to write against the implementation and does not assume anything from the removed files.
