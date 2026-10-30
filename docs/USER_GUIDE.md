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
appearance, Escape stop response. The app currently provides text chat; project
editing, command execution and MCP are tracked implementation work.
