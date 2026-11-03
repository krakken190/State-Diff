# StateDiff — Git for the physical world

> Git can tell you which line of code changed. StateDiff shows you which wire moved, and connects both to the test that started failing.

StateDiff is version control and regression debugging for electronics prototypes. You capture **checkpoints** of your bench (a photo, the Git commit, test results). Meta's **Muse Spark** model proposes a structured list of the parts and wire endpoints it can see. You confirm or correct it, and the checkpoint is sealed as an immutable snapshot graph. When a test goes **PASS → FAIL**, StateDiff diffs the two physical states, pulls in the Git changes, and ranks the likely suspects, each linked to the photo evidence.

Built for the **Meta Global AI Developer Hackathon 2026** (Indie track).

## What makes it more than "AI describes a photo"

- **Structured physical state.** Parts, terminals and wire edges are stored as a versioned graph, and the photo is kept as evidence.
- **Deterministic diff.** `domain/diff/compare.ts` is pure, order-independent and unit-tested. The model never writes diff events.
- **Honest uncertainty.** An endpoint the model can't see stays *unresolved*; it is never turned into a fabricated connection. Similar wires are never matched by colour alone. Removals read "not visible, removal unconfirmed".
- **Provenance is separate from confidence.** "AI observation", "Confirmed by you", "Test result" and "Git metadata" are tracked and displayed separately.
- **Explainable ranking.** Score = evidence × relevance × test transition × provenance. Every factor is shown, and the UI says *likely suspect*, never *root cause*.
- **Append-only history.** Original model output and every correction are kept. SQLite triggers block in-place edits of observations and sealed snapshots.

## Architecture

```
Browser (Next.js 16 App Router, Tailwind)
   │  capture → review/correct → seal → compare
   ▼
Route handlers (app/api/*) ── Zod validation, error envelope, same-origin guard
   │
   ├── lib/vision     Meta Model API adapter (muse-spark-1.3, JSON-schema structured output)
   ├── lib/images     decode-validate, EXIF strip, orientation, ≤1600px inference copy (sharp)
   ├── lib/repo       SQLite (node:sqlite) repositories, append-only corrections
   └── domain/        pure logic: materialize graph · diff · suspect ranking · correction fold
scripts/statediff.ts  local CLI: Git metadata + user-configured test commands (no shell, no model commands)
demo/                 simulated rig: scene files → rendered bench photos + simulated HIL tests
```

Specs live in [`docs/`](docs/): PRD, architecture, database, security, testing, code style, design system and AI-agent instructions.

## Local edition and simulated rig (please read)

This hackathon build runs **entirely locally**: SQLite plus files under `data/`, with no auth and no cloud database. The Meta Model API is the only network dependency.

The author had no physical electronics bench, so the demo uses a **simulated rig**. `demo/scenes/*.json` describe an ESP32 + L9110S motor driver + DHT22 bench, `demo/render.ts` renders them into bench images, which were then made more realistic with an AI image tool (each one checked by eye and by the model against the intended wiring), and `demo/sim-test.ts` stands in for a hardware-in-the-loop test by checking the firmware's `MOTOR_PIN` against the scene's wiring. These are not photographs of real hardware. The **vision model only ever sees the image**, never the scene file, so the scene files double as ground truth for evaluating it. Test results from the simulator are labelled `simulated` everywhere in the UI.

## Run it

Requires Node 24+ and pnpm.

```bash
pnpm install
# put your Meta key in .env.local (MODEL_API_KEY=...)
pnpm dev                     # http://localhost:3000
```

**Model choice.** `META_VISION_MODEL` defaults to `muse-spark-1.3` (Standard: inputs are not used for training). The demo uses `muse-spark-1.3-contributor`, which is about 12–20× cheaper, but Meta may train on the images and responses. That's acceptable for the simulated rig's rendered photos, not for private hardware. The UI labels every analysis that ran in Contributor mode.

Run the demo in a second terminal:

```bash
pnpm demo setup              # demo firmware Git repo + project
pnpm demo step a             # known-good: commit + motor_test PASS
pnpm demo step b             # firmware tweak committed, yellow jumper moved → motor_test FAIL
pnpm demo step c             # jumper restored → PASS
```

Each step prints a checkpoint URL and the photo to upload. In the app, upload the photo, click **Analyze**, review, then **Seal**. On the project page, click **"What changed since the last passing test?"**. Add `--upload --analyze` to a step to automate the upload and analysis.

## Other commands

| Command | What it does |
|---|---|
| `pnpm test` | Unit tests (diff, ranking, ambiguity, determinism), no network |
| `pnpm typecheck` / `pnpm lint` | Static checks |
| `pnpm smoke:meta` | Opt-in live Meta call: lists models, runs one extraction, records it for replay |
| `pnpm demo:render` | Re-render the simulated bench photos |
| `pnpm sd init/checkpoint/test/status` | Local CLI for a real firmware repo |

**Replay mode.** `VISION_PROVIDER=replay` re-serves recorded *real* Meta responses for byte-identical images (for when the network fails during judging). The UI then shows "Replay of a recorded Meta response — not a live call".

## Known limitations

- Photos cannot verify continuity, voltage or resistor values, and the app never claims they do.
- Breadboard rail connectivity is not modelled. Wires are tracked between labelled header pins.
- One photo per checkpoint is analyzed. SAM segmentation and multi-image fusion are not implemented (both P1).
- Local single-user build. Supabase/RLS/auth from the specs are intentionally out of scope here.
