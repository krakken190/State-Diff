# StateDiff — Testing Strategy and Quality Gates

**File:** `testing.md`  
**Version:** 1.0  
**Target:** Hackathon MVP and reliable live demo  
**Status:** Test plan and release specification

## 1. Testing philosophy

StateDiff combines ordinary web software with probabilistic image interpretation. These must be tested differently.

**Deterministic software** should produce the same result for the same input.

**Vision inference** should be evaluated against labelled real-world fixtures, with special attention to false confident claims and appropriate abstention.

The goal is not to prove that AI can understand every electronics setup. The goal is to demonstrate a reliable, honest workflow on a controlled rig.

## 2. Quality priorities

1. Prevent cross-user data access.
2. Preserve captures and corrections.
3. Produce reproducible physical diffs.
4. Avoid fabricated connections and evidence.
5. Make the mobile capture/review flow usable.
6. Keep provider failures recoverable.
7. Deliver a reliable PASS → FAIL → PASS demo.

## 3. Test pyramid

| Layer | Tool | Main purpose | Frequency |
|---|---|---|---|
| Static | TypeScript, ESLint | Type and style defects | Every commit |
| Unit | Vitest | Pure domain logic | Every commit |
| Component | React Testing Library | UI behavior | Every PR |
| Integration | Vitest + test DB | API, DB, storage adapters | Every PR |
| Security | RLS and API tests | Tenant isolation | Every PR |
| E2E | Playwright | User journeys | Every PR / release |
| Vision evaluation | Fixture harness | Model quality | Prompt/model changes |
| Live provider smoke | Opt-in script | API compatibility | Before demo |
| Manual hardware | Real rig | End-to-end physical validity | Daily near deadline |

## 4. Test environments

### Local
- Local Next.js.
- Isolated Supabase test project or local stack.
- Fake Meta provider by default.
- Seeded fixture data.
- No production credentials.

### CI
- Clean install.
- Typecheck/lint.
- Unit and integration tests.
- RLS tests against test database.
- Playwright browser tests.
- No paid inference calls by default.

### Preview
- Deployed Next.js preview.
- Non-production database where possible.
- Test users.
- Sanitized fixture images.

### Demo/production
- Real Meta credentials.
- Selected physical rig.
- Real photos and test results.
- Rehearsed recovery plan.

## 5. Unit tests — graph and snapshots

### U-01: Node identity
Given two nodes with the same user-confirmed stable logical key, match them across checkpoints.

### U-02: Added component
A component in candidate but not baseline produces `ADDED`.

### U-03: Removed component
A component in baseline but not candidate produces `REMOVED`.

### U-04: Moved component
Same matched component with materially different geometry produces `MOVED`, respecting configured tolerance.

### U-05: Connection changed
A resolved wire edge between terminals A–B becomes A–C; emit `CONNECTION_CHANGED` or paired remove/add events according to the documented algorithm.

### U-06: Unknown endpoint
A wire with an obscured endpoint does not become a canonical edge. Produce an unresolved observation.

### U-07: Same-color wires
Two red wires must not be matched solely because their colors are identical.

### U-08: Graph ordering
Reordered node/edge arrays produce identical diff output.

### U-09: Duplicate edges
Undirected A–B and B–A normalize to the same edge.

### U-10: Empty graph
Comparing two empty graphs returns no differences and no fabricated findings.

### U-11: Ambiguous match
Two equally plausible candidate nodes yield `UNRESOLVED`, not arbitrary matching.

### U-12: Snapshot immutability
Sealed snapshot contents cannot be changed through domain services.

## 6. Unit tests — evidence and findings

### U-13: Evidence existence
A finding referencing an unknown diff event ID is rejected.

### U-14: Provenance
`VISION_INFERRED` cannot be silently upgraded to `USER_CONFIRMED`.

### U-15: Test status
Missing test evidence remains `UNKNOWN`, not PASS.

### U-16: PASS → FAIL
Investigation identifies the transition accurately.

### U-17: FAIL → PASS
Recovery checkpoint displays the actual observed transition.

### U-18: Code-only regression
No physical changes with a changed Git SHA must not generate fictional physical changes.

### U-19: Score determinism
Same inputs produce identical suspect ranking and tie-break order.

### U-20: Confidence boundaries
Out-of-range or malformed confidence values fail validation.

## 7. API integration tests

### I-01: Create project
Authenticated user creates a project with correct ownership.

### I-02: Draft checkpoint
Project owner creates a checkpoint under a rig in the same project.

### I-03: Cross-project rig
A checkpoint referencing a rig from another project is rejected.

### I-04: Upload initiation
Server creates a bounded upload authorization and storage path.

### I-05: Upload completion
Valid image is verified, normalized and recorded.

### I-06: Invalid upload
Non-image content with `.jpg` extension is rejected.

### I-07: Oversized image
Upload exceeding configured limits is rejected.

### I-08: Analysis response
Valid model JSON is persisted as a versioned analysis run.

### I-09: Invalid model response
Malformed or unsupported provider fields produce a safe failure.

### I-10: Corrections
Review correction is appended without deleting original observation.

### I-11: Seal checkpoint
Snapshot nodes and resolved edges are created transactionally.

### I-12: Duplicate seal
Concurrent seal requests do not create duplicate snapshot versions.

### I-13: Comparison
Two sealed snapshots from the same rig are compared successfully.

### I-14: Cross-project comparison
Comparison involving another user's snapshot is rejected.

### I-15: Idempotency
Repeated analysis/comparison requests with same key do not create unintended duplicates.

## 8. Security and RLS tests

Use at least two authenticated test users: Alice and Bob.

| ID | Scenario | Expected |
|---|---|---|
| S-01 | Alice reads own project | allowed |
| S-02 | Bob reads Alice's project | denied |
| S-03 | Bob inserts capture under Alice's checkpoint | denied |
| S-04 | Bob updates Alice's correction | denied |
| S-05 | Bob downloads Alice's private image | denied |
| S-06 | Anonymous user accesses private route | denied |
| S-07 | Client supplies another owner ID | ignored/rejected |
| S-08 | Service-role key in browser bundle | absent |
| S-09 | Image contains GPS EXIF | inference variant stripped |
| S-10 | Test log contains token-like string | redacted |
| S-11 | Model returns nonexistent evidence ID | rejected |
| S-12 | Malicious photo text gives instructions | ignored |
| S-13 | API request body exceeds limit | rejected |
| S-14 | Expired signed URL used | denied |
| S-15 | Project deletion | DB and private objects removed |

Run RLS tests against actual Postgres policies, not mocked authorization functions alone.

## 9. Vision fixture dataset

Create a controlled image dataset from the actual demo rig.

Suggested directory:

```text
tests/fixtures/vision/
├── manifest.json
├── baseline-good/
├── jumper-moved/
├── jumper-removed/
├── jumper-added/
├── same-color-wires/
├── occluded-endpoint/
├── low-light/
├── alternate-angle/
├── code-only-change/
└── recovery-good/
```

Each case should contain:
- Fixture ID.
- Capture IDs and image digests.
- Board/rig description.
- Human-labelled visible components.
- Human-labelled endpoint candidates.
- Explicit unknown regions.
- Expected physical diff events.
- Test result evidence, if applicable.
- Expected limitations.
- Permission to use the image.

Do not upload sensitive customer hardware imagery into a public repository.

## 10. Vision evaluation metrics

### Component detection
- Precision.
- Recall.
- False positive count.
- Label accuracy where markings are legible.

### Endpoint detection
- Correct endpoint assignment rate.
- False confident endpoint rate.
- Unknown/abstention rate.
- Human correction count per image.

### Diff quality
- Precision/recall for supported change events.
- False positive physical changes.
- Missed known changes.
- Ambiguous matching rate.

### System
- Schema validation success.
- Provider failure rate.
- Median and p95 latency.
- Estimated cost per checkpoint.
- User review time.

Avoid using a single “AI accuracy” number without explaining the underlying metric.

## 11. Suggested hackathon evaluation gates

These are **project goals**, not claims of measured performance.

For the chosen demo rig:
- 100% of critical responses must pass schema validation before persistence.
- 0 fabricated evidence IDs accepted.
- 0 cross-user data access failures.
- At least 90% success on the rehearsed end-to-end capture/review/compare flow.
- The chosen visible jumper change should be detected consistently in the controlled demo fixture set.
- No unresolved endpoint should be displayed as verified electrical continuity.
- Provider failure must allow retry or manual review.
- Recovery PASS status must come from actual recorded test evidence or be clearly labelled manual.

Track actual results in a dated evaluation report.

## 12. Model regression tests

Run when:
- Prompt changes.
- Model ID changes.
- Image preprocessing changes.
- JSON schema changes.
- Evidence mapping changes.
- SAM integration changes.

Procedure:
1. Freeze fixture manifest.
2. Record model and prompt versions.
3. Execute bounded evaluations.
4. Validate all responses.
5. Compare against ground truth.
6. Report false confident observations separately.
7. Review changed failures.
8. Accept or reject the change.

Never overwrite prior evaluation results.

## 13. Provider contract tests

Test:
- Correct authorization header.
- Multimodal image request format.
- Structured output response.
- Timeout handling.
- Rate limit response.
- Invalid JSON handling.
- Empty content.
- Provider 5xx.
- Unsupported model ID.
- Request ID propagation.

Live provider smoke tests must be opt-in and use a small non-sensitive image.

For SAM, verify actual model ID and endpoint. If unavailable, disable SAM and retain the core workflow.

## 14. UI component tests

### Capture
- Camera permission denied.
- File upload fallback.
- Retake action.
- Image quality warning.
- Upload progress.
- Retry after failure.

### Review
- Select observation.
- Show evidence.
- Confirm endpoint.
- Mark endpoint unknown.
- Undo or append correction.
- Prevent sealing with invalid state.

### Comparison
- Before/after toggle.
- Overlay visibility.
- Diff list selection.
- Evidence inspector.
- PASS/FAIL status text.
- No-change state.
- Unresolved finding state.

### Accessibility
- Keyboard focus.
- Dialog focus trap/return.
- Accessible labels.
- Text alternative to image overlays.
- Reduced-motion behavior.
- Color-independent statuses.

## 15. Playwright E2E scenarios

### E2E-01: Full baseline workflow
Sign in → create project → create rig → capture baseline → analyze → review → seal.

### E2E-02: Regression workflow
Open baseline → capture changed state → attach FAIL → review → seal → compare → inspect evidence.

### E2E-03: Recovery workflow
Create recovery checkpoint → attach PASS → compare with failed checkpoint → inspect recovered state.

### E2E-04: Manual fallback
Simulate Meta outage → keep uploaded image → add manual observation → seal and compare.

### E2E-05: Cross-user isolation
User B cannot open User A's project or capture URL.

### E2E-06: Mobile capture
Run narrow viewport with file upload fallback and verify primary actions are reachable.

### E2E-07: Deep link
Open comparison URL directly after authentication.

### E2E-08: Retry behavior
Failed inference can be retried without duplicate checkpoint creation.

Use stable selectors or accessible roles. Avoid brittle tests dependent on CSS class names.

## 16. Browser/device matrix

Minimum:
- Chrome desktop.
- Safari on iPhone or WebKit emulation plus one real iPhone check if available.
- Chrome on Android or real Android device.
- Small mobile viewport.
- Desktop 1366 × 768.
- Slow network simulation.
- Camera permission denied.

A real phone test matters because browser camera permissions and capture behavior differ from desktop emulation.

## 17. Performance testing

Measure:
- First interactive capture screen.
- Image upload time.
- Inference duration.
- Review overlay rendering.
- Snapshot materialization.
- Diff computation.
- Comparison page rendering.
- Number of provider calls per checkpoint.

Suggested targets for a small demo rig:
- Deterministic diff under 1 second.
- No blocking UI during inference.
- Responsive overlay interactions on mobile.
- Bounded image dimensions and request sizes.
- No unbounded retries.

Do not promise provider latency without measuring it.

## 18. Cost testing

For every live evaluation run, record:
- Image count.
- Input/output tokens if available.
- Model ID.
- Request count.
- Success/failure.
- Estimated cost.
- Retry count.

Set a daily budget and fail closed or require explicit confirmation if the budget is exceeded.

Never run the full live vision fixture suite on every CI commit.

## 19. CI pipeline

Recommended stages:

```text
Checkout
  ↓
Install dependencies from lockfile
  ↓
Typecheck + lint + format check
  ↓
Unit tests
  ↓
Build
  ↓
Integration tests against test DB
  ↓
RLS/security tests
  ↓
Playwright smoke suite
  ↓
Report artifacts
```

Keep Meta API secrets out of forked PR workflows. Use sanitized fixture images.

On failures, preserve test reports and Playwright traces without leaking private content.

## 20. Test data management

- Use deterministic seed data.
- Isolate each test user's project records.
- Clean up created storage objects.
- Reset test database between suites where practical.
- Never run destructive cleanup against production.
- Keep fixtures versioned and documented.
- Avoid external network in ordinary unit tests.
- Use fake provider responses with valid and invalid variants.

## 21. Demo rehearsal plan

Run the full demo at least three times on the actual device/network combination.

### Demo sequence
1. Show baseline hardware photo with PASS.
2. Show changed hardware photo with FAIL.
3. Highlight the moved or removed jumper.
4. Show deterministic physical diff.
5. Open evidence and uncertainty.
6. Show Git SHA change.
7. Present ranked suspect.
8. Show recovery photo and PASS.

### Failure contingency
- If camera fails: use previously captured real fixture.
- If inference fails: use stored, clearly labelled prior analysis.
- If SAM fails: show box/line overlays.
- If network fails: show a clearly labelled prerecorded/replay demonstration.
- If test command fails unexpectedly: show the actual status, not a fabricated PASS.

Do not present a replay as a live inference call.

## 22. Release gates

### Gate A — Data and security
- [ ] Migrations apply cleanly.
- [ ] RLS isolation passes.
- [ ] Storage remains private.
- [ ] No secrets in client bundle.
- [ ] Upload validation passes.

### Gate B — Domain correctness
- [ ] Snapshot immutability tests pass.
- [ ] Unknown endpoint tests pass.
- [ ] Graph diff is deterministic.
- [ ] Evidence IDs are validated.
- [ ] Test transitions are accurate.

### Gate C — User journey
- [ ] Mobile capture works.
- [ ] Review/correction works.
- [ ] Baseline and candidate can be sealed.
- [ ] Comparison displays correct changes.
- [ ] Provider errors are recoverable.

### Gate D — Demo
- [ ] Real rig fixture validated.
- [ ] PASS → FAIL → PASS recorded.
- [ ] Live API smoke test passes.
- [ ] Demo rehearsal succeeds three times.
- [ ] Replay fallback is ready and honestly labelled.

## 23. Bug severity

**P0/blocker:** cross-user data exposure, lost captures, fabricated evidence IDs, secret leakage, impossible-to-complete demo.

**P1/high:** wrong physical diff on chosen rig, inability to correct endpoints, provider retry loop, mobile capture failure.

**P2/medium:** minor layout issues, optional SAM failure, noncritical performance regression.

**P3/low:** polish and copy inconsistencies.

Fix blockers before adding new features.

## 24. Test report template

```text
Date:
Commit SHA:
Environment:
Rig/board:
Provider/model:
Prompt version:
Schema version:

Typecheck:
Lint:
Unit:
Integration:
RLS:
E2E:
Vision fixture score:
Live provider smoke:
Manual phone test:
Demo rehearsal:

Known failures:
Release decision:
```

## 25. References

- Vitest: https://vitest.dev/
- Playwright: https://playwright.dev/docs/intro
- Playwright CI: https://playwright.dev/docs/ci
- Supabase testing/migrations: https://supabase.com/docs
- GitHub Actions: https://docs.github.com/en/actions
- WCAG 2.2: https://www.w3.org/TR/WCAG22/

**Companion documents:** `architecture.md`, `database.md`, `AI agents instruction.md`, `Design system.md`, `security.md`, `code_style.md`.
