# Software Detailed Design (SWDD): RPM Lens

Source: [j1979-pid-mvp-training-requirements.md](j1979-pid-mvp-training-requirements.md)

## 1. Introduction

### 1.1 Purpose

This document describes the detailed design of RPM Lens, a browser-only tool that validates and decodes a simulated SAE J1979 Mode 01 PID 0C (engine speed) response. It is the basis for implementation, unit testing, and deployment.

### 1.2 Scope

- One single-page web application with one decoder (Mode 01, PID 0C).
- Manual entry of four hexadecimal bytes (service, PID, A, B).
- Static hosting on AWS (private S3 origin behind CloudFront with OAC), deployed by GitHub Actions using OIDC.
- Out of scope: vehicle/adapter connectivity, other PIDs or protocols, persistence, accounts, analytics, and any diagnostic claim.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| PID | Parameter ID of an OBD-II Mode 01 request/response |
| Service | First response byte; `41` for a positive Mode 01 response |
| A, B | Data bytes 3 and 4 of the response (unsigned, 0-255) |
| OAC | CloudFront Origin Access Control |
| OIDC | OpenID Connect federation between GitHub Actions and AWS IAM |

### 1.4 Design constraints

- Semantic HTML, CSS, and ES-module JavaScript; no runtime framework or external runtime library (QR-05).
- Decoder logic must be pure and DOM-free (QR-06).
- No entered data may be transmitted, stored, or logged (FR-10, QR-02).
- Tests use the Node.js built-in test runner.
- The document does not reproduce protected SAE J1979 text; the formula and identifiers are only those needed for the exercise.

## 2. Architecture

### 2.1 Architectural style

Functional core / imperative shell:

- **Core** (`decoder` module): pure functions for parsing, validation, decoding, and formatting.
- **Shell** (`app` module): reads the DOM, calls the core, renders result/error state.
- **Presentation** (`index.html`, `styles.css`): structure, accessibility semantics, and styling.

### 2.2 Context and deployment view

```mermaid
flowchart LR
    U[User browser] -->|HTTPS| CF[CloudFront distribution]
    CF -->|OAC, SigV4| S3[(Private S3 bucket)]
    GH[GitHub Actions] -->|OIDC assume role| IAM[IAM deployment role]
    IAM --> CFN[CloudFormation stack]
    CFN --> CF
    CFN --> S3
    GH -->|sync assets| S3
    GH -->|invalidate| CF
```

The browser only downloads static assets. Decoding runs locally; no request carries user input.

### 2.3 Module view

```mermaid
flowchart TD
    HTML[index.html] --> APP[src/app.js]
    HTML --> CSS[src/styles.css]
    APP --> DEC[src/decoder.js]
    TEST[test/decoder.test.js] --> DEC
```

`decoder.js` has no imports and no DOM/global dependencies. `app.js` is the only module that touches the DOM.

### 2.4 Proposed repository layout

```text
/
  index.html
  src/
    decoder.js
    app.js
    styles.css
  test/
    decoder.test.js
  infra/
    site.yaml
  .github/
    workflows/
      ci-cd.yml
  package.json
  README.md
  docs/
    swdd.md
```

## 3. Component design

### 3.1 Decoder module (`src/decoder.js`)

**Responsibility:** convert a raw input string into a structured success or error result. Covers FR-02 to FR-07, QR-01, QR-06.

#### 3.1.1 Constants

| Name | Value | Purpose |
|---|---|---|
| `EXPECTED_SERVICE` | `0x41` | Positive response to Mode 01 |
| `EXPECTED_PID` | `0x0C` | Engine speed |
| `EXPECTED_BYTE_COUNT` | `4` | Service, PID, A, B |
| `BYTE_PATTERN` | `/^[0-9A-F]{2}$/` | Applied to case-normalized tokens |

#### 3.1.2 Data contracts

Success result:

```text
{
  ok: true,
  bytes: [number, number, number, number],   // parsed values
  normalized: "41 0C 1A F8",                 // upper-case, single-space separated
  rpm: number,                               // e.g. 1726, 0.25
  display: "1,726 rpm"                       // formatted for the UI
}
```

Error result:

```text
{
  ok: false,
  code: "EMPTY" | "WRONG_BYTE_COUNT" | "INVALID_BYTE" | "WRONG_SERVICE" | "WRONG_PID",
  message: string                            // user-facing text from Section 5
}
```

Expected validation failures are returned, never thrown. Non-string input is treated as empty.

#### 3.1.3 Functions

| Function | Signature | Description |
|---|---|---|
| `decodeRpmResponse` | `(input: string) => Result` | Public entry point; runs the pipeline in 3.1.4 |
| `calculateRpm` | `(a: number, b: number) => number` | `((a * 256) + b) / 4` |
| `formatRpm` | `(rpm: number) => string` | Formats with `en-US` grouping, 0 to 2 fraction digits, appends ` rpm` |

`formatRpm` uses `Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })`. Because valid values are multiples of 0.25, two fraction digits never round a valid value (FR-07).

#### 3.1.4 Processing pipeline

Order is fixed (Requirements Section 8) so that results are deterministic.

```mermaid
flowchart TD
    A[input] --> B[trim and split on whitespace]
    B --> C{empty?}
    C -- yes --> E1[EMPTY]
    C -- no --> D{token count == 4?}
    D -- no --> E2[WRONG_BYTE_COUNT]
    D -- yes --> F{all tokens match 2 hex chars?}
    F -- no --> E3[INVALID_BYTE]
    F -- yes --> G[uppercase and parse to numbers]
    G --> H{service == 0x41?}
    H -- no --> E4[WRONG_SERVICE]
    H -- yes --> I{pid == 0x0C?}
    I -- no --> E5[WRONG_PID]
    I -- yes --> J[calculateRpm A,B]
    J --> K[ok result]
```

Notes:

- Splitting uses `/\s+/` after `trim()`, so leading/trailing/multiple spaces are tolerated consistently.
- A single-token string such as `410C1AF8` yields `WRONG_BYTE_COUNT`; input is not silently re-tokenized.
- Range: A, B in 0-255 gives 0 to 16,383.75 rpm.

#### 3.1.5 Worked examples

| Input | Outcome |
|---|---|
| `41 0C 1A F8` | ok, 1726, `1,726 rpm` |
| `41 0c 1a f8` | ok, normalized `41 0C 1A F8` |
| `41 0C 00 01` | ok, 0.25, `0.25 rpm` |
| `41 0C FF FF` | ok, 16383.75, `16,383.75 rpm` |
| `` (empty/whitespace) | `EMPTY` |
| `41 0C F8` | `WRONG_BYTE_COUNT` |
| `41 0C 1A F8 00` | `WRONG_BYTE_COUNT` |
| `41 0C 1G F8` | `INVALID_BYTE` |
| `42 0C 1A F8` | `WRONG_SERVICE` |
| `41 0D 1A F8` | `WRONG_PID` |

### 3.2 UI controller module (`src/app.js`)

**Responsibility:** wire the form to the decoder and render state. Covers FR-01, FR-08, FR-09.

#### 3.2.1 Elements (by id)

| Id | Element | Role |
|---|---|---|
| `decode-form` | `form` | Submit handler target (Enter key and button both submit) |
| `response-input` | `input type="text"` | Response entry; labeled, `aria-describedby` points to hint and status |
| `decode-button` | `button type="submit"` | Decode action |
| `result` | `div role="status" aria-live="polite"` | Shows success or error text |

#### 3.2.2 Behavior

1. On `DOMContentLoaded`, look up elements and register a `submit` listener.
2. On submit: `preventDefault()`; clear result and error state (FR-08); call `decodeRpmResponse(input.value)`.
3. On success: render the `display` value and the accepted response `normalized`; set the result region to the success style; clear `aria-invalid` on the input.
4. On failure: render `message` in the same live region with an error style and a text prefix ("Error:"); set `aria-invalid="true"` on the input; return focus to the input.
5. Rendering uses `textContent` only; no `innerHTML` (prevents injection from user input).

#### 3.2.3 State model

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Success: Decode, valid
    Idle --> Error: Decode, invalid
    Success --> Success: Decode, valid (result replaced)
    Success --> Error: Decode, invalid (result cleared)
    Error --> Success: Decode, valid
    Error --> Error: Decode, invalid (message replaced)
```

Every transition clears the previous state before rendering the new one, so a stale RPM is never shown alongside an error.

### 3.3 Presentation (`index.html`, `src/styles.css`)

- Single responsive page: title, one-line description, labeled input, Decode button, result region, educational-use notice.
- The label text states the expected format ("Mode 01 PID 0C response: four hex bytes"); the example `41 0C 1A F8` is shown as a placeholder/hint only and is not auto-accepted.
- Script is loaded as `<script type="module" src="src/app.js">`.
- Status is conveyed by text as well as color; contrast meets WCAG AA (4.5:1 for body text).
- Visible focus indicator on all interactive controls; layout works from narrow mobile widths to desktop.
- No external fonts, scripts, analytics, or network calls.

### 3.4 Infrastructure (`infra/site.yaml`)

CloudFormation template defining:

| Resource | Key settings |
|---|---|
| S3 bucket | All public access blocked; server-side encryption; no website hosting endpoint |
| Origin Access Control | Origin type `s3`, signing behavior `always`, SigV4 |
| CloudFront distribution | Default root object `index.html`; viewer protocol `redirect-to-https`; S3 origin with OAC; compression enabled |
| Bucket policy | Allows `s3:GetObject` only to `cloudfront.amazonaws.com` with `AWS:SourceArn` equal to the distribution ARN |

Outputs: bucket name and CloudFront distribution id and domain name (used by the workflow for upload, invalidation, and reporting).

### 3.5 CI/CD (`.github/workflows/ci-cd.yml`)

```mermaid
flowchart LR
    PR[Pull request] --> V[verify job]
    PUSH[Push to main] --> V
    V --> D[deploy job, main only]
    D --> S1[Assume role via OIDC]
    S1 --> S2[Deploy CloudFormation]
    S2 --> S3[Sync assets to S3]
    S3 --> S4[Invalidate CloudFront]
    S4 --> S5[Report URL]
```

| Job | Trigger | Steps |
|---|---|---|
| `verify` | Pull request, push to `main` | Checkout; set up Node.js 20+; syntax check of JS files; `npm test` |
| `deploy` | Push to `main` or manual dispatch, after `verify` succeeds | Configure AWS credentials via OIDC; `cloudformation deploy`; read stack outputs; `s3 sync` of `index.html` and `src/`; CloudFront invalidation; write CloudFront URL to the job summary |

Security settings:

- Workflow permissions: `contents: read`, `id-token: write` (deploy job only).
- Role ARN and region come from repository variables `AWS_ROLE_ARN` and `AWS_REGION`; no long-lived keys.
- IAM trust policy restricts `aud` to `sts.amazonaws.com` and `sub` to this repository's `main` branch or environment.
- Role permissions limited to the training stack, its S3 bucket, and CloudFront invalidation.
- Third-party actions are pinned according to organizational policy.

Rollback: redeploy the last known good commit or revert and redeploy; do not delete the stack as the default recovery.

## 4. Requirements traceability

| Requirement | Design element |
|---|---|
| FR-01 | 3.2.1 form, input, button; 3.3 label and format text |
| FR-02 | 3.1.4 case normalization and space splitting |
| FR-03 | 3.1.4 EMPTY, WRONG_BYTE_COUNT, INVALID_BYTE |
| FR-04 | 3.1.4 WRONG_SERVICE |
| FR-05 | 3.1.4 WRONG_PID |
| FR-06 | 3.1.3 `calculateRpm`; 3.1.5 examples |
| FR-07 | 3.1.3 `formatRpm` |
| FR-08 | 3.2.2 step 2; 3.2.3 state model |
| FR-09 | 3.2.1 label, `role="status"`, `aria-live`, `aria-invalid`; 3.3 focus and contrast |
| FR-10 | 2.2 and 3.3: no network calls; decoding in the browser |
| QR-01 | 3.1.4, 6.1 unit tests |
| QR-02 | 3.2.2 step 5; 3.3 no analytics; 7 |
| QR-03 | 3.2.1, 3.3, 6.2 |
| QR-04 | 3.3 standard HTML/CSS/ES modules only; 6.2 |
| QR-05 | 1.4 no runtime dependencies |
| QR-06 | 2.1, 2.3, 3.1 |
| QR-07 | 3.4, 3.5 |
| QR-08 | 3.4 blocked public access, OAC, bucket policy |

## 5. Error messages

| Code | Message |
|---|---|
| `EMPTY` | Enter four hexadecimal bytes, for example: 41 0C 1A F8. |
| `WRONG_BYTE_COUNT` | Enter exactly four bytes: service, PID, A, and B. |
| `INVALID_BYTE` | Each byte must contain exactly two hexadecimal characters. |
| `WRONG_SERVICE` | This is not a positive response for Mode 01; expected service 41. |
| `WRONG_PID` | This response is for a different PID; expected 0C (engine speed). |

Messages are plain language, contain no stack traces, and are the only user-visible error text.

## 6. Test design

### 6.1 Decoder unit tests (`test/decoder.test.js`)

| # | Case | Expected |
|---|---|---|
| 1 | `41 0C 1A F8` | ok, rpm 1726 |
| 2 | `41 0C 00 01` | ok, rpm 0.25 |
| 3 | `41 0C FF FF` | ok, rpm 16383.75 |
| 4 | `41 0c 1a f8` | ok, normalized upper-case |
| 5 | `  41 0C 1A F8  ` | ok, same as case 1 |
| 6 | empty and whitespace-only | `EMPTY` |
| 7 | 3 bytes; 5 bytes | `WRONG_BYTE_COUNT` |
| 8 | `41 0C 1G F8`; `41 0C 1 F8`; `41 0C 1AF F8` | `INVALID_BYTE` |
| 9 | `42 0C 1A F8` | `WRONG_SERVICE` |
| 10 | `41 0D 1A F8` | `WRONG_PID` |
| 11 | Order check: `42 0D 1A F8` | `WRONG_SERVICE` (service checked before PID) |
| 12 | `formatRpm` for 1726, 0.25, 1.5 | `1,726 rpm`, `0.25 rpm`, `1.5 rpm` |
| 13 | Non-string input (`undefined`, `null`) | `EMPTY`, no exception |

### 6.2 UI and deployment checks (manual)

| Check | Procedure | Expected |
|---|---|---|
| Smoke | Load the deployed URL, decode the example | `1,726 rpm` displayed |
| Error and stale-state | Decode valid input, then invalid input | Error shown; old RPM gone |
| Keyboard | Tab to input, type, press Enter/activate Decode | Result shown and announced |
| Accessibility scan | Automated scan if available | No critical violations |
| Privacy | Inspect browser network panel while decoding | No requests carrying input |
| Compatibility | Repeat smoke test in one current Chrome, Edge, or Firefox | Same result |
| Infrastructure | Review template and IAM role | Private bucket, OAC, HTTPS redirect, least privilege |

## 7. Security and privacy design

- Entered bytes exist only in the input element and local variables; they are not stored (no `localStorage`, cookies, or logs) and not sent over the network.
- No `innerHTML`, `eval`, or dynamic script loading; results rendered with `textContent`.
- No third-party runtime scripts, fonts, or analytics.
- S3 origin is private; CloudFront enforces HTTPS redirect.
- Deployment uses short-lived OIDC credentials scoped to the repository and branch.
- The page shows an educational-use notice and makes no J1979 conformance or diagnostic claim.

## 8. Assumptions and open items

- "ITID /PID" is interpreted as an OBD-II PID; Mode 01 PID 0C is the target. Confirm with the requester.
- The service, PID, and formula must be verified against an authorized, current SAE J1979 reference before any production use.
- Requirement wording for FR-07 is satisfied by `en-US` grouping with up to two fraction digits; a different locale is not required.
- Extending to other PIDs would require introducing a decoder registry; this is intentionally deferred.
