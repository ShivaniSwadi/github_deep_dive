# RPM Lens

RPM Lens is a small, browser-only learning tool for decoding a simulated SAE J1979 Mode 01 PID 0C engine-speed response. It accepts four hexadecimal bytes, with or without spaces (`41 0C 1A F8` or `410C1AF8`), and displays the calculated RPM. It does not connect to a vehicle or transmit the entered response.

This is an educational exercise, not a diagnostic product. Confirm the service/PID interpretation and formula against an authorized, current J1979 reference before relying on it.

## Design

The application uses a functional-core/imperative-shell structure:

- `src/decoder.js` validates, decodes, and formats input without touching the DOM.
- `src/app.js` handles form submission and renders the decoder result.
- `src/styles.css` and `index.html` define the responsive, accessible interface.
- `test/decoder.test.js` verifies the pure decoder with Node's built-in test runner; the test design is in `docs/ut.md` and `docs/ut-testcases.csv`.
- `tools/ut-csv-reporter.js` writes `reports/ut-report.csv` (generated, not tracked) during `npm test`.
- `tools/review-check.js` and `tools/stage-gate.js` run the mechanical review checks and the stage freeze (see Continuous integration).
- Deployment infrastructure (private S3 origin and HTTPS CloudFront distribution) is designed in `docs/swdd.md` but deferred; the CloudFormation template is not yet in the repository.

Expected validation failures are returned as structured results instead of being thrown as exceptions. A multi-PID strategy/registry is intentionally deferred until another PID is in scope.

## Run locally

Requires Node.js 20 or later for tests and Python 3 for the simple local static server.

```powershell
npm test
python -m http.server 8000
```

Open `http://localhost:8000` in a browser. Stop the static server with Ctrl+C.

## Continuous integration

The GitHub Actions workflow `.github/workflows/ci.yml` (job `verify`) runs on pull requests, pushes to `main`, and manual dispatch. It sets up Node.js 20, runs `node --check` on the seven JavaScript files, runs the linter (`npm run lint`), the review checks (`npm run review`) and the stage gate (`npm run gate`), runs `npm test`, and uploads `reports/ut-report.csv` as the `ut-report` artifact. There is no deployment (CD) step.

AWS deployment (OIDC role, CloudFormation deploy, S3 upload, CloudFront invalidation) is designed in `docs/swdd.md` sections 3.4 and 3.5 but is deferred. Before enabling it, use a dedicated AWS training account, restrict the OIDC role trust to this repository's `main` branch, and grant least-privilege permissions.

### Stage freeze

Each stage is reviewed and then frozen in `docs/stage-baseline.json`: requirements, SWDD, UT design, tests, code (in that order). `npm run review` runs the mechanical review checks (traceability, ID consistency, error messages, referenced files) and `npm run gate` fails when a frozen stage changed or when its upstream changed and it was not re-reviewed. A change therefore starts at the requirement and moves down stage by stage:

```powershell
npm run freeze -- requirements --reviewer "<name>"
npm run freeze -- swdd --reviewer "<name>"
npm run freeze -- ut-design --reviewer "<name>"
npm run freeze -- tests --reviewer "<name>"
npm run freeze -- code --reviewer "<name>"
```

Freezing runs the review checks for that stage first and refuses if they fail. The judgment-based review (the `ut-requirements-review` and `self-review` skills) is done by a person or Copilot before freezing; CI cannot run it.

## Requirements and training plan

See [docs/j1979-pid-mvp-training-requirements.md](docs/j1979-pid-mvp-training-requirements.md) for the full requirements, acceptance criteria, 16-hour agenda, and training outcomes.
