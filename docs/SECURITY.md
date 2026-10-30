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

## Requirements before enabling agent tools

Filesystem, shell, Git mutation, terminal, and MCP operations are not currently authorized by the conversational chat interface. Future implementations must enforce all of the following outside model control:

- Validate each tool's arguments and reject unsupported operations.
- Resolve workspace boundaries and target paths, including symlink handling and creation through validated parent directories.
- Protect sensitive files and enforce file-size, output-size, execution-time, and concurrency limits.
- Bind approvals to exact arguments, workspace, session, and expiry; reject replayed or changed requests.
- Require approval for commands and destructive effects according to the selected policy. Ask and Plan modes cannot become read-only merely by labelling unrestricted shell access as safe.
- Detect external file changes before replacing content and provide safe review and rollback.
- Cancel descendant processes and release resources when a task ends or the application closes.
- Write audit metadata without secret values or unnecessary source-file contents.

MCP server configuration, tool descriptions, tool results, project instructions, and repository content are untrusted inputs. MCP tools must pass through the same permission enforcement as built-in tools. Remote authentication must validate the intended audience; do not pass unrelated provider credentials to MCP servers. See [MCP authorization security considerations](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/security-considerations.mdx).

## Maintenance and verification

Keep capability scope narrow and retain native checks as functionality expands. See [Tauri runtime authority](https://v2.tauri.app/security/runtime-authority/). Custom provider endpoints must not forward credentials across redirects or to URLs supplied by model output.

The initial architecture inspection is not a penetration test or an exhaustive vulnerability assessment. Real SQLite reopen/recovery, malformed records, failed writes, private database permissions, early cancellation and upstream cleanup now have deterministic regression coverage. Outstanding qualification includes abrupt-process-kill durability, full native immediate-close preference flushing, authenticated providers and future tool permission regression tests. Run the documented test and build gates, inspect diffs for secrets, and use deterministic fixtures without personal credentials.

Production dependency audit initially found a vulnerable DOMPurify copy beneath Monaco. The workspace override pins all copies to patched 3.4.17; the subsequent production audit reported no known vulnerabilities. This dependency check is not a full vulnerability assessment.
