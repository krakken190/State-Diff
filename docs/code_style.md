# StateDiff — Code Style and Engineering Standards

**File:** `code_style.md`  
**Version:** 1.0  
**Stack:** TypeScript, Next.js App Router, React, Supabase, Zod, Tailwind  
**Audience:** Human contributors and Claude Code

## 1. Goals

The codebase must remain understandable, testable and secure under hackathon time pressure.

Prefer:
- Small cohesive modules.
- Strict types.
- Explicit data boundaries.
- Deterministic business logic.
- Minimal dependencies.
- Tests for critical behavior.
- Clear naming over clever abstractions.

Do not optimize for hypothetical scale before the P0 workflow works.

## 2. Language and tooling

- TypeScript strict mode enabled.
- Modern Node.js LTS supported by chosen Next.js version.
- Next.js App Router.
- React functional components.
- Zod for runtime validation.
- ESLint and Prettier.
- Vitest for unit/integration.
- Playwright for E2E.
- Supabase generated database types.

Use a single package manager and commit its lockfile.

Avoid mixing JavaScript and TypeScript except for tool configuration that requires it.

## 3. Suggested repository layout

```text
statediff/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   └── api/
├── components/
│   ├── ui/
│   ├── capture/
│   ├── review/
│   ├── comparison/
│   └── evidence/
├── features/
│   ├── projects/
│   ├── checkpoints/
│   ├── captures/
│   ├── observations/
│   ├── snapshots/
│   ├── comparisons/
│   └── investigations/
├── lib/
│   ├── auth/
│   ├── db/
│   ├── storage/
│   ├── meta/
│   ├── images/
│   ├── errors/
│   └── logging/
├── domain/
│   ├── graph/
│   ├── diff/
│   ├── evidence/
│   └── provenance/
├── schemas/
├── tests/
│   ├── fixtures/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── supabase/
│   └── migrations/
├── docs/
├── scripts/
├── .env.example
└── CLAUDE.md
```

This is a guideline, not a mandate to create empty directories.

## 4. Dependency direction

Allowed direction:

`UI → feature service → domain logic / infrastructure adapter`

Rules:
- UI components do not call Meta directly.
- UI components do not use service-role credentials.
- Domain diff logic has no dependency on Next.js, Supabase or HTTP.
- Provider adapters return validated domain DTOs.
- Database repositories do not contain presentation logic.
- Route handlers are thin orchestration layers.
- Never import server-only modules into client components.

## 5. Naming conventions

| Element | Convention | Example |
|---|---|---|
| Variables | camelCase | `checkpointId` |
| Functions | camelCase, verb-led | `sealCheckpoint` |
| Types/interfaces | PascalCase | `SnapshotNode` |
| React components | PascalCase | `EvidenceInspector` |
| Constants | UPPER_SNAKE_CASE | `MAX_IMAGE_BYTES` |
| Database tables | snake_case plural | `analysis_runs` |
| Database columns | snake_case | `project_id` |
| API routes | lowercase kebab-case | `/api/test-runs` |
| File names | kebab-case | `snapshot-materializer.ts` |
| Tests | `.test.ts` / `.spec.ts` | `graph-diff.test.ts` |
| Environment variables | UPPER_SNAKE_CASE | `META_API_KEY` |

Prefer descriptive names. Avoid ambiguous `data`, `item`, `result2` in domain logic.

## 6. TypeScript rules

Required:
- `strict: true`.
- No implicit `any`.
- Prefer `unknown` at external boundaries.
- Narrow types through validation.
- Use discriminated unions for states.
- Prefer readonly inputs for pure functions.
- Use exhaustive handling for domain event variants.
- Avoid non-null assertions without a documented invariant.
- Avoid TypeScript suppression comments unless narrowly justified.

Example:

```ts
type AnalysisStatus =
  | { kind: "queued" }
  | { kind: "running"; startedAt: string }
  | { kind: "succeeded"; analysisRunId: string }
  | { kind: "failed"; errorCode: string };
```

Avoid a single mutable object with many nullable fields when a discriminated union expresses valid states more clearly.

## 7. Runtime validation

Every untrusted boundary requires validation:
- API request body.
- Query parameters.
- Route params.
- CLI input.
- Environment variables.
- Provider JSON.
- Database JSONB loaded into domain code.

Example:

```ts
import { z } from "zod";

export const NormalizedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
}).strict();

export type NormalizedPoint =
  z.infer<typeof NormalizedPointSchema>;
```

Never use `as SomeType` to bypass parsing of model responses.

## 8. Error handling

Use stable domain error codes:
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION_FAILED`
- `CONFLICT`
- `UPLOAD_REJECTED`
- `ANALYSIS_UNAVAILABLE`
- `PROVIDER_RATE_LIMITED`
- `INVALID_PROVIDER_OUTPUT`
- `SNAPSHOT_NOT_READY`
- `INTERNAL_ERROR`

Public API errors must not include stack traces or provider secrets.

Suggested envelope:

```json
{
  "error": {
    "code": "SNAPSHOT_NOT_READY",
    "message": "Review and seal both checkpoints before comparing."
  },
  "requestId": "request-uuid"
}
```

Use typed error mapping at the route boundary. Do not scatter arbitrary status codes through services.

## 9. Result pattern

Prefer explicit expected-failure results in domain code when useful:

```ts
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

Unexpected infrastructure failures may throw and be caught at the route/service boundary.

Do not use exceptions for normal “unknown endpoint” cases. Unknown is valid domain data.

## 10. Next.js conventions

- Use App Router and Route Handlers.
- Keep server-side fetching on the server where appropriate.
- Mark client components with `"use client"` only when needed.
- Keep image processing, provider calls and secrets server-only.
- Avoid duplicate fetching between server and client.
- Prefer URL-driven state for shareable comparison views.
- Validate dynamic route parameters.
- Use accessible loading and error states.
- Avoid long-running detached promises in serverless routes.

## 11. React component standards

Components should:
- Have a clear single responsibility.
- Use typed props.
- Keep data fetching separate from complex presentation where practical.
- Avoid deeply nested conditional JSX.
- Use semantic HTML.
- Expose loading, empty, error and success states.
- Respect keyboard and touch interactions.
- Reuse design tokens and shadcn primitives.

For large image review components, separate:
- Image viewport.
- Overlay renderer.
- Selection state.
- Evidence inspector.
- Correction form.

Avoid placing all logic in one 1,000-line page component.

## 12. Data access rules

- Use typed repository/service functions.
- Do not build raw SQL strings from user input.
- Always scope queries to authenticated project ownership.
- Use transactions for checkpoint sealing.
- Never let the browser choose arbitrary storage paths.
- Keep migrations versioned.
- Do not assume client-side filtering is authorization.
- Use pagination on timeline and history endpoints.

Prefer database constraints for permanent invariants, with application validation for friendly error messages.

## 13. AI integration conventions

Create a provider adapter interface, e.g.:

```ts
interface VisionProvider {
  extractObservations(
    input: VisionInput
  ): Promise<VisionExtraction>;
}
```

The domain layer should not depend on Meta-specific HTTP response types.

Provider adapter responsibilities:
- Authentication.
- Request formatting.
- Timeout/retry.
- Response parsing.
- Schema validation.
- Provider error mapping.
- Safe usage metrics.

Do not let model output directly create sealed snapshot edges without review and validation.

## 14. Domain graph conventions

A snapshot graph is immutable.

Node kinds:
- `board`
- `component`
- `terminal`

Edge kinds for MVP:
- `wire_connection`

Unknown endpoints remain in observations; do not force them into canonical edges.

Matching rules:
1. User-confirmed stable logical key.
2. Kind and label similarity.
3. Approximate geometry.
4. Ambiguity threshold.
5. Explicit unresolved event.

Do not match wires solely by color.

## 15. Deterministic diff rules

Diff functions must be:
- Pure.
- Versioned.
- Order-independent.
- Idempotent.
- Unit-tested.
- Free from provider calls.
- Explicit about ambiguity.

Recommended signature:

```ts
function compareSnapshots(
  baseline: SnapshotGraph,
  candidate: SnapshotGraph
): DiffResult;
```

Sort canonical nodes and edges before comparison so DB retrieval order does not affect results.

Use stable event IDs or deterministic keys where possible.

## 16. Provenance rules

Never collapse these concepts:
- Model confidence.
- Human confirmation.
- Test observation.
- Git observation.
- Device measurement.

Use typed provenance values. An AI observation remains inferred even if it has high confidence.

Every finding must reference real stored evidence IDs.

## 17. Logging conventions

Structured log fields:
- `requestId`
- `projectId`
- `operation`
- `durationMs`
- `outcome`
- `errorCode`

Do not log:
- API keys.
- Private image URLs.
- Session cookies.
- Raw images.
- Unredacted test logs.
- Full sensitive prompts.

Use a consistent logger wrapper rather than scattered `console.log` in production paths.

## 18. Comments and documentation

Comments should explain **why**, not restate the code.

Document:
- Non-obvious matching heuristics.
- Security-sensitive assumptions.
- Provider API workarounds.
- Image coordinate transforms.
- Database transaction invariants.
- Known model limitations.

Every exported domain utility should have a clear contract. Avoid large comment blocks that become stale.

## 19. Formatting and linting

Suggested standards:
- Prettier formatting.
- ESLint with Next.js and TypeScript rules.
- Consistent import ordering.
- No unused imports.
- No unused variables.
- No implicit fallthrough.
- Prefer named exports for reusable domain modules.
- Prefer small focused files, but do not split trivial functions across many files.

Do not auto-format generated migration SQL in ways that obscure review.

## 20. Test style

Test names should describe behavior:

Good:
`it("marks an occluded endpoint as unresolved")`

Weak:
`it("works")`

Each test should:
- Arrange known inputs.
- Execute one behavior.
- Assert meaningful outcomes.
- Avoid external network by default.
- Avoid order dependence.
- Use fixtures with explicit provenance.

Mock Meta at unit/integration boundaries; maintain a separate opt-in live provider smoke test.

## 21. Performance practices

- Avoid sending full-resolution originals to inference unnecessarily.
- Bound list queries.
- Avoid N+1 reads in comparison views.
- Memoize expensive derived overlay geometry when appropriate.
- Keep graph matching efficient for small rigs.
- Cache only data that is safe to cache across authorization boundaries.
- Measure before adding complex optimization.

## 22. Git workflow

Recommended branches:
- `feat/capture-flow`
- `feat/vision-review`
- `feat/graph-diff`
- `fix/rls-policy`
- `test/demo-e2e`

Commit messages:
- `feat: add checkpoint capture review`
- `fix: reject cross-project snapshot edges`
- `test: cover ambiguous wire endpoints`
- `docs: record vision provider contract`

Prefer small commits with a passing relevant test suite.

## 23. Pull request checklist

- [ ] Scope is P0 or justified P1.
- [ ] Types are strict.
- [ ] Inputs are validated.
- [ ] Authorization is enforced.
- [ ] No secrets are exposed.
- [ ] Database changes have migrations.
- [ ] RLS/storage changes are tested.
- [ ] Domain logic is deterministic.
- [ ] AI uncertainty is preserved.
- [ ] UI has accessible states.
- [ ] Tests were actually run.
- [ ] Documentation reflects behavior.
- [ ] No unnecessary dependency was added.

## 24. Definition of done

A feature is done only when:
1. It works in the intended user journey.
2. It has appropriate validation and authorization.
3. It handles failure without data loss.
4. Its critical behavior is tested.
5. It conforms to the design system.
6. It does not misrepresent AI confidence.
7. The implementation agent reports actual verification results.

## 25. References

- TypeScript: https://www.typescriptlang.org/docs/
- Next.js: https://nextjs.org/docs
- Zod: https://zod.dev/
- ESLint: https://eslint.org/docs/latest/
- Vitest: https://vitest.dev/
- Playwright: https://playwright.dev/

**Companion documents:** `architecture.md`, `database.md`, `AI agents instruction.md`, `testing.md`.
