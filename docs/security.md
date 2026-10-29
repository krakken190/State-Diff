# StateDiff — Security Architecture and Controls

**File:** `security.md`  
**Version:** 1.0  
**Security baseline:** Private-by-default hackathon MVP  
**Status:** Required implementation guidance

## 1. Security objectives

Protect:
- User accounts and project ownership.
- Private hardware/workbench photographs.
- Git metadata and test logs.
- Meta Model API credentials.
- Supabase credentials and storage.
- User machines running the optional CLI.
- Billing resources against abuse.

StateDiff handles potentially sensitive engineering imagery. A workbench photo may expose serial numbers, customer hardware, physical location clues, labels or proprietary circuits.

## 2. Threat model

### Assets
1. Authentication sessions.
2. Project and checkpoint records.
3. Capture images and derived crops.
4. Analysis and correction history.
5. Git/test evidence.
6. Provider credentials.
7. CLI authentication tokens.

### Trust boundaries
- Browser ↔ Next.js API.
- Next.js API ↔ Supabase.
- Next.js API ↔ Meta Model API.
- User workstation ↔ optional CLI.
- User-supplied image/text ↔ runtime model.

### Principal threats

| Threat | Impact | Primary mitigation |
|---|---|---|
| Cross-user project access | Data exposure | RLS + ownership checks |
| Private image URL leakage | IP/privacy exposure | Private bucket + short-lived URLs |
| Malicious image upload | Parser exploit/resource exhaustion | File signature, size, decode limits |
| Prompt injection in photo | Unsafe model instructions | Strict task isolation, no tool execution |
| Test log containing secrets | Credential exposure | Redaction and bounded storage |
| API key leaked to browser | Cost and data risk | Server-only secrets |
| Unbounded inference requests | Cost exhaustion | Quotas, rate limits, timeouts |
| CLI arbitrary command execution | Workstation compromise | Explicit allowlist/user-controlled execution |
| SQL injection | Data compromise | Parameterized queries |
| Replay/duplicate mutations | Duplicate evidence | Idempotency keys |
| Dependency compromise | Supply-chain compromise | Lockfiles, audit, pinned CI actions |

## 3. Authentication

Use Supabase Auth for the web application.

Requirements:
- Secure session handling appropriate to Next.js App Router.
- Protected application routes and API handlers.
- No trust in client-provided `user_id`.
- Revalidate identity on each sensitive API request.
- Expired/revoked sessions must not retain API access.
- Redirect unauthenticated users without exposing project data.
- Do not log session cookies or authorization headers.

Use HTTPS in all deployed environments.

## 4. Authorization

MVP: project owner only.

Every project-scoped operation:
1. Authenticate user.
2. Parse and validate resource ID.
3. Fetch resource under user-scoped database access.
4. Verify project ownership.
5. Verify lifecycle permissions.
6. Perform mutation.
7. Audit sensitive actions.

A valid UUID is not authorization.

Example attack: User B calls `/api/checkpoints/{userA-checkpoint-id}/analyze`. The request must fail even if B knows the ID.

Database RLS is mandatory defense in depth. Test both read and write paths.

## 5. Supabase RLS

- Enable RLS on every exposed application table.
- Define explicit policies for SELECT/INSERT/UPDATE/DELETE.
- Include project ownership in child-table policies.
- Validate project-scoped foreign key relationships.
- Avoid overly broad `authenticated` grants.
- Use the service-role key only in trusted server contexts.
- Treat service-role use as privileged and audit its call sites.

A policy on `projects` does not automatically secure unrelated child tables.

Review database grants as well as RLS policies.

## 6. Private image storage

Bucket: private `checkpoint-captures`.

Requirements:
- Server-generated object paths.
- Short-lived upload authorization.
- Authenticated access or short-lived signed download URLs.
- No permanent public image URLs.
- No cross-project object reads.
- Delete orphaned or rejected uploads.
- Never expose the service-role key to the browser.
- Prevent path traversal and user-selected storage keys.

Signed URLs are bearer capabilities: anyone holding one may access the object until expiry. Keep expiry short and avoid logging URLs.

## 7. Upload security

Accept only supported raster formats after validating actual file content, not merely extension/MIME.

Recommended MVP limits, adjustable after measurement:
- Maximum original image: 12 MB.
- Maximum decoded pixels: 24 megapixels.
- Maximum images per checkpoint: 3.
- Maximum concurrent uploads per user: 2.
- Maximum model analysis attempts per checkpoint: bounded.

Pipeline:
1. Authenticate and authorize.
2. Check quota and size.
3. Create upload record.
4. Upload to private storage.
5. Decode in a constrained image-processing library.
6. Validate dimensions and format.
7. Normalize orientation.
8. Strip EXIF, including GPS.
9. Generate bounded inference image.
10. Record digest and metadata.
11. Mark capture verified.

Reject unsupported formats and decompression bombs. Keep image libraries patched.

## 8. EXIF and privacy

Photos can contain location and device metadata.

Rules:
- Strip EXIF from images sent to Meta.
- Avoid retaining GPS data.
- Do not display exact local file paths.
- Do not include private image URLs in analytics.
- Explain that inference sends selected image content to Meta's API.
- Obtain explicit user action before inference.
- Do not use a provider's training/data-retention setting without verifying its current meaning.

For public demo fixtures, use images you have permission to share.

## 9. Secrets management

Server-only:
- `META_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`, if strictly needed
- CLI token signing secret, if applicable

Public:
- Supabase URL.
- Supabase publishable/anon key, subject to proper RLS.

Rules:
- Only intentionally public variables use `NEXT_PUBLIC_`.
- Use Vercel environment variable scopes.
- Maintain `.env.example` with placeholders.
- Never commit real `.env` files.
- Rotate compromised keys.
- Separate development and production credentials.
- Restrict access to deployment dashboards.
- Check build artifacts for accidental secret exposure.

## 10. API security

For every mutation:
- Authenticate.
- Authorize object ownership.
- Validate with Zod.
- Enforce request body size.
- Enforce idempotency when retryable.
- Limit pagination and list sizes.
- Use consistent error envelopes.
- Avoid detailed internal errors in public responses.
- Record request IDs.
- Reject unknown JSON fields for security-sensitive contracts.

Apply origin/CSRF protections appropriate to cookie-based sessions. Do not assume that JSON APIs are automatically immune to CSRF.

## 11. Rate limits and cost controls

Protect:
- Image upload initiation.
- Analysis execution.
- Comparison generation.
- Signed URL creation.
- CLI ingestion.

Recommended initial controls:
- Per-user request rate limits.
- Per-project daily inference quota.
- Maximum concurrent analysis requests.
- Maximum image resolution sent to provider.
- Model request timeout.
- Maximum retry count.
- Cost and token usage logging without sensitive payloads.
- Administrative kill switch for inference.

These are initial policies, not guaranteed provider limits; calibrate them using actual usage and Meta pricing.

## 12. AI-specific threats

### Prompt injection
Photo text, Git commit messages and test logs are untrusted data.

The runtime model must not:
- Follow instructions found inside images.
- Request secrets.
- Invoke tools or shell commands.
- Change access controls.
- Write SQL or modify database schema.
- Produce unsupported evidence IDs.

Use schema validation and allowlisted operations.

### Hallucinated hardware certainty
A model may invent terminal labels, continuity or resistor values.

Mitigation:
- Require evidence references.
- Permit unknown endpoints.
- Require human review.
- Separate provenance from confidence.
- Compute graph diffs deterministically.
- Reject explanations citing nonexistent diff events.

### Provider outage
A provider outage must not delete user photos or leave a checkpoint permanently locked. Provide retry and manual review.

## 13. Optional CLI security

The CLI is higher risk because it runs on the developer's machine.

Rules:
- Never execute commands returned by an LLM.
- Prefer ingesting existing test-result files.
- If running tests, use an explicit command configured by the user.
- Show the command before execution.
- Avoid shell interpolation; use argument arrays where possible.
- Apply timeouts and output size limits.
- Never execute commands from untrusted project metadata.
- Redact secrets and home directory paths from logs.
- Store tokens in OS credential storage where available.
- Scope tokens to one project and allow revocation.
- Do not read arbitrary files outside the selected repository.

The web server must never receive a request that causes arbitrary code execution on the user's machine.

## 14. Git and test evidence security

Store:
- Commit SHA.
- Branch name.
- Dirty-tree flag.
- Test name/status/exit code.
- Short sanitized output excerpt.

Do not store by default:
- Entire repository contents.
- `.env` files.
- Access tokens.
- Full unredacted terminal logs.
- SSH keys.
- Personal absolute filesystem paths.

Use bounded strings and sanitize control characters in displayed logs.

## 15. Security headers and frontend

Recommended:
- Content Security Policy appropriate to Next.js.
- `X-Content-Type-Options: nosniff`.
- Strict transport security on HTTPS.
- Sensible referrer policy.
- Frame embedding restrictions.
- Secure cookie attributes.
- No raw HTML injection from model responses.

Render model explanations as plain text or sanitized Markdown. Never use untrusted HTML directly.

## 16. Logging and observability

Log:
- Request ID.
- Actor ID or pseudonymous identifier.
- Project ID.
- Operation name.
- Outcome.
- Duration.
- Safe error code.
- Estimated provider cost.

Do not log:
- API keys.
- Cookies.
- Private image URLs.
- Raw image bytes.
- Full provider prompts containing sensitive data.
- Unredacted test output.

Audit project deletion, token issuance/revocation, sensitive permission changes and provider errors.

## 17. Data retention and deletion

Publish a straightforward privacy policy before sharing the demo publicly.

Deletion flow:
1. Authenticate and authorize owner.
2. Mark project deletion pending.
3. Revoke or invalidate project-scoped CLI tokens.
4. Delete private storage objects.
5. Delete relational/derived records.
6. Verify cleanup.
7. Record safe completion metadata.

Handle partial failure with retries and an operational alert. Do not claim deletion succeeded until confirmed.

Provider-side retention must be described accurately according to current Meta terms.

## 18. Dependency and deployment security

- Commit lockfile.
- Use maintained dependency versions.
- Run dependency audits.
- Enable secret scanning.
- Use least-privilege CI credentials.
- Separate preview and production secrets.
- Do not deploy unreviewed database policy changes.
- Protect production branch where feasible.
- Validate environment configuration before startup.
- Restrict CORS to actual origins where needed.

## 19. Incident response checklist

For a suspected credential leak:
1. Revoke affected key.
2. Inspect access logs.
3. Rotate dependent credentials.
4. Check recent inference/billing activity.
5. Patch the exposure.
6. Redeploy.
7. Document impact and user notification requirements.

For cross-user data exposure:
1. Disable affected endpoint or feature.
2. Preserve minimal audit evidence securely.
3. Patch authorization/RLS.
4. Run cross-user regression tests.
5. Review whether notifications are required.

For malicious uploads:
1. Disable the affected processing path.
2. Isolate sample safely.
3. Update validation and libraries.
4. Add a regression fixture.
5. Restore service only after validation.

## 20. Security test matrix

| Test | Expected result |
|---|---|
| Anonymous project GET | 401/redirect |
| User B reads User A checkpoint | denied |
| User B reads User A storage object | denied |
| Forged `project_id` on insert | denied |
| Invalid image signature | rejected |
| Oversized image | rejected |
| EXIF GPS in inference variant | absent |
| Provider key in client bundle | absent |
| Prompt injection in image text | ignored |
| Model cites unknown evidence ID | rejected |
| Repeated analyze request | bounded/idempotent |
| CLI receives model-generated command | never executed |
| Expired signed URL | inaccessible |
| Project deletion | storage and DB cleaned |

## 21. MVP release blockers

Do not publicly launch if:
- RLS is disabled on user-owned tables.
- Images are publicly accessible by default.
- Provider keys are present in client code.
- One user can read another user's project.
- Model output can execute shell commands.
- Uploads are not size/format bounded.
- A project cannot be deleted.
- AI output can be presented as measured electrical fact.

## 22. References

- OWASP API Security Top 10: https://owasp.org/API-Security/
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access: https://supabase.com/docs/guides/storage/security/access-control
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Meta authentication: https://dev.meta.ai/docs/authentication

**Companion documents:** `architecture.md`, `database.md`, `AI agents instruction.md`, `testing.md`.
