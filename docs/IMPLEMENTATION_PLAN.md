# Workstation implementation plan

Status: active. This is a phased implementation, not a completed workstation.

## Current-state audit (2026-10-30)

The existing uncommitted milestone uses Tauri 2, Vue 3 Composition API, Pinia,
TypeScript, Tailwind 4, local shadcn-vue/Reka primitives and Lucide. Rust supervises
an embedded Node runtime over bounded protocol-v2 stdio. SQLite has transactional
migration bookkeeping. Chat is single-session and in memory. Linux Secret Service
owns persistent credentials; session-only credentials require explicit selection.
ChatGPT and Claude official-client paths coexist with OpenAI, Anthropic, Google,
and xAI API adapters. Existing adapters must remain intact. Generic compatible
provider constructors exist but are not exposed as connected user workflows.
Monaco/xterm adapters and MCP import checks are infrastructure fixtures only.

The repository began on master with README modified and nearly all application
files untracked. Preserve that baseline. Work proceeds on codex/workstation.

## Target architecture and dependency graph

Shared validated contracts → SQLite repositories → runtime dispatch → narrow Rust
commands → renderer transport → Pinia hydration → history/settings UI.

Next: workspace canonicalization → permissions/approval contracts → tool registry
→ bounded agent loop → developer integrations → MCP → complete activity UI.
Provider capability discovery precedes exposing tools, attachments or model options.
No renderer filesystem permissions, arbitrary runtime RPC or model-granted approvals.

## Milestones and acceptance criteria

### 1. Discovery and durable foundation

- [x] Audit architecture, UI, credential boundaries and tests with independent agents.
- [x] Create feature branch without discarding existing work.
- [x] Consult official Tauri, SQLite and Pinia documentation.
- [x] Add strict conversation/settings contracts and transactional SQLite migration.
- [x] Commit input/assistant placeholder before inference acknowledgment.
- [x] Persist stream chunks and final status before emitting events.
- [x] Recover interrupted generations as stopped; retain partial text.
- [x] Integrate list/load/rename/pin/delete with confirmation and search.
- [x] Restore active conversation, provider/model and appearance in SQLite/browser fixtures.
- [ ] Verify full native close/reopen and immediate-close preference flushing.
- [x] Add light/system themes, accents, density and motion preferences.
- [x] Verify database restart, invalid inputs, failed writes and navigation races.
- [x] Run full existing checks, production build and scoped visual browser checks.

Acceptance: reopen a real temporary database and restore messages/metadata/settings;
no inferred persistence from browser fixtures alone. No credentials in records.
Deletion must not race a running generation. Failed storage must be visible.

### 2. Workspaces and safe tools

- [ ] Open folder, recent/favorite projects, workspace-scoped conversations/preferences.
- [ ] Native folder picker and missing-folder recovery.
- [ ] Canonical/symlink-aware workspace boundaries and sensitive file protection.
- [ ] Validated read/list/search/metadata tools with byte/time/output limits.
- [ ] Operation-bound approvals, expiry/replay protection and audit records.
- [ ] Create/edit/delete/patch tools with external-edit conflict checks.

Acceptance: traversal/symlink escapes denied; writes require correct mode and approval;
external edits never silently overwritten. Ask/Plan cannot execute write effects.

### 3. Agent runtime

- [ ] Genuine provider capability registry and supported tool-call adapters.
- [ ] Ask/Plan/Edit/Agent modes backed by enforced policies.
- [ ] Multi-step loop, max steps, deadlines, retries, loop detection and context budget.
- [ ] Cancellation propagation, resumable interrupted state and compaction.
- [ ] Explicit concurrent session/resource limits and same-file edit coordination.

Acceptance: deterministic tool-call inference fixtures cover denial, timeout, retry,
cancel-before-first-token, cancellation during tools, and loop exhaustion.

### 4. Developer integrations and extensibility

- [ ] Git detection/status/diffs, safe patch accept/reject and rollback.
- [ ] User-facing Monaco files/diffs and xterm interactive PTYs.
- [ ] Terminal resize, multiple sessions, termination and process cleanup.
- [ ] MCP stdio/remote lifecycle, discovery, credentials and permission integration.
- [ ] Ollama/LM Studio/OpenRouter/custom connection settings and authenticated testing.

Acceptance: real temporary filesystem/Git/PTY/MCP fixtures, no mock production tools.
Commands are explicitly approved; do not describe ordinary subprocesses as sandboxed.

### 5. Complete conversation and settings experience

- [ ] Message edit/regeneration with retained failed variants, retry and attachments.
- [ ] Structured tool/result/attachment persistence and migrations.
- [ ] Import/export files, retention controls and diagnostics.
- [ ] Resizable persisted panels/window geometry and complete settings categories.
- [ ] Model-specific options validated against actual capabilities.
- [ ] Pagination/virtualization based on measured history/file/terminal bottlenecks.
- [ ] Full keyboard navigation/focus restoration and screen-reader review.

### 6. Release qualification

- [ ] Independent security, reliability, UI, testing and architecture reviews.
- [ ] Resolve high-priority findings and rerun affected checks.
- [ ] Complete dark/light narrow/default/large visual state matrix.
- [ ] Real desktop restart and provider acceptance, including existing ChatGPT flow.
- [ ] CI includes new tests and dependency/security checks.
- [ ] Production Linux build/package/smoke pass; other platforms only after testing.
- [ ] Review secrets/diff, commit milestones, push and create PR if authenticated.

## Risks and migration requirements

Existing conversations cannot migrate because they were never persisted. Keep the
existing database; apply additive transactional migrations. Do not delete corrupt
files or replace failed storage with a silent in-memory fallback. Schema validation
must reject malformed records with actionable errors. Existing credentials stay in
Rust/keyring. SQLite data is private plaintext, not encrypted. WAL companions matter
for backups; copying an open main database alone is unsafe.

IPC is limited to 1 MiB. Summaries and conversations need bounded responses and an
explicit pagination/export design before claiming unlimited history. Current runtime
permits one generation; keep that explicit until resource isolation is implemented.
Persisted model IDs do not establish availability. Preserve IDs through transient
connection errors and require available discovery results before Send.

## Testing requirements and continuation

See TESTING.md. Never mark a checkbox complete from code inspection alone. Record
actual commands/outcomes and environmental limits. Continue in milestone order;
implement dependent permission/runtime features only after the durable foundation
passes. Outstanding checkboxes are required work, not decorative future controls.

## Durable-chat continuation checkpoint

The first implementation phase adds real SQLite persistence, strict data IPC,
history actions, appearance settings and deterministic regression coverage. Existing
provider/auth implementations remain intact. Independent architecture, security,
reliability, UI and testing reviews discovered cancellation/navigation races and
upstream cleanup issues; fixes received regression coverage and a closure review.
No remaining high-priority issue was found within that reviewed foundation scope.
This does not certify the unimplemented workstation features.

Known foundation limits: history displays 200 recent/pinned summaries; search filters
that loaded subset. Each conversation is bounded below the 1 MiB IPC limit and 1,000
messages. Export copies versioned JSON to clipboard; file import/export is pending.
Preferences queue serialized writes but have no native window-close flush barrier.
Unknown-start cancellation IDs remain protected without eviction; after 1,024 such
IDs new unknown cancellations fail explicitly and require runtime restart. Live
providers and full desktop close/reopen were not requalified in this phase.

Next implementation order: finish native lifecycle/close-flush acceptance and paginated
archive contracts; then milestone 2 workspace selection and canonicalized read-only
tools. Introduce operation-bound permission/approval contracts before enabling edits
or commands. Keep current chat tests passing throughout. Follow milestones 3–6 for
the genuine agent loop, developer integrations, MCP and release qualification.

Final quality gate: `pnpm check` passed (69 TypeScript, 10 Rust, 10 browser tests). `pnpm build` passed. Production dependency audit passed with no known vulnerabilities. See TESTING.md for exact scope and environmental limits.
