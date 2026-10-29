@AGENTS.md

# StateDiff — "Git for the physical world"

Hackathon entry (Meta Global AI Developer Hackathon 2026, Indie track). Deadline: **Nov 4, 2026, 9:00 PM ET**. Deliverables: repo access + demo video.

## Specs
Full specs live in `docs/`: `PRD.md`, `architecture.md`, `database.md`, `security.md`, `testing.md`, `code_style.md`, `Design system.md`, `AI agents instruction.md`. Read the relevant one before changing an area.

## Local-edition deviations from the specs (decided with the user, 2026-10-29)
- **Runs locally only.** No Supabase/Vercel/auth: SQLite via `node:sqlite` (`data/statediff.db`) and local file storage (`data/captures/`). Single implicit local user. Not intended for public deployment.
- **No physical hardware.** The demo uses a *simulated rig*: `demo/` renders photo-like breadboard images from scene files and runs a simulated motor test against the scene's ground-truth wiring. The UI and README must label this as simulated.
- Env var for the Meta key is `MODEL_API_KEY` (matches Meta docs).

## Invariants (never break)
- The vision model proposes observations; deterministic code in `domain/` computes diffs and suspect scores.
- Unknown wire endpoints stay unresolved; never fabricate edges, voltages, or continuity.
- Provenance (`VISION_INFERRED`, `USER_CONFIRMED`, `TEST_OBSERVED`, `GIT_OBSERVED`, …) is separate from confidence.
- Original captures and model outputs are never overwritten; corrections are append-only.
- Every finding cites stored diff-event/evidence IDs; unknown IDs invalidate model output.
- `MODEL_API_KEY` is server-only. Model output never becomes a shell command.
- Replayed (recorded) inference is labelled "replay" in the UI, never presented as live.

## Commands
- `pnpm dev` — run the app at http://localhost:3000
- `pnpm test` — unit tests (Vitest, no network)
- `pnpm typecheck` / `pnpm lint`
- `pnpm demo setup` / `pnpm demo step a|b|c [--upload] [--analyze]` — drive the simulated PASS→FAIL→PASS demo (app must be running)
- `pnpm demo:render` — regenerate simulated rig images
- `pnpm sd …` — local companion CLI (`scripts/statediff.ts`)
- `pnpm smoke:meta` — opt-in live Meta API smoke test (needs `MODEL_API_KEY`)

## Layout
`app/` routes + API handlers · `components/` UI · `domain/` pure diff/graph/investigation logic · `lib/` db, storage, meta adapter, images · `schemas/` Zod contracts · `demo/` simulated rig · `tests/` unit tests.
