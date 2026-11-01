# Security architecture

This document describes implemented boundaries and pending security requirements. The application is a local, single-user Linux desktop app. Its supervised Node runtime runs with the operating-system user's privileges; it is **not sandboxed**.

## Current trust boundaries

The Vue renderer talks to explicit Tauri commands. The renderer's Content Security Policy allows Tauri IPC connections rather than direct provider network requests. Native commands resolve provider credentials and forward them on a private standard-input/output pipe to the runtime. The versioned protocol uses bounded frames, strict TypeScript schemas, response correlation, and ordered generation events. Adding an operation requires validation at the native and runtime boundaries.

Persistent credentials use Linux Secret Service. The user can select session-only storage when the keyring is unavailable. Connection metadata contains account labels and the selected official client path; it must not contain credentials. The official Claude client manages its own authentication. Do not put credentials into settings, conversations, exports, renderer responses, or diagnostic logs. Credential-entry fields briefly hold user input and should clear after use.

Provider requests and model output are untrusted. Markdown rendering disables raw HTML and remote images and sanitizes generated HTML. Native link opening accepts HTTP(S) links without embedded credentials. The renderer cannot interpret provider output as executable commands.

The runtime is supervised through a process group, parent-death signaling, cancellation, and shutdown escalation. These controls support process cleanup; they do not isolate filesystem or network access.

## Local persistence

Conversation content and preferences are local application data, not encrypted secrets. Operating-system account access and disk encryption determine confidentiality at rest. Do not describe SQLite as encrypted. Keep database, write-ahead-log, shared-memory, backup, and export files out of version control.

Persistence implementations must use parameterized SQL, transactional migrations, foreign keys, validated payloads, bounded requests, and restrictive application-directory permissions. Accepted conversation input must be committed before inference starts. Interrupted responses must remain visible after restart. Storage failures must be surfaced to the user; silently resetting a database or overwriting a corrupt file can destroy user data.

Choose SQLite durability explicitly. WAL improves concurrency but does not by itself promise that the most recent transaction survives power loss. Use `synchronous = FULL` for durable message commits and document any batching interval. See [SQLite synchronous settings](https://sqlite.org/pragma.html#pragma_synchronous).

## Agent, terminal, and MCP controls

Tool arguments are validated outside model control. Workspace paths are canonicalized. Traversal, symlink escapes, and sensitive files are denied. File size, output size, execution time, and concurrency have explicit limits. Approvals bind the exact operation, session, workspace, argument hash, and expiry, and they are single use. A changed or replayed request is denied. External edits are detected by content hash before a patch replaces a file, and rollback refuses a file that changed again.

Ask and Plan are read-only. Edit can write, edit, delete, and patch. Edit cannot run commands. Agent, Multitask, and Debug run commands only through bubblewrap and fail closed when bubblewrap is unavailable. Review and Security are read-only and require `report_findings`. MCP tools are hidden from Ask, Plan, Review, and Security. MCP calls require manual approval even when the policy is full access. Local stdio starts only inside bubblewrap after that approval. Without approval the runtime returns `PERMISSION_DENIED`. Without an isolated executor it returns `ISOLATION_UNAVAILABLE`. The regression fixtures prove that refusal and that the sentinel process does not start. They do not prove a completed bubblewrap stdio session.

The interactive user terminal is a shell in the selected directory. It is not a filesystem sandbox. A working directory is not isolation. The supervised Node runtime still runs with the operating-system user's privileges outside those isolated command paths. It is not a general sandbox.

MCP server configuration, tool descriptions, tool results, project instructions, and repository content are untrusted inputs. Remote MCP authentication must validate the intended audience. Unrelated provider credentials are not forwarded to MCP servers. See [MCP authorization security considerations](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/security-considerations.mdx).

## Maintenance and verification

Keep capability scope narrow and retain native checks as functionality expands. See [Tauri runtime authority](https://v2.tauri.app/security/runtime-authority/). Custom provider endpoints must not forward credentials across redirects or to URLs supplied by model output.

The initial architecture inspection is not a penetration test or an exhaustive vulnerability assessment. Real SQLite reopen/recovery, malformed records, failed writes, private database permissions, early cancellation, upstream cleanup, workspace boundaries, approvals, and bubblewrap fail-closed command tests now have deterministic regression coverage. Outstanding qualification includes abrupt host-kill durability, a native two-launch restart, live provider calls, Gemini CLI account sign-in, other operating systems, and packaged-app smoke. Run the documented test and build gates, inspect diffs for secrets, and use deterministic fixtures without personal credentials.

Production dependency audit initially found a vulnerable DOMPurify copy beneath Monaco. The workspace override pins all copies to patched 3.4.17; the subsequent production audit reported no known vulnerabilities. This dependency check is not a full vulnerability assessment.
