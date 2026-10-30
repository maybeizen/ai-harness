# Architecture

## Ownership

| Boundary             | Responsibility                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop`       | Vue presentation, Pinia conversation/connection state, Monaco/xterm mounting adapters, and Rust host                |
| Rust host            | Native window, application data path, bounded IPC bridge, Node process and process-group lifecycle                  |
| `apps/runtime`       | TypeScript bootstrap, stdio transport, SQLite lifecycle, discovery, streamed inference, and future agent boundaries |
| `packages/contracts` | Platform-neutral validated wire schemas, mode and provider/model metadata                                           |
| `packages/providers` | Direct AI SDK adapter construction and credential-resolution interface                                              |

Imports flow toward contracts. The renderer never imports runtime or provider code. Native integrations live behind runtime modules. ESLint checks these boundaries and limits handwritten production files to 300 nonblank/noncomment lines. Use package exports for cross-package imports.

## Infrastructure lifecycle

Rust starts a bundled Node binary in a new process group, supplies its application data directory, and performs `hello`. The frontend requests `health` through a Tauri command. Runtime stdout carries newline-delimited versioned JSON; stderr carries event-only structured logs. Protocol v2 frames are bounded to 1 MiB. Requests carry correlation IDs and support handshake, health, shutdown, model discovery, generation, and cancellation. A serialized conversation request is also limited to 1 MiB, with host framing headroom. No arbitrary method or shell command is exposed.

Startup has a ten-second deadline; health requests have five seconds; shutdown has two seconds plus a bounded exit grace period. Malformed, mismatched, or oversized responses mark the connection unavailable. Multiplexed responses and ordered generation events use one reader; the writer lock is held only while writing a frame. Tauri Channels deliver stream events identified by conversation, generation, and sequence; stale events cannot mutate a new conversation. There is no automatic restart. Rust requests graceful shutdown and kills the managed process group on exit. Linux parent-death signaling also handles an unexpected host crash.

The database stores conversations and validated nonsecret settings with transactional migrations, WAL and FULL synchronization. Its connection is owned by the runtime and closes on shutdown, signals, or stdin EOF. Credentials remain outside SQLite. No workspace or agent tables exist.

## Providers

Each configuration has its own instance ID, provider kind, optional endpoint, and credential reference. A model reference names the provider instance and model ID and carries explicit `supported`, `unsupported`, or `unknown` capabilities. IDs are caller-supplied; no model catalog or default model is embedded.

OpenAI, Anthropic, Google, and xAI use native AI SDK adapters. OpenRouter, Ollama, LM Studio, and custom endpoints use the OpenAI-compatible chat interface. Ollama's native API and provider-specific extensions require dedicated future adapters. Custom arbitrary protocols require a new adapter. Compatibility does not guarantee every model supports every capability.

The credential resolver is injected into provider construction. Cloud providers require an explicit reference; local/custom endpoints can omit authentication. No environment-key fallback or raw credential logging is provided. Rust resolves credentials just before operations and sends them only on the private runtime pipe. Linux Secret Service stores app-owned keys and OAuth tokens; only nonsecret connection metadata is saved separately. Session-only storage requires an explicit user choice when native storage is unavailable. Password inputs clear on submission and saved credentials never return to the renderer. Claude-client credentials remain owned by the official client.

## Reserved agent boundaries

| Runtime module          | Future responsibility                                                               |
| ----------------------- | ----------------------------------------------------------------------------------- |
| orchestration           | Bounded, cancellable request → model → tool → permission → execution → result cycle |
| tools / permissions     | Tool registry, effects, explicit destructive-operation approval, execution gate     |
| context                 | Context assembly, token budgets, retention and compaction                           |
| workspace / Git         | Repository access and Git CLI adapter                                               |
| terminal                | PTY ownership and cancellation                                                      |
| MCP                     | Client/server lifecycle and tool adaptation                                         |
| Skills / Rules / agents | Definitions, validation, discovery and applicability                                |
| parallel tasks          | Scheduling, isolation, cancellation and task lifecycle                              |

These are documented boundaries, not speculative implementations or executable placeholders. Add modules within the runtime when implementing them; extract a workspace package only for a proven independent boundary.

Ask reserves question answering; Plan reserves analysis and planning; Edit reserves scoped file edits; Agent reserves multi-step task execution. These mode contracts reserve future behavior; the current UI implements text chat only. Future permissions must gate tool effects before execution; destructive actions require approval. Model reasoning means model-visible actions and supported response metadata, not access to hidden reasoning.

## Conversation lifecycle

Pinia presents one active conversation backed by runtime-owned SQLite persistence. Each submission creates one assistant turn, streams text into it, and records the producing model. Switching connections/models is blocked during generation and preserves completed context afterward. Stop aborts upstream work and marks partial text stopped; failed/stopped assistant fragments are excluded from later inference. New chat cancels before navigating to an empty conversation; previous messages remain in history. Runtime failure surfaces an actionable error without automatic regeneration.

Markdown disables raw HTML, sanitizes generated output, never automatically loads remote images, and delegates validated external links to Rust. Shiki loads lazily for fenced code; the content security policy allows WebAssembly compilation without general JavaScript eval. Runtime persistence commits messages before acknowledgments and stream events; interrupted generations recover as stopped. History supports rename, pin, confirmed delete and clipboard JSON export. The list currently returns at most 200 pinned/recent summaries.

## Durable-chat foundation

The workstation preserves its native/runtime/provider boundaries.

- Contracts: Zod validates strict versioned wire and data operations.
- Rust: native credential ownership, narrow storage facade, process supervision.
- Node: SQLite ownership, migrations, generation persistence and provider streaming.
- Vue/Pinia: presentation, validated hydration, nonsecret preferences and history.

Conversation storage is authoritative in the runtime. The renderer never writes
assistant output to the database. Input/placeholder commit precedes inference;
deltas and terminal states commit before publication. Restart recovery marks
unfinished records stopped. Settings writes are serialized in renderer order;
credentials are excluded from settings. Storage failures must surface explicitly.

The current implementation remains a text assistant foundation. Filesystem tools,
agent loops, terminal workflows and MCP lifecycle require the gates in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); fixture adapters are not features.
