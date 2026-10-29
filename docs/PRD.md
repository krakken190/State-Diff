# StateDiff — Product Requirements Document

**Tagline:** Git for the physical world  
**Working name:** StateDiff  
**Document version:** 1.0  
**Date:** October 22, 2026  
**Status:** Ready for technical planning  
**Target:** Meta Global AI Developer Hackathon 2026 — Indie Developer Track  
**Development window:** October 26–November 4, 2026  
**Primary development assistant:** Claude Code  
**Primary AI inference provider:** Meta Model API

---

# 1. Executive Summary

## 1.1 What we are building

StateDiff is a visual version-control and debugging tool for physical electronics prototypes.

It connects three things that are currently tracked separately:

1. **Software state:** Git commits, branches, and code changes.
2. **Physical state:** Breadboards, jumper wires, sensors, modules, and visible component changes.
3. **Test state:** Whether the prototype passed or failed specific tests at a particular checkpoint.

A user photographs their workbench at a known-good checkpoint. Later, after making changes, they capture another checkpoint.

StateDiff compares the two states, identifies observable physical changes, links them to code changes and test results, and produces a ranked list of likely causes when something stops working.

The core product is not an AI chatbot that describes photos.

It is a **structured physical-state history system** with visual evidence, diffs, uncertainty handling, and failure investigation.

## 1.2 Product promise

> When your electronics prototype breaks, StateDiff tells you what changed physically, what changed in code, and which changes are most likely responsible.

## 1.3 The central technical insight

Traditional Git stores differences between text-based artifacts.

StateDiff introduces a structured representation of a physical workbench:

- Objects: wires, boards, components, modules.
- Relationships: possible and confirmed connections.
- Properties: colors, labels, positions, component types.
- Evidence: source photographs and visual regions.
- Confidence: observed, inferred, confirmed, or unknown.
- Time: checkpoint and commit association.

Two representations can then be compared as structured states rather than as unrelated images.

This distinction is essential to the product's novelty.

## 1.4 The most important scope decision

**The hackathon MVP is checkpoint-based, not continuous surveillance.**

Users deliberately capture before-and-after images. The system does not need to monitor the desk continuously.

This makes the product more reliable, cheaper, easier to explain, and achievable in approximately ten days.

---

# 2. Problem Definition

## 2.1 The problem

Electronics developers frequently change hardware and firmware together.

A developer may:

- Move a jumper wire.
- Replace a resistor.
- Reconnect a sensor.
- Change a GPIO assignment.
- Modify a timing constant.
- Run a test.
- Discover that the circuit no longer works.

Git can explain the software changes, but not the physical changes.

The developer must reconstruct those changes from memory, scattered photos, handwritten notes, or trial and error.

## 2.2 Why existing tools are insufficient

| Tool | What it handles | What it misses |
|---|---|---|
| Git | Source-code history | Physical assembly state |
| Circuit schematic software | Intended circuit design | Actual prototype wiring |
| Electronics CAD | Designed board and components | Ad hoc workbench mutations |
| Photos | Visual record | Structured changes and relationships |
| Lab notebook | Manual observations | Automatic comparison and correlation |
| AI image chat | One-off visual descriptions | Stable history, evidence, and meaningful diffs |

StateDiff should complement these tools rather than replace them.

## 2.3 Target users

**Primary persona: Electronics maker / embedded developer**

- Uses ESP32, Arduino, Raspberry Pi Pico, or similar hardware.
- Builds prototypes on breadboards.
- Iterates on firmware and wiring simultaneously.
- Has experienced difficult-to-reproduce hardware failures.
- Uses Git or is willing to associate checkpoints with code versions.

**Secondary personas**

- Robotics hobbyists.
- Hardware hackathon participants.
- Engineering students.
- IoT prototype developers.
- Small embedded-systems teams.

## 2.4 Job to be done

> When a previously working prototype fails after several edits, help me reconstruct exactly what changed and identify what to inspect first.

## 2.5 Initial supported environment

The MVP should be optimized for:

- One electronics workbench.
- One breadboard.
- One microcontroller development board.
- A small number of visible jumper wires.
- A few common components or modules.
- One Git repository.
- One user.
- A relatively stable camera viewpoint.

It must not claim to work equally well for arbitrary industrial machinery, complex PCBs, or heavily occluded assemblies.

---

# 3. Goals, Non-Goals, and Success Criteria

## 3.1 Product goals

**G1 — Capture:** Create a checkpoint containing a photograph, timestamp, Git reference, and optional test results.

**G2 — Understand:** Convert visible physical objects into a structured, editable representation.

**G3 — Compare:** Produce a meaningful physical diff between two checkpoints.

**G4 — Correlate:** Display physical changes alongside code changes and test outcomes.

**G5 — Diagnose:** Rank plausible suspects for a newly failing test, with explanations linked to evidence.

**G6 — Trust:** Never silently present uncertain visual interpretations as verified electrical facts.

**G7 — Demonstrate:** Deliver a reliable, compelling live demonstration during the hackathon.

## 3.2 Non-goals for the hackathon

The following are explicitly out of scope:

- Fully autonomous electrical continuity verification.
- Guaranteed resistor-value recognition from photos.
- Voltage measurement from visual appearance.
- Automatic generation of complete, accurate circuit schematics.
- Arbitrary PCB reverse engineering.
- Continuous 24/7 video monitoring.
- Autonomous firmware modification.
- Automatic physical rollback.
- Multi-user real-time collaboration.
- Production-grade support for every development board.
- Detecting hidden connections beneath components.
- Diagnosing every possible electrical fault.

## 3.3 Definition of success

The MVP succeeds if a user can:

1. Create a known-good checkpoint.
2. Make a deliberate, visible hardware change.
3. Create a second checkpoint.
4. See that change in a structured physical diff.
5. Associate both checkpoints with Git revisions.
6. Record a test that changes from passing to failing.
7. Ask what changed since the last passing test.
8. Receive a ranked suspect list grounded in real checkpoint evidence.
9. Correct an AI observation when necessary.

The MVP does **not** need perfect autonomous wire tracing to satisfy these criteria.

---

# 4. Core Product Experience

## 4.1 Main workflow

### Step A — Create a project

The user creates a StateDiff project and optionally associates a Git repository.

They specify basic hardware context:

- Microcontroller family.
- Breadboard type or approximate layout.
- Project name.
- Optional pinout reference.
- Optional test commands.

Example project:

**ESP32 Temperature Controller**

### Step B — Capture the first checkpoint

The user opens StateDiff on a phone or laptop and captures the workbench.

The interface requests:

- A clear overhead image.
- The full breadboard in frame.
- Minimal glare.
- Good lighting.
- A stable viewpoint.
- Optional second image for difficult wiring.

The user labels the checkpoint:

**Motor control working**

The system stores the image and runs visual analysis.

### Step C — Review the detected physical state

The application displays detected objects overlaid on the image.

Example observations:

- ESP32 development board.
- Breadboard.
- Yellow jumper wire.
- Blue jumper wire.
- Resistor-like component.
- Sensor module.

For each object, the user may confirm or correct:

- Object type.
- Identity.
- Location.
- Connection endpoints.
- Component value, if known.

The system must not force the user to annotate every object before continuing.

### Step D — Associate code and tests

The checkpoint is linked to:

- Git commit SHA.
- Branch.
- Changed-file summary.
- Test names and results.
- Optional notes.

A local companion tool may automate this step.

### Step E — Make changes

The user modifies firmware, wiring, or both.

### Step F — Capture another checkpoint

The user takes another photograph and records new test results.

### Step G — Inspect the diff

StateDiff shows:

**Physical changes**

- Yellow wire appears to have moved.
- Sensor module is no longer visible.
- A component near the power rail may have changed.

**Code changes**

- GPIO assignment changed.
- Timing constant changed.

**Test changes**

- `motor_test`: PASS → FAIL.
- `sensor_test`: PASS → PASS.

### Step H — Investigate the failure

The user selects:

**What changed since the last passing test?**

StateDiff ranks likely suspects and explains each one.

Example:

**Suspect 1 — Yellow jumper connection changed**

- Evidence: checkpoint image comparison.
- Relevant test: motor test now failing.
- Confidence: medium until endpoints are confirmed.
- Suggested inspection: verify the motor-control signal wire against the intended GPIO mapping.

**Suspect 2 — Firmware GPIO assignment changed**

- Evidence: linked Git diff.
- Relevant test: motor test now failing.
- Suggested inspection: compare the configured GPIO with the actual wiring.

The ranking should reflect actual evidence, not a generic troubleshooting checklist.

---

# 5. MVP Feature Requirements

## 5.1 Priority P0 — Must ship

| ID | Feature | Requirement |
|---|---|---|
| P0-01 | Project creation | Create and view a hardware project |
| P0-02 | Photo capture | Upload or capture a workbench image |
| P0-03 | Checkpoint creation | Store timestamp, label, image, and metadata |
| P0-04 | Visual analysis | Extract structured observations from an image |
| P0-05 | Human correction | Edit incorrect object labels and connection hypotheses |
| P0-06 | Checkpoint history | Browse chronological physical commits |
| P0-07 | Physical diff | Compare two checkpoints and list changes |
| P0-08 | Evidence viewer | Highlight the relevant image regions |
| P0-09 | Git association | Attach a commit SHA and code-change summary |
| P0-10 | Test status | Record PASS, FAIL, SKIP, or UNKNOWN |
| P0-11 | Suspect ranking | Explain possible causes of a regression |
| P0-12 | Uncertainty | Distinguish observations from verified facts |
| P0-13 | Demo reliability | Support a repeatable end-to-end demo |

## 5.2 Priority P1 — Build if P0 is stable

- Local CLI to capture Git metadata automatically.
- Local CLI to run configured tests.
- Better alignment between before-and-after photographs.
- SAM-based segmentation overlays.
- Multiple photos per checkpoint.
- Simple project pinout configuration.
- Exportable checkpoint report.
- Search across checkpoint notes and diffs.
- Side-by-side image comparison slider.

## 5.3 Priority P2 — Future roadmap

- Automatic checkpoint creation on Git commit.
- Live camera monitoring.
- Video-based object tracking.
- Native desktop companion.
- Team collaboration.
- Circuit-net reconstruction.
- Integration with KiCad or Fritzing.
- Multimeter or logic-analyzer input.
- USB serial telemetry.
- Historical failure-pattern retrieval.
- Hardware-aware regression test suggestions.
- Physical-state branching and merging.

---

# 6. Recommended Technology Stack

## 6.1 Platform decision

**Build a responsive web application / PWA first.**

Do not build separate native iOS, Android, and desktop applications for the hackathon.

A web app supports:

- Phone-camera capture.
- Laptop-based history and debugging.
- Easy deployment.
- Fast UI iteration.
- A single codebase.

## 6.2 Recommended stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js + TypeScript | One full-stack application |
| UI | Tailwind CSS + shadcn/ui | Fast, polished interface development |
| Image overlays | Canvas or SVG | Bounding boxes, masks, annotations |
| Backend | Next.js server routes | Avoid a separate backend service initially |
| Database | Supabase PostgreSQL | Managed relational storage |
| Image storage | Supabase Storage | Store original and processed images |
| Authentication | Supabase Auth | Simple cross-device access |
| Hosting | Vercel | Fast deployment for a Next.js app |
| AI inference | Meta Model API | Hackathon-aligned model access |
| Image preprocessing | Sharp and/or OpenCV | Resize, crop, normalize, align |
| Validation | Zod | Validate model outputs and API payloads |
| Local companion | Node.js / TypeScript CLI | Git and test integration |
| Version control | Git + GitHub | Project source and code history |
| Observability | Basic structured logs | Diagnose demo failures |

Use currently supported stable package versions rather than locking the project to a framework version without testing compatibility.

## 6.3 Why Supabase

Supabase is recommended because it provides:

- PostgreSQL.
- File storage.
- Authentication.
- Row-level security.
- A managed service suitable for a short hackathon.

For the MVP, a single database with object storage is enough.

Do not introduce Redis, Kafka, a vector database, or microservices without a demonstrated need.

## 6.4 Why not a native app

A native app would add development and distribution overhead without improving the core innovation.

The difficult problem is reliable physical-state comparison, not mobile packaging.

---

# 7. AI Models and Inference Strategy

## 7.1 Primary inference provider

**Meta Model API**

Base URL:

`https://api.meta.ai/v1`

Authentication:

Server-side Bearer token stored as `MODEL_API_KEY`.

The API key must never be exposed to the browser.

## 7.2 Recommended models

### Muse Spark 1.3

**Model:** `muse-spark-1.3`

**Primary responsibilities:**

- Understand workbench images.
- Identify visible components and approximate locations.
- Extract observations into a structured schema.
- Interpret user-provided hardware context.
- Compare structured physical changes.
- Explain likely causes of a test regression.
- Generate evidence-based diagnostic summaries.

Use structured output rather than asking the model for free-form prose and attempting to parse it afterward.

### SAM 3.1

**Recommended model identifier:** `sam-3.1`

**Primary responsibilities:**

- Segment selected visible objects.
- Generate image masks or bounding boxes.
- Improve visual overlays.
- Support object-location comparison.

**Important documentation note:** Some Meta product pages display the model identifier as `sam-3-1`, while the API examples and rate-limit documentation use `sam-3.1`. Claude Code must verify the accepted identifier using the current API documentation, model listing, and an actual test request.

SAM returns segmentation geometry, not electrical understanding.

A segmented wire is not automatically a verified electrical connection.

### Muse Wonder

**Model:** `muse-wonder-1.0`

Optional only.

Could be evaluated for difficult multi-step reasoning, but it is not necessary for the initial MVP.

Avoid adding another model simply because it is available.

### Muse Image

Not needed.

StateDiff analyzes real images; it should not generate synthetic workbench evidence for normal operation.

### Muse Voice Transcribe

Not needed for the MVP.

Voice checkpoint commands can be considered later.

## 7.3 Third-party inference decision

**No non-Meta inference provider is required for the hackathon MVP.**

The runtime inference architecture should use Meta Model API directly.

Claude Code is the development assistant, not the production inference provider.

Supabase and Vercel are infrastructure providers, not model inference providers.

Optional local computer-vision libraries may perform deterministic image preprocessing without invoking an additional hosted AI model.

This reduces:

- Cost uncertainty.
- Integration complexity.
- Provider-switching failures.
- Hackathon demonstration risk.

## 7.4 Model responsibility boundaries

| Task | Recommended method |
|---|---|
| Image resize and orientation | Deterministic image processing |
| Image alignment | Classical computer vision where feasible |
| Object detection hypotheses | Muse Spark |
| Pixel masks for selected objects | SAM 3.1 |
| Connection endpoint verification | User confirmation |
| Physical-state persistence | Application database |
| Object matching across checkpoints | Deterministic matching with optional AI assistance |
| Physical diff computation | Deterministic application logic |
| Suspect ranking | Evidence-based scoring + Muse Spark explanation |
| Test result truth | Local test runner or explicit user input |

**Core rule:** The language model may interpret evidence, but it must not be the sole source of truth for stored physical history.

---

# 8. AI Processing Pipeline

## 8.1 Stage 1 — Capture validation

Input:

- One or more workbench images.
- Project hardware profile.
- Previous checkpoint, if available.

Processing:

- Correct image orientation.
- Resize to a practical inference resolution.
- Check basic blur and exposure.
- Encourage recapture when image quality is poor.
- Preserve the original image.

Output:

A validated capture ready for analysis.

## 8.2 Stage 2 — Scene registration

Try to align the new image with the previous checkpoint.

Possible techniques:

- Fixed camera framing.
- Breadboard corner references.
- Image feature matching.
- Manually selected anchor points.
- Optional printed reference markers.

Do not spend the entire hackathon implementing advanced registration.

For the demo, use a stable overhead camera position.

If alignment fails, the system should report that visual comparison quality is reduced.

## 8.3 Stage 3 — Structured visual extraction

Muse Spark produces a structured observation set.

Each observation should contain:

- Temporary object identifier.
- Object category.
- Visible attributes.
- Approximate bounding box.
- Possible connection endpoints, if visible.
- Confidence.
- Explanation or uncertainty reason.
- Source image reference.

Example conceptual observation:

- Category: jumper wire.
- Color: yellow.
- Visible location: upper-right breadboard area.
- Possible endpoint A: near ESP32 GPIO 18.
- Possible endpoint B: near breadboard row 34.
- Endpoint status: unconfirmed.
- Evidence: image region coordinates.

Do not turn uncertain guesses into confirmed circuit connections.

## 8.4 Stage 4 — Optional SAM segmentation

Use SAM selectively for objects that benefit from precise overlays:

- Jumper wires.
- Breadboard.
- Development board.
- Sensor module.
- Large removable components.

Avoid segmenting every conceivable object in every image.

Use concrete prompts and validate the returned masks.

For the MVP, SAM improves evidence presentation; it must not become a hard dependency for checkpoint creation.

## 8.5 Stage 5 — User review

The user sees an annotated photograph.

They can:

- Confirm an object.
- Rename an object.
- Correct its category.
- Confirm or edit an endpoint.
- Mark an object as unknown.
- Dismiss a false positive.

Confirmed information is stored separately from model-generated hypotheses.

This interaction is not a weakness. It is a core reliability feature.

## 8.6 Stage 6 — Object identity matching

StateDiff attempts to determine which objects persisted between checkpoints.

Matching signals may include:

- Object type.
- Color.
- Relative location.
- Shape.
- Bounding-box overlap after image alignment.
- Confirmed endpoint labels.
- User-assigned object identity.

Color alone must never establish object identity.

If two yellow wires are present, the system may be unable to determine which one moved.

Unresolved identity should be represented explicitly.

## 8.7 Stage 7 — Deterministic diff

Compute changes between normalized state representations.

Supported change types:

- `ADDED`
- `REMOVED`
- `MOVED`
- `ATTRIBUTE_CHANGED`
- `CONNECTION_CHANGED`
- `POSSIBLY_CHANGED`
- `UNCHANGED`
- `UNRESOLVED`

A diff should contain:

- Before state.
- After state.
- Change type.
- Evidence from both checkpoints.
- Confidence.
- Verification status.

## 8.8 Stage 8 — Regression investigation

When a test changes from PASS to FAIL:

1. Identify the most recent passing checkpoint.
2. Identify the first failing checkpoint.
3. Collect physical changes between them.
4. Collect linked Git changes.
5. Collect test names and logs.
6. Determine which changes are plausibly relevant.
7. Rank suspects.
8. Generate an explanation with evidence references.

The model should not invent a cause when the evidence is insufficient.

## 8.9 Stage 9 — Feedback and correction

When a user confirms that a suspected wire move caused the failure, store that conclusion.

When the user rejects a proposed change, retain the correction.

The system should support learning from user corrections within the project without requiring model fine-tuning.

---

# 9. Canonical Physical-State Representation

## 9.1 Design principle

Store physical state as structured data, not merely image captions.

The photograph is evidence.

The structured state is the versioned artifact.

## 9.2 Core entities

### Project

Fields:

- ID.
- Name.
- Description.
- Owner.
- Hardware profile.
- Linked repository information.
- Created and updated timestamps.

### Checkpoint

Fields:

- ID.
- Project ID.
- Label.
- Timestamp.
- Parent checkpoint ID.
- Git commit SHA.
- Branch.
- Capture status.
- Analysis status.
- Notes.

### Capture

Fields:

- ID.
- Checkpoint ID.
- Original image path.
- Processed image path.
- Image dimensions.
- Camera orientation.
- Capture angle.
- Optional alignment transform.

### PhysicalObject

Fields:

- Stable object ID.
- Project ID.
- Category.
- User-defined name.
- Optional manufacturer/model.
- Optional known value.
- Creation checkpoint.
- Verification status.

### ObjectObservation

Fields:

- Observation ID.
- Checkpoint ID.
- Physical object ID, if resolved.
- Bounding box.
- Segmentation mask reference.
- Visible attributes.
- Model confidence.
- Model version.
- Evidence reference.

### Connection

Fields:

- Connection ID.
- Checkpoint ID.
- Source object or endpoint.
- Destination object or endpoint.
- Connection type.
- Verification status.
- Confidence.
- Evidence reference.

### PhysicalChange

Fields:

- Change ID.
- Before checkpoint.
- After checkpoint.
- Object ID.
- Change type.
- Before attributes.
- After attributes.
- Confidence.
- Evidence references.
- Review status.

### TestRun

Fields:

- ID.
- Checkpoint ID.
- Test name.
- Result.
- Execution source.
- Start and end timestamps.
- Exit code.
- Log reference.

### CodeSnapshot

Fields:

- Checkpoint ID.
- Repository identifier.
- Commit SHA.
- Branch.
- Changed-file list.
- Optional patch reference.

### Suspect

Fields:

- Investigation ID.
- Related change IDs.
- Ranking score.
- Evidence references.
- Explanation.
- Suggested verification step.
- User-confirmed outcome.

## 9.3 Evidence provenance

Every meaningful claim should have a source type:

- `VISION_INFERRED`
- `USER_CONFIRMED`
- `TEST_OBSERVED`
- `GIT_OBSERVED`
- `DEVICE_MEASURED`
- `UNKNOWN`

These source types must not be collapsed into one generic confidence score.

A model may be confident that a red wire exists without knowing where it is electrically connected.

## 9.4 Immutability rule

A checkpoint represents a historical snapshot.

Corrections should update the interpreted state with revision history, but the original captured image and original inference result should remain recoverable.

Do not silently overwrite evidence.

---

# 10. Physical Diff Semantics

## 10.1 Examples of supported diffs

**Visible object removal**

- Before: USB serial adapter visible.
- After: USB serial adapter absent.
- Result: `REMOVED`, with visibility caveat.

**Visible wire movement**

- Before: yellow wire endpoint near one pin.
- After: endpoint near another pin.
- Result: `POSSIBLY_CHANGED` until confirmed.

**Confirmed connection change**

- Before: user-confirmed GPIO 18 to row 34.
- After: user-confirmed GPIO 19 to row 34.
- Result: `CONNECTION_CHANGED`.

**Component replacement**

- Before: user-confirmed 1 kΩ resistor.
- After: similar-looking resistor with unknown value.
- Result: `ATTRIBUTE_CHANGED` or `UNRESOLVED`, not automatically “10 kΩ.”

## 10.2 Handling occlusion

If an object disappears behind another object, the system must not confidently claim it was removed.

Preferred wording:

**Not visible in the new checkpoint. Removal unconfirmed.**

## 10.3 Handling image-quality changes

Different lighting, shadows, or camera angles may cause false differences.

The system should:

- Compare aligned images when possible.
- Suppress low-confidence cosmetic changes.
- Highlight uncertain regions.
- Offer user confirmation.
- Allow recapture.

## 10.4 Identity ambiguity

When the system cannot match an object across checkpoints, it should avoid fabricating continuity.

Example:

**Two similar blue wires detected; object identity unresolved.**

---

# 11. Suspect Ranking Engine

## 11.1 Goal

Rank which changes deserve inspection first.

This is not a guarantee of root-cause diagnosis.

## 11.2 Inputs

- Physical diffs.
- Git diffs or changed-file summaries.
- Test regression.
- Hardware profile.
- User-confirmed connections.
- Checkpoint chronology.
- Optional test logs.

## 11.3 Recommended approach

Use a hybrid system:

**Layer 1 — Deterministic scoring**

Consider:

- Whether the change happened between PASS and FAIL.
- Whether it affects a confirmed connection.
- Whether it is relevant to the failing test.
- Whether it contradicts a firmware GPIO assignment.
- Whether the change is user-confirmed.
- Whether the observation is visually reliable.

**Layer 2 — Muse Spark explanation**

The model receives the ranked evidence and:

- Explains why each suspect matters.
- Identifies relevant code/physical interactions.
- Suggests safe verification steps.
- Notes missing evidence.

The model should not invent an electrical explanation unsupported by the provided facts.

## 11.4 Example ranking

**Failure:** Motor test changed from PASS to FAIL.

**Changes:**

1. Yellow jumper moved from confirmed GPIO 18 to GPIO 19.
2. Firmware motor pin changed from GPIO 18 to GPIO 21.
3. Unrelated logging delay changed.

Possible output:

1. **GPIO mismatch** — strongest candidate.
2. **Physical jumper movement** — directly relevant.
3. **Logging delay** — lower relevance.

The exact ranking should depend on verified connections and the test's behavior.

## 11.5 Causality limitation

Temporal correlation is not proof of causation.

The interface must say **likely suspect**, not **confirmed root cause**, unless the user or a validated test confirms it.

---

# 12. API and Integration Requirements

## 12.1 External APIs

| API/service | Purpose | MVP status |
|---|---|---|
| Meta Model API | Image understanding and diagnostic reasoning | Required |
| Meta SAM 3.1 | Object segmentation and overlays | Recommended |
| Supabase Auth | Authentication | Required if cloud sync is used |
| Supabase Database | Projects, checkpoints, observations | Required |
| Supabase Storage | Image and evidence storage | Required |
| Git CLI | Read local repository state | Recommended |
| GitHub API | Optional repository metadata | Not required |
| GitHub OAuth | Automatic account linking | Out of scope |
| Sentry | Error monitoring | Optional |
| PostHog | Product analytics | Optional |

## 12.2 Meta Model API endpoints

**Muse Spark structured extraction**

`POST /v1/chat/completions`

Use the documented JSON-schema structured-output mechanism.

**SAM segmentation**

`POST /v1/responses`

Use the SAM-specific media input and output format.

**Model discovery**

`GET /v1/models`

Use this during initial integration to verify available models.

**Service status**

`GET /v1/status`

Optional health checking.

**File upload**

`POST /v1/files`

Optional. Inline base64 image input may be simpler for the first integration, subject to payload limits.

## 12.3 Browser APIs

- Camera access through `getUserMedia`, where supported.
- File input as a reliable fallback.
- Browser canvas for image overlays.
- Standard browser upload APIs.

The MVP should not depend on Web Serial.

Web Serial availability varies by browser and platform, especially on mobile.

## 12.4 Local Git integration

Use the installed Git executable to obtain:

- Current commit SHA.
- Current branch.
- Working-tree status.
- Changed-file list.
- Optional patch content.

Default to sending metadata and changed-file names.

Sending source-code patches to hosted inference should be opt-in.

## 12.5 Local test integration

A local companion tool may execute explicitly configured test commands.

Examples of supported test categories:

- Firmware unit tests.
- Host-side integration tests.
- Hardware-in-the-loop test scripts.
- Serial communication checks.

The backend must never execute arbitrary commands supplied by an AI model.

Tests run locally under the user's control.

## 12.6 Internal application interfaces

Suggested conceptual routes:

| Route | Purpose |
|---|---|
| `POST /api/projects` | Create a project |
| `GET /api/projects/:id` | Load project |
| `POST /api/checkpoints` | Create checkpoint |
| `POST /api/captures` | Upload capture |
| `POST /api/checkpoints/:id/analyze` | Run visual analysis |
| `PATCH /api/observations/:id` | Save correction |
| `GET /api/checkpoints/:id/state` | Read normalized physical state |
| `GET /api/diff` | Compare two checkpoints |
| `POST /api/test-runs` | Attach test results |
| `POST /api/investigations` | Rank suspects |
| `GET /api/investigations/:id` | Read diagnosis |

These are proposed application interfaces, not external services that already exist.

Claude Code may refine the route design before implementation.

---

# 13. Local Companion Tool

## 13.1 Purpose

Bridge the local development environment with the web application.

The companion is not an autonomous agent.

It is a small utility that reads Git state, optionally runs approved tests, and sends results to StateDiff.

## 13.2 Proposed commands

**`statediff init`**

Associate a local repository with a StateDiff project.

**`statediff checkpoint`**

Collect Git metadata and create a checkpoint record.

The user may then capture the physical photo from their phone.

**`statediff test`**

Run a preconfigured test and attach the result.

**`statediff status`**

Show the current linked project and latest checkpoint.

These are product specifications, not implemented commands.

## 13.3 MVP fallback

If CLI integration is not stable by the middle of the hackathon:

- Allow manual commit SHA entry.
- Allow manual test-result entry.
- Allow uploading test logs.

The physical diff and investigation experience are more important than CLI polish.

---

# 14. User Interface Requirements

## 14.1 Screen 1 — Project dashboard

Show:

- Project name.
- Hardware profile.
- Linked repository.
- Latest checkpoint.
- Latest test state.
- Button to create checkpoint.
- Checkpoint timeline.

## 14.2 Screen 2 — Capture

Show:

- Camera preview or image upload.
- Framing guidance.
- Retake option.
- Checkpoint label.
- Optional Git SHA.
- Optional notes.

## 14.3 Screen 3 — Physical-state review

Show:

- Photograph.
- Object overlays.
- Selectable object list.
- Confidence/verification status.
- Correction controls.
- Save confirmed state.

## 14.4 Screen 4 — Timeline

Show chronological checkpoints.

Each checkpoint should expose:

- Label.
- Time.
- Git SHA.
- Test status.
- Image thumbnail.
- Comparison action.

## 14.5 Screen 5 — Diff viewer

This is the main product screen.

Recommended layout:

**Left:** Before image.

**Right:** After image.

**Bottom or side panel:** Physical changes.

**Secondary tab:** Git changes.

**Test panel:** PASS/FAIL transitions.

Clicking a change should highlight supporting evidence in the images.

## 14.6 Screen 6 — Investigation

Show:

- Failing test.
- Last passing checkpoint.
- First failing checkpoint.
- Ranked suspects.
- Evidence links.
- Verification steps.
- User feedback: confirmed / rejected / unresolved.

## 14.7 Visual design direction

Use a developer-tool aesthetic:

- Dark or neutral interface.
- Clear monospace commit identifiers.
- Green for additions.
- Red for removals.
- Amber for uncertain changes.
- High-contrast image annotations.
- Minimal decorative animations.

The product should feel like Git tooling applied to physical hardware.

---

# 15. Accuracy and Technical Limitations

This section is a non-negotiable part of the specification.

## 15.1 Wire tracing

A single photo may not reveal both endpoints of a jumper wire.

Wires can:

- Cross.
- Overlap.
- Bend behind modules.
- Have identical colors.
- Hide insertion points.

**MVP response:** Detect visible wire candidates and request confirmation for ambiguous endpoints.

## 15.2 Breadboard connectivity

Breadboard electrical connectivity depends on internal rail geometry and board type.

A photograph alone does not prove that two insertion holes are electrically connected.

**MVP response:** Use a configured breadboard model only when its geometry is known and verified.

## 15.3 Resistor recognition

Color bands may be unreadable due to resolution, lighting, or orientation.

**MVP response:** Recognize resistor-like objects but leave values unknown unless confidently legible and user-confirmed.

## 15.4 Voltage recognition

A camera cannot determine whether a rail is carrying 3.3 V or 5 V.

**MVP response:** Voltage comes from user input, an actual measurement, or trustworthy device telemetry.

Never fabricate measured voltage from an image.

## 15.5 Component removal

An object that is no longer visible may be occluded rather than removed.

**MVP response:** Report visibility uncertainty.

## 15.6 Object identity

Matching similar components across photos is difficult.

**MVP response:** Prefer stable positions, confirmed identifiers, and explicit user correction.

## 15.7 Git synchronization

A photo may be captured when the working tree contains uncommitted changes.

**MVP response:** Record whether the repository was clean or dirty.

A Git SHA alone does not fully describe uncommitted firmware state.

## 15.8 Hardware safety

StateDiff must not claim that a circuit is electrically safe.

Do not recommend powering unknown circuits merely to test a hypothesis.

Do not automate potentially destructive power changes.

---

# 16. Reliability, Privacy, and Security

## 16.1 Privacy

Workbench images may include:

- Private notes.
- Device identifiers.
- Personal belongings.
- Unreleased prototypes.
- Proprietary hardware.

Recommended safeguards:

- Allow cropping before upload.
- Show which images are uploaded.
- Store images in private buckets.
- Provide project and image deletion.
- Avoid public image URLs.
- Use short-lived signed URLs where necessary.
- Do not use images for unrelated analytics.

## 16.2 Model-provider data handling

Use Meta's Standard inference mode by default.

Meta documents different data-use conditions for Standard and Contributor modes.

Do not silently enable Contributor mode for private hardware images or source code.

Explain this distinction in developer configuration.

## 16.3 API security

- Keep `MODEL_API_KEY` server-side.
- Keep Supabase service-role credentials server-side.
- Use row-level security for user data.
- Validate file types and sizes.
- Rate-limit inference endpoints.
- Validate model JSON against application schemas.
- Sanitize user-supplied filenames and metadata.
- Prevent cross-project data access.

## 16.4 Test execution security

Never run model-generated shell commands automatically.

Only execute locally configured commands with explicit user authorization.

Do not expose a remote arbitrary-code-execution endpoint.

## 16.5 Failure handling

The app must handle:

- Meta API timeouts.
- Rate limits.
- Invalid structured output.
- Zero detected objects.
- Image upload failure.
- Poor image quality.
- Failed image alignment.
- Missing Git metadata.
- Incomplete test logs.

A failed AI request must not corrupt or delete the checkpoint.

## 16.6 Data retention

Recommended MVP policy:

- Keep user checkpoints until deleted.
- Allow image deletion with associated records.
- Keep minimal operational logs.
- Do not log full image payloads or API keys.
- Document any external inference processing.

---

# 17. Performance and Cost Targets

## 17.1 Performance targets

These are engineering targets, not measured guarantees.

- Image upload: clear progress and failure feedback.
- Checkpoint creation: immediate metadata save.
- Visual analysis: target under 30 seconds for a typical image.
- Diff generation: target under 5 seconds after states are available.
- Investigation: target under 15 seconds after evidence collection.
- UI: usable on phone and desktop.

Prioritize correctness and predictable progress over aggressive latency promises.

## 17.2 Cost assumptions

Meta's published Standard pricing, checked October 22, 2026:

- Muse Spark 1.3 input: approximately $1.25 per million tokens.
- Muse Spark 1.3 output: approximately $4.25 per million tokens.
- SAM 3.1 image segmentation: approximately $2.50 per 1,000 images.

Prices and limits can change.

Actual vision-token usage must be measured from API responses.

## 17.3 Cost controls

- Analyze only on explicit checkpoint creation.
- Cache completed inference results.
- Avoid repeatedly analyzing unchanged images.
- Resize oversized uploads.
- Run SAM only where useful.
- Cap retries.
- Set a development spending budget.
- Track cost per checkpoint.
- Avoid using expensive reasoning models for every interaction.

Suggested initial hackathon inference budget: **$25–$50**, subject to available credits and actual testing.

## 17.4 Deployment considerations

Cloud inference and storage are recommended for the hackathon.

Longer term, a local-first or self-hosted edition may be valuable for sensitive hardware projects.

Do not attempt both architectures in the initial ten-day build.

---

# 18. Evaluation and Testing Plan

## 18.1 Evaluation dataset

Create a small, controlled dataset using the actual demonstration hardware.

Recommended dataset:

- 15–25 checkpoint pairs.
- Several unchanged pairs.
- Several wire moves.
- Component addition/removal.
- Similar-looking wire ambiguity.
- Lighting variation.
- Camera movement.
- Partial occlusion.
- One or more test regressions.

Record the true changes manually.

## 18.2 Metrics

Track:

**Object detection precision**

How many reported objects actually exist?

**Change detection precision**

How many reported changes are real?

**Change detection recall**

How many real changes are found?

**False certainty rate**

How often does the system make an unsupported high-confidence claim?

**User correction burden**

How many manual corrections are needed per checkpoint?

**Analysis latency**

How long does inference take?

**End-to-end success**

Can the user complete the entire workflow?

## 18.3 Suggested MVP acceptance targets

On the constrained demo setup:

- Detect the deliberate primary hardware change in at least 8 of 10 repeated trials.
- Produce no unqualified claims of measured voltage from images.
- Never label unconfirmed wire endpoints as verified.
- Correctly associate the chosen Git commits with their checkpoints.
- Correctly show the PASS → FAIL test transition.
- Highlight the evidence supporting the top suspect.
- Recover gracefully from one simulated API failure.

These are targets to validate, not existing performance claims.

## 18.4 Required test categories

- Database CRUD tests.
- Image upload tests.
- Structured-output validation tests.
- Physical-diff unit tests.
- Object-identity ambiguity tests.
- Authorization tests.
- Inference failure tests.
- End-to-end demo flow.
- Mobile capture smoke test.

---

# 19. Ten-Day Hackathon Execution Plan

## Day 1 — Foundation

- Confirm hackathon rules and access.
- Create repository.
- Set up Next.js, Supabase, deployment.
- Obtain Meta API credentials.
- Verify Muse Spark image input.
- Verify SAM access.
- Define initial schemas.
- Select exact demo hardware.

**Exit criterion:** A real workbench image can be sent to Meta inference and a response received.

## Day 2 — Vision feasibility

- Capture several workbench images.
- Implement structured object extraction.
- Validate schema.
- Evaluate wire and component recognition.
- Identify the narrowest reliable demo scenario.

**Kill gate:** If endpoint detection is unreliable, switch to user-confirmed endpoints immediately.

## Day 3 — Checkpoint system

- Create projects and checkpoints.
- Upload and store images.
- Save observations.
- Build checkpoint history.

**Exit criterion:** Two real checkpoints can be persisted and reloaded.

## Day 4 — Physical diff

- Implement object matching.
- Implement change types.
- Build before/after comparison.
- Display evidence overlays.

**Exit criterion:** A deliberately moved wire produces a reviewable diff.

## Day 5 — Human verification

- Add correction UI.
- Confirm wire endpoints.
- Improve confidence handling.
- Handle missing or ambiguous objects.

**Exit criterion:** A wrong AI observation can be corrected without breaking history.

## Day 6 — Git and tests

- Associate commit SHA.
- Add test results.
- Build PASS/FAIL transition view.
- Start local CLI only if time permits.

**Exit criterion:** Physical, software, and test states appear together.

## Day 7 — Investigation engine

- Implement evidence-based suspect scoring.
- Integrate Muse Spark explanations.
- Add source-linked recommendations.
- Prevent unsupported claims.

**Exit criterion:** A failing checkpoint produces useful ranked suspects.

## Day 8 — End-to-end integration

- Test the full workflow.
- Fix cross-device issues.
- Add error handling.
- Improve mobile capture.
- Reduce latency.

**Exit criterion:** Full demonstration succeeds repeatedly.

## Day 9 — Polish and validation

- Record demo footage.
- Run evaluation dataset.
- Fix high-impact issues.
- Prepare fallback demo data.
- Review privacy and security.
- Freeze unnecessary features.

**Exit criterion:** Stable release candidate.

## Day 10 — Submission

- Run final smoke tests.
- Prepare README.
- Document limitations.
- Finalize demo video.
- Verify submission requirements.
- Submit before the official deadline.

**Important:** The hackathon site lists November 4, 2026, at 9:00 PM ET as the submission deadline. Recheck the event page and official rules for changes.

---

# 20. Hackathon Demonstration Storyboard

## 20.1 Objective

Demonstrate a genuine capability rather than a polished mockup.

## 20.2 Recommended physical setup

- One ESP32 development board.
- One breadboard.
- Three to five visible jumper wires.
- One simple sensor or output component.
- One deterministic test script.
- One overhead camera or phone mount.
- Good lighting.
- Distinct wire colors.

Keep the setup visually legible.

## 20.3 Demonstration sequence

### Scene 1 — Known-good state

Show the working hardware.

Run a test:

**Motor test: PASS**

Create checkpoint A.

### Scene 2 — Changes

Make two changes:

- A visible jumper-wire move.
- An unrelated or partially relevant firmware edit.

Create a new Git commit.

### Scene 3 — Failure

Run the same test:

**Motor test: FAIL**

Create checkpoint B.

### Scene 4 — Physical diff

Open StateDiff.

Show:

- Checkpoint A versus checkpoint B.
- Highlighted jumper-wire change.
- Associated Git diff.
- Test transition.

### Scene 5 — Investigation

Select:

**What changed since the last passing test?**

Show the ranked suspects.

The top suspect should reference the actual visible change and any relevant firmware mapping.

### Scene 6 — Validation

Restore the correct wire connection.

Run the test again:

**Motor test: PASS**

Create checkpoint C.

Show the regression and recovery in the timeline.

This last step makes the story significantly stronger because the proposed cause is tested.

## 20.4 Demo fallback

Prepare a replayable dataset using genuine captured images and actual test results.

If live inference fails during judging, show the recorded workflow and clearly identify it as a replay.

Do not imply prerecorded inference is happening live.

---

# 21. Suggested Project Scaffold

The following is a proposed repository structure, not executable code.

```text
statediff/
│
├── README.md
├── STATEDIFF_PRD.md
├── CLAUDE.md
├── .env.example
├── package.json
├── pnpm-workspace.yaml
│
├── apps/
│   └── web/
│       ├── app/
│       │   ├── dashboard/
│       │   ├── projects/
│       │   ├── checkpoints/
│       │   ├── diff/
│       │   ├── investigations/
│       │   └── api/
│       ├── components/
│       │   ├── capture/
│       │   ├── timeline/
│       │   ├── image-overlays/
│       │   ├── physical-diff/
│       │   └── investigation/
│       └── lib/
│
├── packages/
│   ├── shared/
│   │   ├── schemas/
│   │   └── types/
│   ├── vision/
│   │   ├── providers/
│   │   ├── preprocessing/
│   │   └── normalization/
│   ├── physical-state/
│   │   ├── matching/
│   │   └── diff/
│   ├── investigation/
│   │   ├── ranking/
│   │   └── explanations/
│   └── git-integration/
│
├── tools/
│   └── cli/
│
├── supabase/
│   ├── migrations/
│   └── policies/
│
├── fixtures/
│   ├── images/
│   ├── checkpoints/
│   ├── expected-diffs/
│   └── test-results/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── architecture.md
│   ├── ai-pipeline.md
│   ├── data-model.md
│   ├── evaluation-plan.md
│   ├── demo-script.md
│   └── decisions/
│
└── .github/
    └── workflows/
```

## 21.1 Scaffold principles

- Use a single monorepo.
- Keep schemas shared between frontend and backend.
- Keep AI provider code behind an adapter.
- Keep deterministic diff logic independent of the language model.
- Keep demo fixtures separate from production data.
- Avoid premature service decomposition.
- Prefer working vertical slices over creating empty abstractions.

---

# 22. Configuration and Environment

## 22.1 Required environment variables

**Meta**

- `MODEL_API_KEY`
- `META_MODEL_BASE_URL`
- `META_VISION_MODEL`
- `META_SEGMENTATION_MODEL`

**Supabase**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Application**

- `APP_BASE_URL`
- `MAX_UPLOAD_SIZE_MB`
- `MAX_IMAGES_PER_CHECKPOINT`
- `INFERENCE_BUDGET_LIMIT`

Only public-safe values should use the `NEXT_PUBLIC_` prefix.

Never commit actual credentials.

## 22.2 Recommended defaults

- Vision model: `muse-spark-1.3`.
- Segmentation model: verify `sam-3.1` against current API.
- One primary image per checkpoint.
- Additional images optional.
- Manual Git association supported.
- Human verification enabled.
- Inference caching enabled.
- Automatic continuous capture disabled.

---

# 23. Major Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| AI cannot reliably trace wires | High | Guided capture and user-confirmed endpoints |
| False positive physical diffs | High | Alignment, confidence, review workflow |
| Similar wires cannot be matched | High | Stable IDs and unresolved states |
| SAM segmentation adds complexity | Medium | Keep optional; use boxes as fallback |
| Git and image timing mismatch | Medium | Explicit checkpoint association |
| Test scripts are hardware-dependent | Medium | Manual result fallback |
| API unavailable during demo | High | Retry, caching, honest replay |
| Scope expands too quickly | High | Enforce P0/P1/P2 |
| Mobile camera behaves differently | Medium | File-upload fallback |
| Photos expose private information | High | Crop, private storage, deletion |
| Suspect ranking hallucinates causes | High | Deterministic evidence ranking |
| Too much time spent on UI | Medium | Functional vertical slice first |

---

# 24. Product Differentiation

StateDiff should not be pitched as:

- “ChatGPT for hardware.”
- “AI that understands electronics.”
- “Take a photo and debug anything.”
- “Automatic circuit reverse engineering.”

These claims are too broad and difficult to defend.

## 24.1 Strong positioning

**StateDiff is a physical-state version-control layer for electronics prototypes.**

It combines:

1. Visual checkpoint history.
2. Structured physical-object tracking.
3. Evidence-based physical diffs.
4. Git commit association.
5. Test regression history.
6. Ranked debugging suspects.

## 24.2 Why it is more than a wrapper

The defensible engineering work is in:

- Defining a physical-state schema.
- Maintaining object identities across checkpoints.
- Reconciling uncertain visual observations.
- Producing structured, reviewable diffs.
- Linking physical and software timelines.
- Combining deterministic evidence with model reasoning.
- Supporting user correction and provenance.

The AI models are necessary components, but they are not the entire product.

## 24.3 What judges should remember

> Git can tell you which line of code changed. StateDiff can show you which wire moved—and connect both changes to the test that started failing.

---

# 25. Future Product Opportunities

Not for the hackathon MVP.

## 25.1 Hardware-aware Git commits

A physical snapshot becomes a first-class attachment to a Git commit.

## 25.2 Visual blame

Identify the checkpoint when a physical connection first changed.

## 25.3 Hardware regression bisect

Search a timeline to narrow down the first checkpoint associated with a failure.

## 25.4 Collaborative hardware history

Teams can review and annotate physical changes across prototype revisions.

## 25.5 Instrument integration

Bring in measured voltages, serial logs, and logic-analyzer traces.

This would allow StateDiff to distinguish visual observations from actual electrical measurements.

## 25.6 Schematic reconciliation

Compare an intended schematic against the observed and confirmed prototype state.

This is a substantial future research problem.

---

# 26. Open Decisions Before Implementation

Claude Code should surface these questions during planning.

1. Which exact ESP32/Arduino board will be used for the demo?
2. What is the simplest hardware test that can reliably transition PASS → FAIL → PASS?
3. Will the user capture images primarily with a phone or fixed webcam?
4. Can Meta Model API credentials be obtained immediately?
5. Does the SAM endpoint work for the selected images and prompts?
6. Should checkpoint creation initially require sign-in?
7. Is a local CLI feasible within the first six days?
8. What is the maximum acceptable manual annotation burden?
9. Which physical change can be detected most reliably on the chosen bench?
10. Are any hackathon rules relevant to pre-event work, code reuse, or submission requirements?

These should be resolved before expanding the feature list.

---

# 27. Instructions for Claude Code

## 27.1 Role

Act as a senior full-stack engineer, computer-vision systems designer, and pragmatic hackathon technical lead.

Your job is to turn this PRD into a working StateDiff MVP within the hackathon window.

## 27.2 Required engineering behavior

- Read this entire PRD before making architectural decisions.
- Begin with a short implementation plan.
- Identify assumptions that require validation.
- Verify current external API documentation.
- Use real model responses rather than inventing API schemas.
- Prefer minimal dependencies.
- Implement features in priority order.
- Keep deterministic business logic testable.
- Add clear uncertainty states.
- Never fabricate electrical measurements.
- Keep inference credentials server-side.
- Preserve source-image evidence.
- Build and test one complete workflow before adding extras.
- Document architectural tradeoffs.
- Report blockers early.
- Do not silently change scope.

## 27.3 First tasks

**Task 1:** Produce a concise architecture decision record.

**Task 2:** Verify Meta API access and test image understanding.

**Task 3:** Test SAM segmentation on a real breadboard image.

**Task 4:** Define the minimum physical-state schema.

**Task 5:** Define the end-to-end checkpoint workflow.

**Task 6:** Create a prioritized implementation backlog.

**Task 7:** Implement the smallest working vertical slice.

## 27.4 Required implementation order

1. Real image input.
2. Real model inference.
3. Validated structured observations.
4. Persistent checkpoint.
5. Second checkpoint.
6. Physical diff.
7. Evidence overlay.
8. Git association.
9. Test status.
10. Suspect ranking.
11. Human correction.
12. Optional CLI and polish.

This order is deliberate.

Do not start with elaborate dashboards or agent orchestration.

## 27.5 Definition of done

A feature is complete only when:

- It works end to end.
- It handles at least one failure condition.
- Its data is persisted correctly.
- Its output is grounded in real evidence.
- It has an appropriate test.
- It can be demonstrated without developer-only workarounds.

## 27.6 Scope discipline

If a feature threatens the demo deadline:

- Simplify it.
- Add a manual fallback.
- Defer it.
- Document the tradeoff.

The priority is a credible working system, not the maximum number of features.

---

# 28. Suggested Supporting Documents

Claude Code may generate these after initial planning:

**`CLAUDE.md`**

Repository conventions, engineering rules, commands, and development workflow.

**`docs/architecture.md`**

System components, data flow, deployment, and boundaries.

**`docs/ai-pipeline.md`**

Model prompts, schema validation, segmentation, and uncertainty handling.

**`docs/data-model.md`**

Final database schema and entity relationships.

**`docs/evaluation-plan.md`**

Test fixtures, ground truth, metrics, and regression testing.

**`docs/demo-script.md`**

Exact demonstration steps, timing, backup plan, and required hardware.

**`docs/decisions/`**

Architecture decision records for important tradeoffs.

These documents should reflect the implemented system, not remain speculative placeholders.

---

# 29. Official Documentation and References

The following resources were checked when preparing this PRD.

## Hackathon

Meta Global AI Developer Hackathon:

https://dev.meta.ai/events/global-hackathon

## Meta Model API

API overview:

https://dev.meta.ai/docs/overview

Quickstart:

https://dev.meta.ai/docs/quickstart

API reference:

https://dev.meta.ai/docs/api-reference

Image understanding:

https://dev.meta.ai/docs/image-understanding

Structured output:

https://dev.meta.ai/docs/cookbook/structured-output

SAM 3.1 overview:

https://dev.meta.ai/docs/sam/overview

SAM segmentation documentation:

https://dev.meta.ai/docs/media-segmentation

Pricing and rate limits:

https://dev.meta.ai/docs/pricing-rate-limits

Authentication:

https://dev.meta.ai/docs/authentication

## Development references

Next.js:

https://nextjs.org/docs

Supabase:

https://supabase.com/docs

Vercel:

https://vercel.com/docs

Git:

https://git-scm.com/docs

## Documentation caveat

External API behavior, pricing, access requirements, and hackathon rules may change.

Claude Code must verify the relevant current documentation and run integration smoke tests before treating any external capability as confirmed.

---

# 30. Final Product Principle

StateDiff should make physical debugging more reproducible.

Its credibility depends on distinguishing three categories of information:

**What the camera observed.**

**What the developer confirmed.**

**What the tests actually proved.**

The product becomes valuable when these facts are stored together in a searchable, versioned history.

The goal is not to pretend that AI can see through wires or measure invisible voltages.

The goal is to give physical prototyping the same discipline that Git gave software development.

**Build the smallest version that proves this is possible.**
