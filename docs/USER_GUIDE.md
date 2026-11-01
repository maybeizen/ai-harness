# User guide

Follow README.md and docs/development.md for Linux prerequisites and `pnpm dev`.
Connect a provider through Connections, refresh models and select an available
model. Provider subscription and separately billed API access remain distinct;
see providers.md for authentication limitations. Send with Enter, newline with
Shift+Enter, and Stop to cancel an active response.

Conversation history is saved locally when persistence is available. Select a
conversation in the sidebar to continue it; use search, pin, rename and confirmed
delete actions to manage history. Switching away stops an active response. Partial
responses recovered after interruption remain marked stopped. SQLite is local
plaintext storage; deleting a conversation is an application-level deletion, not a
secure disk erase.

Appearance controls theme, accent, density and motion. These preferences and the
selected provider/model are saved on this device. An unavailable saved model must
be refreshed or replaced before sending. Storage errors require attention; changes
must not be assumed saved when an error is displayed.

Current shortcuts: Ctrl/Cmd+N new conversation, Ctrl/Cmd+B sidebar, Ctrl/Cmd+,
appearance, Escape stop response.

The mode selector changes what a task is allowed to do. Ask and Plan can read
the selected workspace. Edit can change files after approval and cannot run
commands. Agent, Multitask, and Debug can run commands only when bubblewrap is
available; otherwise the task fails closed. Review and Security report findings
and do not change files or run commands. MCP tools stay hidden in Ask, Plan,
Review, and Security, and each MCP call asks for approval.

The user terminal is a shell in the selected directory. It is not a filesystem
sandbox. A working directory does not isolate the shell from the rest of the
account. Agent commands use the separate bubblewrap path.

When the selected model reports vision support, image attachments are sent from
local attachment storage with the message. When that capability is missing or
unsupported, the image stays on this device and the provider receives the text.
The conversation still records the attachment ids.

Open a project from the sidebar, choose a workspace, and review Git changes in
the workspace panel. Accepting a diff applies the reviewed patch only when the
file hash still matches. Live provider sign-in, a packaged AppImage smoke test,
and a native close/reopen check are not part of the automated browser workflow.
