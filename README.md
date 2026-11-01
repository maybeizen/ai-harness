# AI Harness

A private, personal AI workstation foundation: Tauri v2, Vue 3, and a supervised Node/TypeScript runtime. The durable-chat milestone provides streamed multi-provider text chat, local SQLite history, restart recovery, searchable recent conversations, and persisted appearance/model preferences. Repository editing and agent execution remain tracked work in [the implementation plan](docs/IMPLEMENTATION_PLAN.md).

## Start here

Linux x86_64 is the supported target. Install the system prerequisites in [development](docs/development.md), then:

```bash
bash tooling/bootstrap-node.sh
export PATH="$PWD/.cache/node-v24.22.1-linux-x64/bin:$PATH"
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm run doctor
pnpm dev
```

The bootstrap downloads an official Node archive and checks its pinned SHA-256. Rustup installs the pinned Rust toolchain. Native installation runs only the explicitly allowed SQLite, PTY, and esbuild build scripts.

```bash
pnpm check          # Formatting, lint, types, unit/native tests, browser checks
pnpm build          # Runtime resources, frontend, release executable
pnpm package        # Build the x86_64 AppImage
pnpm test:package   # Extract and launch the AppImage with no Node on PATH
```

Before browser tests, run `pnpm exec playwright install chromium`. Tests use fixtures, temporary databases, and temporary PTYs; no credentials or model services are needed. Build outputs are under `apps/desktop/src-tauri/target/release/`; AppImages are in `bundle/appimage/`.

See [architecture](docs/ARCHITECTURE.md), [development](docs/development.md), and [extension conventions](docs/conventions.md). All workspace packages are private. There is no app account, telemetry, updater, or hosted backend. Provider connections authenticate directly with their respective services.

See [provider setup and limitations](docs/providers.md). ChatGPT subscription sign-in, discovery, streamed reply, follow-up, cancellation, and model switching were confirmed in a live user acceptance test on 2026-10-27; other providers are covered by offline integration tests and require separate authenticated acceptance.

Appearance supports dark/light/system themes, accent colors, density, reduced motion, and persisted sidebar visibility. History supports rename, pin, confirmed deletion, and clipboard JSON export. The current history list is limited to 200 recent/pinned conversations; pagination and a complete archive search remain pending. Conversations are local plaintext data.
