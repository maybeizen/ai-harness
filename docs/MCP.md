# MCP runtime

The MCP runtime uses the installed official TypeScript SDK 1.32.2. Remote
Streamable HTTP transport is implemented and exercised against real local HTTP
fixtures. Local stdio starts only inside the isolated bubblewrap executor, and
only after an explicit approval. Without that approval the connection fails
closed with `PERMISSION_DENIED`. If bubblewrap or the isolated executor is
unavailable, it fails closed with `ISOLATION_UNAVAILABLE` and does not start a
host process. There is no unrestricted subprocess fallback. The user terminal
is not a filesystem sandbox, and a working directory is not isolation.

## Boundaries

`Mcps` owns validated configuration, connections, tool discovery and internal tool
execution. Configuration contains an opaque server-owned credential reference;
bearer values arrive only through private native/runtime `connect-auth` requests
and remain in connection memory. Configuration and status responses never contain
the bearer. Native keyring keys bind both server ID and an immutable credential-version UUID;
configuration references do not select another server’s key. Private connect requests
also carry the user-reviewed configuration revision. A changed revision rejects
before any bearer can be forwarded. Native integration must obtain credentials from secure storage and
confirm endpoint/configuration changes before forwarding them.

Endpoints require HTTPS, with HTTP permitted for explicit localhost endpoints.
URL credentials, query strings and fragments are rejected. Requests cannot leave
the exact configured endpoint; redirects fail instead of forwarding authorization.
The client advertises no sampling, filesystem-root or elicitation capabilities.
Server descriptions, annotations, schemas and returned text remain untrusted.

There is no public tool-execution RPC. The agent toolbox must classify all discovered
MCP tools as external effects, require manual approval even in Full Access, and
exclude them from Ask, Plan, Code Review and Security Audit. A model-visible tool
name binds configuration revision, connection/discovery nonce and tool schema.
Execution revalidates that name after approval; refresh, reconfiguration and
disconnection invalidate previous names. Tool annotations never grant permissions.

## Validation and limits

Input and structured-output schemas use a bounded supported subset of JSON Schema,
converted through the installed Zod `fromJSONSchema`. Unknown keywords, references,
regex patterns, unsupported formats and invalid structures disable the tool with
an explanation. JSON Schema defaults remain annotations and cannot fill missing
required arguments. The SDK output validator uses this same bounded compiler;
it does not compile arbitrary server schemas with its default AJV implementation.

Limits are explicit: 16 configured servers, 64 discovered tools per server, 8 tool
list pages, 16 KiB schemas, depth 16 and 500 schema nodes. Each connection permits
one active call. Arguments are bounded to 32 KiB; results to 128 KiB; incoming HTTP
bodies to 512 KiB. Configurable operation deadlines range from 1–60 seconds.
Tool calls do not retry automatically. Non-text returned content is omitted with
a count; resource links are never automatically fetched. Cancellation interrupts
local requests, but remote effects may already have occurred and need inspection.

## Verified scope

Contract and real HTTP tests cover discovery, input validation, disabled schemas,
revision invalidation, bearer persistence exclusion/redaction, redirect refusal,
input/output limits, timeout, cancellation, close/connect races, and stdio
refusal when approval or bubblewrap isolation is missing. Those stdio fixtures
prove no host process starts; they do not prove a connected bubblewrap session.
These fixtures do not verify a user's remote account, OAuth flow, native
credential UI or complete desktop integration.

Official references: [SDK v1 clients](https://ts.sdk.modelcontextprotocol.io/client),
[MCP security guidance](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices).
