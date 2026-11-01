# Axioden completion plan

Status: active, 2026-11-01. The full product directive is preserved in
[PRODUCT_DIRECTIVE.md](PRODUCT_DIRECTIVE.md). This plan extends the durable-chat
checkpoint. Open items are required work and must not be represented by decorative
controls or simulated execution.

## Audit and dependencies

The committed baseline has genuine provider chat and runtime-owned SQLite storage.
The renderer never receives saved credentials. Existing architecture remains
Vue/Pinia → narrow Rust commands → supervised Node runtime → provider adapters.
The previous checkpoint lacked native close flushing, archive pagination, projects,
workspace effects, tool calling, agent orchestration, terminal/Git UI and MCP.
Current work adds to that baseline without resetting existing data or identity.

Dependency graph: native close/write barrier + drafts → native restart qualification;
archive metadata/migrations → pagination → project/directory organization;
canonical native-selected directories → scoped tools → exact approvals → provider
structured tool turns → bounded engine → specialized modes and concurrent tasks;
PTY/Git/MCP lifecycles → integrated workbench/activity; validated preferences →
shared controls/design tokens → customization → visual and accessibility review.

## Parallel ownership

- Main: integration, Rust native commands, shutdown/restart qualification, private
  background assets, application shell, brand, final builds and repository state.
- Architecture/persistence agent: archive/draft/project contracts, migrations,
  repositories, chat navigation and history UI.
- Provider/workspace agent: provider tool-turn adapter, official Gemini research,
  canonical directory service, bounded filesystem/Git reads and associated tests.
- Agent-runtime agent: permission/approval contracts, scoped effect implementations,
  bounded tool loop, cancellation, auditing and deterministic regression tests.
- UI agent: shared controls, density tokens, advanced appearance/theme transfer,
  company-grouped model selector and component tests.
- Independent QA/security/reliability/accessibility reviews run after each integrated
  subsystem is testable. One browser runner owns the dev server at a time.

## Work inventory and acceptance

### Persistence and lifecycle

- [x] Database-backed keyset archive pagination and server search across >1,000 chats.
- [x] Draft autosave, navigation save and restored unsent conversations.
- [x] Close barrier freezes input, stops active work, awaits acknowledged draft/settings
      writes and keeps the window open on failure.
- [ ] Actual native two-launch immediate-close/restart qualification.
- [ ] Separate host-crash/reopen qualification; interrupted generation recovery.
- [x] Corrupt/missing settings, changed schemas, lost directories and failed writes
      remain recoverable without silently replacing private data.

### Projects and directories

- [ ] Native folder picker is the only source of new workspace grants.
- [x] Canonical stable directory IDs, availability and recent projects.
- [x] Projects: create/rename/delete, directory association/reassociation,
      instructions/model/mode defaults, favorites, archive.
- [x] Conversation project/directory associations, move/remove/archive and sidebar
      groups with persisted expansion/search/loading states.
- [x] Thousands of sessions remain accessible through bounded pagination.

### Runtime, permissions and tools

- [x] Genuine normalized provider tool turns; no parsing tools from text.
- [x] Scoped read/list/search/metadata/Git inspection, binary/sensitive/size limits.
- [x] Create/write/edit/delete/patch with content-hash conflict checks and path locks.
- [x] Manual/automatic/full policies retain workspace and credential protections.
- [x] One-use approvals bind exact session/workspace/arguments/hash/expiry.
- [x] Audit history, denial/error propagation, cancellation, deadlines and limits.
- [x] Bounded multi-step tool loop with retry/loop detection/context budgeting.
- [x] Isolated concurrent sessions and actual multitask orchestration.
- [x] Ask/Plan/Agent/Multitask/Debug/Review/Security modes enforce their real effects.
- [ ] Debug hypotheses/instrumentation/reproduction/fix evidence and cleanup.
- [x] Structured review/security findings with severity/file/line/evidence.

### Developer integrations

- [x] Interactive PTY tabs, resize/output limits and descendant cleanup.
- [x] Explicitly approved agent commands; real isolation or clearly bounded policy,
      never treating cwd alone as a sandbox.
- [x] Git branch/status/staged/unstaged/conflicts, stage/unstage/confirmed commit.
- [x] Unified/split highlighted diffs, external-change detection and safe rollback.
- [ ] MCP configuration/lifecycle/discovery/status/permissions and credential handling.
- [x] Rules, skills, reusable prompts and context limits with untrusted-input boundaries.

### Providers and model experience

- [x] Existing chat integrations retain behavior and authentication boundaries.
- [ ] Company-grouped selector, availability, actual capabilities, favorites/recent
      models and supported per-model settings.
- [ ] OpenRouter/Ollama/LM Studio/custom endpoint workflows with safe credentials.
- [ ] Official Gemini integration: ACP/structured supported APIs, version negotiation,
      official account sign-in, no auth-file edits or invented inference LSP.
- [ ] Every configured live connection retested through native credential resolution;
      unavailable credentials/CLIs/accounts documented as blocked, never verified.

### Design and customization

- [ ] Shared input/select/textarea/range/checkbox styling and validation states.
- [x] Compact/comfortable/spacious dimensions, spacing and menu/sidebar density.
- [x] Theme/color/font/layout controls, contrast warnings and reset.
- [x] Credential-free validated theme import/export.
- [ ] Local background image assets outside settings JSON, removal/opacity/blur/
      position/overlay/scope and restart recovery.
- [x] Resizable persisted side/right panels, chat width and compact titlebar.
- [x] Unified searchable settings: General, Appearance, Notifications, Voice,
      Keyboard, Providers, Accounts, Files, Agents, Rules, Skills, MCP, Data, About.
- [x] Real supported notifications/transcription only; no subscription assumptions.
- [x] Custom shortcuts: record/conflict detection/context/reset/import/export.
- [ ] Conversation editing/regeneration/attachments/bookmarks/export/import and
      crash recovery; optional queues/schedules only with working implementation.

### Identity and release

- [ ] Axioden branding and generated original icon integrated and visually qualified.
- [ ] Stable identifier/data/keyring locations retained; no unnecessary migration.
- [ ] Complete light/dark/density/background/size/loading/error visual matrix.
- [ ] Independent architecture/security/reliability/UX/accessibility/performance/
      persistence/native/test reviews; fix high-priority findings and rerun checks.
- [x] Formatting, ESLint/Clippy, types, unit/component/integration/browser/native tests.
- [ ] Linux production build, package, restart and packaged-app smoke pass.
- [ ] Dependency checks and CI updated; other targets only after actual qualification.
- [ ] Secret/diff review, meaningful commits, push and updated draft PR.

## Risks and verification rules

Tool-calling models cannot authorize effects. Unrestricted shells/MCP programs can
access user secrets even with a workspace cwd; do not expose them as read-only or
sandboxed. Preserve explicit approvals and isolate actual commands where supported.
New provider capabilities must be documented or negotiated; unknown capabilities
must not be advertised as verified. SQLite rows remain private plaintext data.

Native restart tests use temporary application data and actual renderer/native IPC.
Browser fixtures prove UI behavior, not keyring or disk durability. Abrupt host-kill
qualification is separate from crash-during-stream testing. Screen capture is visual
inspection, not a measured contrast audit. Update checkboxes only after relevant
implementation and verification have both succeeded.
