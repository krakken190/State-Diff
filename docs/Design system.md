# StateDiff — Design System

**File:** `Design system.md`  
**Version:** 1.0  
**Product:** StateDiff  
**Design direction:** technical clarity, evidence-first debugging, mobile-first capture

## 1. Design philosophy

StateDiff should feel like a modern developer tool that understands physical hardware.

The interface must answer:
1. What did I capture?
2. What changed?
3. What evidence supports that change?
4. How certain is the observation?
5. What should I check next?

The interface should not resemble a generic AI chatbot. The central artifact is a **visual physical-state diff**, supported by Git and test evidence.

## 2. Brand and tone

**Personality:** precise, calm, credible, engineering-oriented.  
**Visual metaphor:** Git diff meets hardware workbench.  
**Voice:** concise, evidence-backed, never overconfident.

Preferred wording:
- “Possible connection change”
- “Visible endpoint moved”
- “Needs confirmation”
- “Test changed from PASS to FAIL”
- “Image evidence is insufficient”

Avoid:
- “AI proved the circuit is broken”
- “Guaranteed root cause”
- “Electrical connection verified” based on photos alone
- “100% accurate”

## 3. Color tokens

Use semantic tokens rather than scattering hex values through components.

### Dark theme — preferred demo mode

| Token | Value | Usage |
|---|---|---|
| `--background` | `#0B1020` | Application background |
| `--surface` | `#141B2D` | Cards/panels |
| `--surface-raised` | `#1C263A` | Popovers and active panels |
| `--border` | `#344156` | Dividers |
| `--text-primary` | `#F4F7FB` | Primary text |
| `--text-secondary` | `#B7C3D6` | Secondary text |
| `--accent` | `#6D9FFF` | Actions and focus |
| `--accent-strong` | `#3F7BF3` | Primary buttons |
| `--success` | `#39C998` | Confirmed pass |
| `--danger` | `#FF6D7A` | Failed tests, removed items |
| `--warning` | `#F7BE58` | Uncertainty |
| `--info` | `#6D9FFF` | Informational |
| `--added` | `#39C998` | Added physical entities |
| `--removed` | `#FF6D7A` | Removed entities |
| `--changed` | `#F7BE58` | Moved/modified |
| `--unknown` | `#AAB4C7` | Unresolved |

### Light theme

| Token | Value |
|---|---|
| `--background` | `#F6F8FC` |
| `--surface` | `#FFFFFF` |
| `--surface-raised` | `#EEF3FA` |
| `--border` | `#CDD6E3` |
| `--text-primary` | `#142036` |
| `--text-secondary` | `#4B5B72` |
| `--accent` | `#245DD1` |
| `--success` | `#087A57` |
| `--danger` | `#B42338` |
| `--warning` | `#8B5900` |

Verify actual contrast ratios in rendered states. Tokens are a starting palette, not a substitute for accessibility testing.

## 4. Typography

Recommended:
- Interface: Inter or system sans-serif.
- Code, commit SHAs, pin names, test output: JetBrains Mono or system monospace.

Scale:
- Display: 32–40 px, semibold.
- Page title: 24–30 px.
- Section heading: 18–22 px.
- Card heading: 15–17 px.
- Body: 14–16 px.
- Secondary: 12–14 px.
- Code labels: 12–13 px.

Never shrink critical evidence labels below a readable size merely to fit a dense desktop panel.

## 5. Spacing and layout

Use a 4 px base unit:
`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.

Corner radii:
- Small controls: 8 px.
- Cards: 12 px.
- Large panels: 16 px.
- Pills: 999 px.

Borders: 1 px default; use 2 px for active selections.

Shadows: subtle, primarily for popovers. Favor borders and surface contrast over heavy elevation.

## 6. Responsive breakpoints

- Small mobile: under 480 px.
- Mobile/tablet: 480–767 px.
- Tablet: 768–1023 px.
- Desktop: 1024 px and above.
- Wide workbench: 1440 px and above.

Mobile priorities:
- Full-width capture surface.
- Sticky bottom primary action.
- Single-column review cards.
- Horizontal image comparison slider.
- Large endpoint selection targets.
- No hover-only functionality.

Desktop priorities:
- Sidebar navigation.
- Two-pane before/after comparison.
- Evidence inspector alongside image.
- Persistent Git/test metadata rail.

## 7. Navigation architecture

Primary screens:
1. **Projects** — recent projects and new project.
2. **Project timeline** — chronological checkpoints and status.
3. **Capture checkpoint** — camera and metadata.
4. **Review observations** — overlays and correction workflow.
5. **Compare checkpoints** — visual diff.
6. **Investigation** — ranked suspects and evidence.
7. **Project settings** — privacy, deletion and provider status.

Suggested desktop navigation: Projects / Timeline / Compare / Settings.

Suggested mobile navigation: contextual top bar, one primary action, compact bottom navigation only if it simplifies the flow.

## 8. Core components

### 8.1 Project card
Displays project name, rig type, latest checkpoint, latest test status and next action. Avoid displaying an unsupported “hardware health” score.

### 8.2 Checkpoint timeline item
Displays:
- Capture time.
- Checkpoint label.
- Git short SHA, if linked.
- Test result and source.
- Analysis/review status.
- Photo thumbnail.
- Compare action.

A missing test must show “No test attached,” not PASS.

### 8.3 Camera capture surface
Required elements:
- Camera/file permission state.
- Live preview when supported.
- Alignment grid.
- Guidance: “Keep board and wire endpoints visible.”
- Capture/retake controls.
- Photo quality warning.
- Upload progress.
- Accessible fallback file picker.

Do not require a native app or specialized camera.

### 8.4 Observation overlay
Draw boxes, endpoints and wires over the photo.

Each overlay needs:
- Stable observation ID.
- Visual selection state.
- Label and provenance.
- Confidence/uncertainty presentation.
- Link to evidence inspector.

Use distinct line styles as well as color:
- Solid: user-confirmed.
- Dashed: AI-inferred.
- Dotted: unresolved.
- Selected: thicker outline plus visible handles.

Do not use color as the sole difference indicator.

### 8.5 Endpoint editor
Interaction:
1. Select wire observation.
2. Inspect endpoint A.
3. Choose visible terminal, choose “Unknown,” or mark wrong.
4. Repeat for endpoint B.
5. Confirm change.
6. Show correction history.

On mobile, use a bottom sheet with large tap targets and a zoomed crop.

### 8.6 Physical diff item
Required fields:
- Event type: Added / Removed / Moved / Connection changed / Unresolved.
- Before evidence.
- After evidence.
- Reviewed/inferred provenance.
- Confidence or uncertainty.
- “Inspect on image” action.

### 8.7 Suspect card
Displays rank, concise title, linked diff event, test transition, evidence count and uncertainty.

Use “Suggested check” instead of “Fix now” unless the action is user-verified.

### 8.8 Git and test strip
Example:

`Commit a3f19b2 · Test: FAIL · Source: CLI · 10:42`

Provide full SHA on click or in a details panel. If source is manual, label it explicitly.

## 9. Comparison workspace

### Desktop composition

```text
┌──────────────────────────────────────────────────────────────┐
│ Project / Rig / Baseline → Candidate                         │
├─────────────────────────┬────────────────────────────────────┤
│ Before photo + overlays │ After photo + overlays             │
│                         │                                    │
├─────────────────────────┴────────────────────────────────────┤
│ Test PASS → FAIL | Git SHA A → B | 3 physical changes         │
├──────────────────────────────────┬───────────────────────────┤
│ Change list                      │ Evidence / suspect detail │
└──────────────────────────────────┴───────────────────────────┘
```

### Mobile composition
- Baseline/candidate toggle or swipe slider.
- Overlay toggle.
- Sticky summary strip.
- Change list below.
- Bottom sheet for evidence and corrections.

Avoid forcing two tiny photos side by side on narrow screens.

## 10. Image geometry and zoom

Store normalized coordinates in [0,1]. Render overlays using the actual displayed image rectangle, not the outer container.

Account for:
- EXIF orientation normalization.
- Letterboxing.
- Object-fit contain.
- Image resize.
- Zoom/pan transforms.
- Cropped inference inputs.

Provide:
- Zoom in/out.
- Reset view.
- Fit image.
- Overlay visibility toggle.
- Keyboard-accessible selection where practical.

Do not draw endpoint markers outside the actual photo bounds.

## 11. Provenance system

Provenance is separate from confidence.

| Provenance | UI label | Visual treatment |
|---|---|---|
| `VISION_INFERRED` | AI observation | Dashed outline |
| `USER_CONFIRMED` | Confirmed by you | Solid outline/check |
| `TEST_OBSERVED` | Test result | Terminal/test icon |
| `GIT_OBSERVED` | Git metadata | Commit icon |
| `DEVICE_MEASURED` | Device measurement | Instrument icon |
| `UNKNOWN` | Unknown | Dotted outline/question |

A confidence of 0.95 does not mean the connection was electrically measured.

## 12. Confidence presentation

Use plain-language bands for MVP:
- High visual confidence.
- Medium visual confidence.
- Low visual confidence.
- Unknown.

Show raw numerical confidence only in advanced details, and only when meaningful.

If the model does not provide a calibrated confidence, use “Not assessed” rather than inventing a number.

## 13. Status and feedback

### Loading
Use specific progress labels:
- “Uploading photo”
- “Analyzing visible components”
- “Preparing review”
- “Comparing checkpoints”

Avoid a fake progress percentage for unpredictable inference calls.

### Empty
- No projects: “Create your first hardware project.”
- No checkpoints: “Capture a known-good baseline.”
- No differences: “No supported visible changes found.”
- No test: “Attach a test result to correlate this checkpoint.”

### Error
- Camera blocked: offer file upload.
- Image blurry: offer retake.
- Model unavailable: offer retry/manual review.
- Analysis invalid: preserve photo and show safe error.
- Ambiguous endpoint: ask user to confirm.
- Offline: preserve unsent form state where feasible.

## 14. Accessibility

Target WCAG 2.2 AA:
- Text contrast at least 4.5:1 for normal text.
- Non-text UI contrast at least 3:1 where applicable.
- Visible focus indicators.
- Semantic buttons, labels and dialogs.
- Keyboard navigation for core actions.
- Screen-reader descriptions for images and overlays.
- No color-only meaning.
- Reduced-motion support.
- Touch controls preferably 44 × 44 CSS px.
- Focus restoration after modal/bottom-sheet closure.
- Meaningful error text adjacent to affected inputs.

Provide a text-based change list as an accessible alternative to image-only overlays.

## 15. UI copy examples

| Context | Preferred copy |
|---|---|
| Start baseline | “Capture known-good state” |
| Start candidate | “Capture changed state” |
| Review | “Confirm visible connections” |
| Uncertain endpoint | “Endpoint not clearly visible” |
| Diff title | “3 visible changes detected” |
| Suspect | “Possible cause to inspect” |
| No certainty | “This photo cannot verify continuity” |
| Recovery | “Capture after fix” |

## 16. Demo narrative

The ideal demo screen sequence:
1. Open project timeline with baseline PASS.
2. Show baseline image and reviewed wiring.
3. Capture or open candidate FAIL.
4. Highlight a moved jumper.
5. Show physical diff with before/after evidence.
6. Show a Git revision and test transition.
7. Present an appropriately uncertain suspect.
8. Open recovery checkpoint with PASS.

Keep the demo's strongest moment visual: the same physical area highlighted across two checkpoints.

## 17. Design implementation rules

- Build on Tailwind and shadcn/ui.
- Centralize semantic tokens.
- Do not mix arbitrary colors into feature components.
- Every status badge needs accessible text.
- Every image overlay must support an equivalent textual finding.
- Reuse a single evidence inspector across review and comparison.
- Keep UI responsive without separate mobile/desktop codebases.
- Use realistic demo imagery, not fabricated AI hardware “proof.”

## 18. Design QA checklist

- [ ] Capture usable on a small phone.
- [ ] Before/after photos remain legible.
- [ ] Wire endpoints can be selected without precision tapping.
- [ ] Unknowns are visually distinct from confirmed edges.
- [ ] PASS/FAIL is never conveyed by color alone.
- [ ] Keyboard focus is visible.
- [ ] Screen reader can access diff list.
- [ ] Loading/error states preserve user progress.
- [ ] Dark and light themes pass contrast checks.
- [ ] Screenshot-ready demo layout works at 1366 × 768.

## 19. References

- shadcn/ui: https://ui.shadcn.com/docs
- Tailwind CSS: https://tailwindcss.com/docs
- WCAG 2.2: https://www.w3.org/TR/WCAG22/

**Companion documents:** `architecture.md`, `database.md`, `testing.md`.
