# Gemini CLI and external agent integration

Research date: 2026-10-30. Gemini API-key chat is an existing integration. Gemini
CLI account access is not connected or verified in the application yet.

## Official integration paths

Google documents Gemini CLI's Agent Client Protocol (ACP) mode, started with
`gemini --acp`, for programmatic editor integrations over JSON-RPC and stdio.
ACP is distinct from the Language Server Protocol. No official general-purpose
Gemini inference LSP was established by this research; do not advertise one.
Use negotiated ACP capabilities for session lifecycle, cancellation, permissions,
filesystem proxying and supported model controls. Some Gemini model-control methods
are explicitly unstable and require pinned-version compatibility tests.

Sources: [Gemini ACP mode](https://geminicli.com/docs/cli/acp-mode/),
[ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup).

Google account sign-in occurs through the official CLI's browser flow. Headless
sessions can use authentication already cached by that CLI. Organization accounts
may additionally require a Cloud project. Axiom must not scrape browser sessions,
extract CLI credentials or modify official authentication files. Account eligibility,
quota and billing remain provider-controlled.

Source: [Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/).

Headless `--output-format stream-json` emits structured message, tool and final-result
events. These describe the CLI's own execution; observing tool events after execution
is not an application permission boundary. Prefer ACP with app-owned approval and
filesystem/tool bridges for a future governed integration.

Source: [Headless reference](https://geminicli.com/docs/cli/headless/).

## Required isolation before enabling account-backed tools

The CLI inherits user and workspace configuration by default. Disable inherited
extensions (`--extensions none`), hooks (`hooksConfig.enabled: false`), skills
(`skills.enabled: false`) and MCP (`admin.mcp.enabled: false`) unless each is
explicitly configured through the application. A documented system override file
can be selected through `GEMINI_CLI_SYSTEM_SETTINGS_PATH`; keep this app-owned and
never overwrite the user's official configuration. Restrict built-in tools through
`tools.core` and policies, and ignore repository `.env` loading with
`advanced.ignoreLocalEnv: true`. Disable telemetry in the managed child process.
Verify all controls against the selected CLI version and actual denied-effect
fixtures before considering this an enforced boundary.

Project-level policy files cannot be assumed effective: Google's policy reference
currently documents workspace-tier policy loading as nonfunctional. Higher-priority
user/admin policy interactions also require tests. A model-selected CLI mode cannot
replace Axiom's independent approval and workspace checks. Do not use YOLO mode as
a shortcut for application integration.

Sources: [Configuration](https://geminicli.com/docs/reference/configuration/),
[Policy engine](https://geminicli.com/docs/reference/policy-engine/).

## Current environment and acceptance status

`gemini` was not available on PATH during this audit. No Google account login,
model discovery, entitlement check or live inference was performed. CLI installation,
version validation and official interactive account sign-in are prerequisites for
live qualification. API-key Gemini tests do not verify CLI account access.

Future acceptance must exercise handshake/auth-required handling, session creation,
model negotiation, streamed output, approval denial, filesystem escape denial,
cancel-before-first-token, cancellation during a tool, expired sign-in and child
process cleanup using real CLI/account access where available.

## Existing provider tool-turn boundary

`packages/providers/src/tools.ts` adds one-turn structured tool calling for the
existing API-key OpenAI, Anthropic, Google and xAI adapters. It never executes tools;
the runtime owns authorization, effects, retries and subsequent turns. Completed
response history preserves provider metadata needed for continuation. Calls should
be collected until a successful finish event before executing effects. Provider
model capability checks and the outer runtime loop remain separate requirements.

The existing ChatGPT OAuth and Claude-client text paths remain intact. OpenAI also
documents an app-server path for richer local integrations and app-owned OAuth
configuration. Treat `model/list` as a catalog, not a proof of entitlement, and
version-gate experimental APIs.

Sources: [Codex app-server](https://learn.chatgpt.com/docs/app-server),
[app-owned ChatGPT token configuration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server),
[Responses function calling](https://developers.openai.com/api/docs/guides/function-calling).
