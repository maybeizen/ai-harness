# Extension conventions

Use focused modules with explicit exports and injected dependencies. Avoid generic service locators, catch-all utility packages, speculative persistence tables, and runnable "not implemented" functions. Handwritten production files have a 300-line lint limit; split by responsibility. Generated/shadcn components are exempt.

Keep shared contract types platform-neutral. Runtime validation belongs at IPC and other untrusted boundaries. Update TypeScript schemas and Rust wire validation together, then add fixtures testing both sides. Only validated infrastructure, connection, and text-chat messages cross the bridge today. Credentials travel only on the private host/runtime pipe and never in renderer responses.

To add a provider, implement its adapter in `packages/providers`, extend the provider kind, and test offline construction plus endpoint/auth forwarding. Preserve instance IDs and caller-supplied model IDs. Never assume tool, image, or structured-output support. Keep secrets behind the credential resolver; never return resolved credentials to the renderer.

To add runtime capabilities, first define ownership, cancellation, error behavior, and tests. Tool execution must pass the future permission gate. MCP and Skills/Rules content must not silently acquire execution privileges. A personal-use application still needs explicit control over destructive effects.

Use colocated `*.test.ts` unit tests. Use real temporary resources for native integration tests and `finally` cleanup. Renderer adapters have unit lifecycle tests plus browser mounting checks. No test requires live providers, endpoints, or API keys. Add coverage for behavior and failure modes rather than matching implementation lines.

Keep shadcn-vue's `components.json`, utility helper, tokens, and component sources local to the desktop package. Add primitives as needed. Monaco and xterm are loaded only by integration fixtures today and should remain lazy-loaded when real views arrive.
