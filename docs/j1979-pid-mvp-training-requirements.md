# GitHub Copilot Training: J1979 Engine RPM PID Decoder

## 1. Document purpose

This document defines a small, end-to-end software MVP and a 16-hour instructor-led training plan. Participants will use GitHub Copilot as an assistant while practicing requirement engineering, design, implementation, testing, refactoring, code review, CI/CD, and deployment to AWS.

**Interpretation:** “ITID /PID” is taken to mean an OBD-II PID defined by SAE J1979. The selected example is **Mode 01 PID 0C: engine speed (RPM)**. If “ITID” refers to a different named protocol or PID, confirm that before using this brief.

## 2. MVP at a glance

**Product name:** RPM Lens

**Problem:** A learner or technician has a hexadecimal OBD-II response and wants to see whether it is a valid response for the engine-speed PID and what RPM it represents.

**Solution:** A browser-based tool accepts a simulated Mode 01 PID 0C response, validates it, and displays the decoded engine speed. It uses synthetic/manual input only; it does not connect to a vehicle or OBD adapter.

**Example:** Given response bytes `41 0C 1A F8`, display `1,726 rpm`, since `((0x1A * 256) + 0xF8) / 4 = 1726`.

**Primary user:** A trainee learning to interpret a basic OBD-II response.

**MVP success measure:** A first-time user can enter a valid response, understand the decoded RPM, and recover from invalid input without assistance. In a class demonstration, at least 4 of 5 test cases produce the expected result.

## 3. Scope and boundaries

### In scope

- One single-page web application.
- One decoder: Mode 01 PID 0C engine speed.
- Manual entry of exactly four response bytes: service, PID, A, and B.
- Input accepts hexadecimal bytes separated by spaces, or the same four bytes as one compact 8-digit token without separators; letter case is ignored.
- Validation for malformed hex, incorrect byte count, unexpected response service, and unexpected PID.
- Display decoded RPM and the accepted response bytes.
- Unit tests, browser-level smoke testing, automated CI, and repeatable AWS deployment.
- Infrastructure defined as code and deployment authentication using GitHub Actions OIDC.

### Out of scope

- Connecting to a vehicle, OBD-II adapter, CAN interface, or external service.
- Reading live vehicle data or sending commands to a vehicle.
- Other services, PIDs, protocols, freeze-frame data, trouble codes, or manufacturer-specific decoding.
- User accounts, persistence, analytics, telemetry, or personal data collection.
- A claim that the application is a certified diagnostic or safety tool.

## 4. Domain rule and standards handling

For the selected positive response, the first byte is the positive response service (`41`), the second byte is the PID (`0C`), and the final two bytes are data bytes A and B. Decode engine speed as:

`RPM = ((A * 256) + B) / 4`

A and B are unsigned bytes from 0 through 255. The decoded value can range from 0 through 16,383.75 RPM, in quarter-RPM increments. The user interface must not round away valid quarter-RPM values.

This brief includes only the minimum identifiers and calculation needed for the exercise. It does not reproduce SAE J1979 tables or other protected text. The instructor or organization is responsible for providing participants with lawful access to the applicable, current standard and confirming any licensing requirements. Verify the selected PID and response interpretation against that authorized reference before production use.

## 5. Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-01 | The application shall present a clearly labeled field for a Mode 01 PID 0C response and a Decode action. | The page identifies the expected input as four hexadecimal bytes and provides an operable Decode button. |
| FR-02 | The application shall accept four space-separated hexadecimal bytes, with either letter case. | `41 0C 1A F8` and `41 0c 1a f8` are accepted. |
| FR-03 | The application shall reject empty input, malformed bytes, and any input not containing exactly four bytes (the compact form in FR-11 counts as four bytes). | No result is shown; a concise, actionable error is displayed. Examples: empty input, `41 0C 1G F8`, `41 0C F8`, and `41 0C 1A F8 00`. |
| FR-04 | The application shall confirm that the response service is `41`. | A syntactically valid response with another service is rejected with a service-specific message. |
| FR-05 | The application shall confirm that the response PID is `0C`. | A syntactically valid response for another PID is rejected with a PID-specific message. |
| FR-06 | The application shall decode bytes A and B using the formula in Section 4. | `41 0C 1A F8` returns 1726 RPM; `41 0C 00 01` returns 0.25 RPM; `41 0C FF FF` returns 16,383.75 RPM. |
| FR-07 | The application shall show the decoded value with the unit `rpm`, retaining up to two decimal places and omitting unnecessary trailing zeroes. | Values such as 1726, 0.25, and 1.5 display without rounding or misleading precision. |
| FR-08 | A new decode attempt shall replace the previous result or error. | After a valid decode, entering invalid input and decoding does not leave the old RPM presented as the current result. |
| FR-09 | The application shall be usable by keyboard and expose input labels and result/error state to assistive technology. | The input has a programmatic label; controls are keyboard-operable; status messages are announced using an appropriate live region. |
| FR-10 | The application shall work without network access after the page assets have loaded. | The decoder executes entirely in the browser and sends no response bytes to a server. |
| FR-11 | The application shall also accept the four response bytes entered as a single 8-character hexadecimal token with no separators, with either letter case, and shall treat the result exactly as the spaced form. | `410C1AF8` and `410c1af8` return 1726 rpm with accepted response `41 0C 1A F8`. A single token that is not exactly 8 characters (for example `410C1A` or `410C1AF800`) is rejected as a wrong byte count. An 8-character token with a non-hexadecimal character (for example `410C1AG8`) is rejected as an invalid byte. Mixed grouping such as `410C 1AF8` is not accepted and is rejected as a wrong byte count. |

## 6. Quality requirements

| ID | Requirement | Verification |
|---|---|---|
| QR-01 | Correctness: accepted inputs shall be decoded deterministically according to Section 4. | Unit tests cover normal, fractional, minimum, maximum, and invalid cases. |
| QR-02 | Security and privacy: the application shall not collect, store, or transmit entered response bytes. | Inspect implementation and browser network requests; no analytics or backend endpoint is present. |
| QR-03 | Accessibility: controls and feedback shall be available by keyboard and screen reader, with readable contrast. | Keyboard-only smoke test and automated accessibility scan if available. |
| QR-04 | Compatibility: the page shall support current stable versions of Chrome, Edge, and Firefox. | Perform a smoke test in at least one current desktop browser; broader coverage is a stretch goal. |
| QR-05 | Performance: initial page assets shall be small enough to load promptly on a typical broadband connection. | Keep the page dependency-light; record the built asset size during review. No external runtime library is required. |
| QR-06 | Maintainability: decoding and input validation shall be separated from DOM rendering so decoder logic can be tested independently. | Code review confirms a pure decoder module and focused tests. |
| QR-07 | Deployability: the application shall be reproducibly deployable to an AWS test environment from the main branch. | Successful CI/CD run and reachable CloudFront URL. |
| QR-08 | Resilience: deployment shall avoid exposing the S3 bucket directly to the public internet. | Infrastructure review confirms private S3 origin access through CloudFront. |

## 7. User stories and acceptance scenarios

### US-01: Decode a valid engine-speed response

As a learner, I want to enter a positive response for PID 0C and see the engine speed, so that I can verify my interpretation.

**Scenario:** Standard response

- Given the application is loaded
- When I enter `41 0C 1A F8` and activate Decode
- Then the application displays `1,726 rpm`
- And it identifies the accepted response as `41 0C 1A F8`

### US-02: Understand invalid input

As a learner, I want a useful validation message, so that I can correct an incorrectly entered response.

**Scenario:** Invalid hexadecimal byte

- Given the application is loaded
- When I enter `41 0C 1G F8` and activate Decode
- Then the application explains that each byte must be two hexadecimal characters
- And no decoded RPM is shown as the current result

### US-03: Detect a different response

As a learner, I want the application to distinguish a different service or PID from a valid target response.

**Scenario:** Wrong PID

- Given the application is loaded
- When I enter a well-formed four-byte response whose second byte is not `0C`
- Then the application reports that the response is not for PID `0C`
- And no RPM is presented

### US-04: Use the application accessibly

As a keyboard or screen-reader user, I want to enter a response and receive announced feedback, so that I can complete the same task.

**Scenario:** Keyboard interaction

- Given the application is loaded
- When I tab to the input, enter a valid response, and activate Decode from the keyboard
- Then the RPM result is visible and its status is programmatically announced

### US-05: Paste a response without spaces

As a learner, I want to paste a response exactly as it appears in a log or capture without inserting spaces, so that I do not have to reformat it by hand.

**Scenario:** Compact response

- Given the application is loaded
- When I enter `410C1AF8` and activate Decode
- Then the application displays `1,726 rpm`
- And it identifies the accepted response as `41 0C 1A F8`

## 8. Error behavior

Errors should explain the corrective action in plain language. Do not display a stack trace or silently coerce malformed input.

| Condition | Suggested message |
|---|---|
| Empty input | Enter four hexadecimal bytes, for example: 41 0C 1A F8. |
| Wrong byte count | Enter exactly four bytes: service, PID, A, and B. |
| Invalid byte format | Each byte must contain exactly two hexadecimal characters. |
| Wrong service | This is not a positive response for Mode 01; expected service 41. |
| Wrong PID | This response is for a different PID; expected 0C (engine speed). |

The validation order should be deterministic: trim and split input; expand a single 8-character token into four two-character bytes (FR-11); check byte count; validate byte syntax; normalize case; validate service; validate PID; decode. Clear stale result/error state at the start of each attempt.

## 9. Proposed design and implementation constraints

### User experience

- A single responsive page with a compact title, one labeled input, Decode button, and a dedicated result/error region.
- Include one example response as a placeholder or nearby example, not as an automatically accepted result.
- Keep validation close to the input and use text as well as color to communicate status.
- No decorative dashboard, login, or extra navigation is needed for this focused tool.

### Technical approach

- Front end: semantic HTML, CSS, and browser JavaScript using ES modules; no framework is required for this MVP.
- Decoder: pure function accepting a response string and returning a structured success result or a structured validation error. It must not access the DOM.
- Tests: Node.js built-in test runner for decoder unit tests; avoid adding a test framework unless the cohort needs one.
- Hosting: private Amazon S3 bucket as the static origin and Amazon CloudFront with Origin Access Control (OAC).
- Infrastructure: AWS CloudFormation template defines the bucket, CloudFront distribution, origin access, and required outputs.
- CI/CD: GitHub Actions runs tests and basic checks for pull requests; deployment from the protected main branch uses GitHub OIDC to assume a narrowly scoped AWS IAM role. Do not store long-lived AWS access keys in GitHub secrets.
- Deployment: upload static assets to S3 and invalidate CloudFront after a successful infrastructure/app deployment. Keep the distribution URL as a workflow output.

### Suggested repository layout

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
  package.json
  .github/
    workflows/
      ci-cd.yml
  README.md
```

The cohort may adjust filenames, but should preserve the separation between pure decoding, user-interface behavior, tests, infrastructure, and automation.

## 10. Test requirements

### Decoder unit tests

At minimum, test:

1. `41 0C 1A F8` decodes to 1726.
2. `41 0C 00 01` decodes to 0.25.
3. `41 0C FF FF` decodes to 16383.75.
4. Lowercase hex is accepted.
5. Leading/trailing whitespace is handled consistently.
6. Empty input is rejected.
7. Too few and too many bytes are rejected.
8. A malformed byte is rejected.
9. A response service other than `41` is rejected.
10. A PID other than `0C` is rejected.
11. The compact form `410C1AF8` decodes to 1726 and is normalized to `41 0C 1A F8`.
12. A compact token of the wrong length (6, 7, 9, or 10 characters) is rejected as a wrong byte count.
13. An 8-character compact token containing a non-hexadecimal character is rejected as an invalid byte.
14. Mixed grouping such as `410C 1AF8` is rejected as a wrong byte count.

### UI and deployment checks

- Smoke test: load the deployed page, decode the example, and confirm the result.
- Error test: submit malformed input and confirm the error is visible and stale output is cleared.
- Accessibility check: complete the workflow by keyboard and verify status announcements/labels.
- Privacy check: confirm entered bytes are not sent in network requests.
- Infrastructure review: verify bucket privacy, CloudFront OAC, HTTPS redirect, and least-privilege deployment permissions.

## 11. 16-hour training plan

Duration is 16 instructional hours. Breaks and lunch are excluded. Each two-hour block combines a short concept segment with a hands-on outcome. Adjust the split to cohort experience while retaining the deliverables and gates.

| Block | Topic and concept | Hands-on activity | Exit deliverable |
|---|---|---|---|
| 1 (2h) | Problem framing, stakeholders, scope, and requirement engineering; effective and responsible Copilot use. | Read the brief, identify assumptions and risks, refine one user story, create acceptance criteria, and agree on MVP boundaries. Use Copilot to draft alternatives, then verify them. | Prioritized backlog, clarified assumptions, and agreed acceptance criteria. |
| 2 (2h) | Example mapping, functional/nonfunctional requirements, and testable language. | Create a requirements-to-tests traceability table; turn the error rules and RPM boundaries into examples. Ask Copilot for edge cases and inspect for omissions. | Baseline requirement IDs and test scenarios. |
| 3 (2h) | Lightweight design, separation of concerns, browser architecture, accessibility, threat/privacy thinking. | Sketch the page and module boundaries; define decoder input/output/error contract; review hosting and deployment design. | One-page design note, interface contract, and deployment diagram/decision record. |
| 4 (2h) | Git workflow, repository setup, implementation planning, and code generation with Copilot. | Create the project skeleton; implement the pure decoder and validation flow in small increments. Review generated code against requirements. | Decoder implementation with initial unit tests. |
| 5 (2h) | Test design, boundaries, equivalence classes, and feedback loops. | Complete unit tests for valid, fractional, boundary, malformed, service, and PID cases; run tests locally and add the browser form/result behavior. | Passing automated unit tests and working local MVP. |
| 6 (2h) | Refactoring, readability, accessibility, and maintainability. | Refactor duplication or unclear control flow without changing behavior; add keyboard labels/status feedback; re-run tests and perform a peer walkthrough. | Refactored app, accessibility checklist, and passing regression suite. |
| 7 (2h) | Code review, CI/CD, cloud security basics, and infrastructure as code. | Open a pull request; use Copilot for a review checklist and alternative test ideas; peer-review actual diffs. Add GitHub Actions checks and CloudFormation for S3 + CloudFront. | Reviewed PR, green CI checks, and deployable infrastructure template. |
| 8 (2h) | AWS deployment, verification, rollback, and learning retrospective. | Configure GitHub OIDC trust and least-privilege role; deploy to a training AWS account; smoke-test the public CloudFront endpoint; demonstrate a safe rollback or redeploy. | Working AWS URL, successful pipeline run, deployment evidence, and retrospective. |

### Suggested time allocation inside each block

Use approximately 25-35 minutes for concepts and demonstration, 65-75 minutes for guided hands-on work, and 10-20 minutes for review, questions, or a short checkpoint. The instructor may rebalance this based on the group's experience. AWS account setup, GitHub access, and software installation must be completed before the 16 instructional hours.

## 12. Training outcomes

By the end of the course, each participant or team should be able to:

- Convert a small problem statement into scoped, testable requirements and acceptance criteria.
- Explain the chosen PID decoding rule and identify what must be verified against an authorized J1979 reference.
- Use GitHub Copilot to explore, implement, test, and review code while independently checking correctness and security.
- Separate domain logic from UI behavior and write useful boundary tests.
- Refactor while preserving behavior through automated regression tests.
- Conduct a practical pull-request review against requirements, tests, accessibility, privacy, and maintainability.
- Configure a GitHub Actions workflow for pull-request checks and main-branch deployment using OIDC.
- Deploy a private S3 + CloudFront static site to AWS, verify it, and describe a rollback path.

## 13. CI/CD and deployment acceptance criteria

A deployment is accepted only when all of the following are true:

1. Pull-request workflow runs the decoder test suite and fails when a test fails.
2. Pull-request workflow performs at least one additional low-cost quality check, such as JavaScript syntax checking or formatting/linting.
3. Main-branch deployment requires successful checks and uses GitHub OIDC; no long-lived AWS access key is committed or required.
4. CloudFormation creates or updates the site infrastructure reproducibly.
5. The S3 origin is not publicly readable; CloudFront is authorized to read it through OAC.
6. The deployed website is served over HTTPS and returns the expected example result.
7. The workflow reports the deployed CloudFront URL and deployment outcome.
8. A documented recovery path exists: redeploy the last known good commit/template or revert the change and redeploy. Do not delete the stack as the default rollback procedure.

## 14. Security, safety, and operational guardrails

- Use synthetic response data only. Do not connect to or control a vehicle during this training.
- Treat the tool as an educational decoder, not a diagnostic recommendation system.
- Do not send user input to a server; do not add analytics or logging of input values.
- Use a dedicated AWS training account or sandbox, set a budget alert, and delete training resources after the course according to the organization's retention policy.
- Review IAM trust conditions so only the intended repository and branch/environment can assume the deployment role.
- Limit deployment permissions to the specific training stack and required S3/CloudFront resources where practical.
- Never put AWS credentials, tokens, or other secrets in source control or Copilot prompts.
- Pin or constrain third-party GitHub Actions according to organizational policy.
- Keep the CloudFront distribution and S3 bucket in the same documented lifecycle; include cleanup instructions and note that CloudFront deletion may take several minutes.
- Do not claim conformance to a J1979 revision until validated against the authorized standard.

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| “ITID” means something other than an OBD-II PID. | Confirm terminology and target PID with the requester or instructor before the cohort starts. |
| Participants lack lawful access to the standard. | Arrange authorized access in advance; keep this exercise limited to the small formula and identifiers listed here. |
| AWS account, GitHub permissions, or OIDC setup consumes hands-on time. | Pre-provision a sandbox, repository permissions, and an approved OIDC role pattern; reserve setup validation before class. |
| CloudFront propagation delays disrupt the final exercise. | Deploy a starter stack before class or use a prepared account; explain propagation and start deployment before the final block ends. |
| Copilot suggests incorrect formulas or overcomplicated code. | Require tests from independently checked examples and review every generated change against the requirements and authorized reference. |
| Public hosting is mistaken for a trusted diagnostic product. | Display a concise educational-use notice and keep all values synthetic/manual; avoid diagnostic recommendations. |
| Training infrastructure incurs cost. | Use a budget alert, deploy only the required resources, and provide cleanup steps. |

## 16. Definition of Done

The MVP and training exercise are complete when:

- All in-scope functional requirements have implementation and test evidence.
- Normal, fractional, boundary, and invalid-input cases pass.
- The interface is keyboard-usable and presents clear validation feedback.
- No entered response bytes are transmitted or persisted.
- The pull-request CI workflow passes and a peer review is recorded.
- AWS infrastructure is deployed with a private S3 origin and CloudFront OAC over HTTPS.
- The deployed URL passes the documented smoke test.
- The team can explain the rollback/redeploy path and AWS cleanup steps.
- Assumptions, known limitations, and authorized-standard verification are recorded in the README or training notes.

## 17. Instructor preparation checklist

- Confirm the intended meaning of “ITID /PID” and the selected PID with the requester.
- Confirm current J1979 reference access and licensing for all participants.
- Create a GitHub repository/template with required organization policies understood.
- Prepare Node.js, Git, browser, and GitHub access on participant machines.
- Prepare an AWS sandbox, budget alert, approved IAM OIDC role pattern, and required service permissions.
- Test the full workflow from pull request through CloudFront deployment before class.
- Have a pre-deployed fallback stack and sample repository available in case account setup or propagation blocks the exercise.
- Share this requirements document and ask participants to bring questions about scope and acceptance criteria.

## 18. Completion evidence

The cohort should leave with:

- A prioritized, traceable set of requirements and acceptance scenarios.
- A short architecture/design note and identified assumptions.
- A working decoder web application and automated tests.
- A reviewed pull request with CI evidence.
- A GitHub Actions deployment workflow using OIDC.
- A deployed AWS CloudFront URL and successful smoke-test record.
- A brief retrospective listing one requirement, design, test, or review improvement for a future iteration.
