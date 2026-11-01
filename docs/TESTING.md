# Testing and verification

Use the pinned Node toolchain:

```sh
export PATH="$PWD/.cache/node-v24.22.1-linux-x64/bin:$PATH"
pnpm install --frozen-lockfile
pnpm typecheck
pnpm format:check
pnpm lint
pnpm test
pnpm test:browser
pnpm build
```

Unit/integration tests use Vitest, real temporary SQLite/PTY fixtures, mocked provider
HTTP streams and strict contracts. Native checks use Rust tests and Clippy. Browser
checks use deterministic injected backends; they do not prove live provider auth,
SQLite restart, native keyring or Tauri window behavior. Keep SQLite restart tests
separate from browser fixture restoration.

Required persistence regressions: transaction rollback, schema validation, interrupted
stream recovery, metadata retention, failed writes, bounded responses, deletion during
generation and preference restoration. Existing stream/cancellation/auth tests remain.

Before release verify real Tauri close/reopen, provider discovery/send/cancel, narrow
and large layouts, both themes, keyboard-only dialogs, focus restoration and manual
scroll behavior. Never label unexecuted tests passed. Actual milestone command
outcomes are recorded in IMPLEMENTATION_PLAN.md as verification proceeds.

## Foundation checkpoint results (2026-10-30)

- `pnpm check`: exit 0. Formatting, ESLint/source limits, Rust Clippy, and TypeScript checks passed. Vitest: 21 files / 69 tests. Rust: 10 tests. Playwright: 10 tests.
- `pnpm build`: exit 0, Linux release executable and production frontend built.
- Final `pnpm package`: exit 0, Linux x86_64 AppImage built (156.92 MiB). Final `pnpm test:package`: exit 0 with local Xvfb on PATH.
- `pnpm audit --prod --audit-level=high`: exit 0, no known vulnerabilities after pinning Monaco's transitive DOMPurify to 3.4.17.
- Dedicated screenshots were inspected for empty/populated light and dark layouts and narrow windows. These are manual visual checks, not automated contrast measurements.
- The AppImage smoke test passed after adding the available local Xvfb binary to PATH. It verified bundled Node/native dependencies, real renderer startup, runtime health and shutdown without system Node. An initial attempt failed because Xvfb was absent from PATH.

Earlier failed checks exposed a strict test typing error, a missing component-test alias,
a new settings-version fixture expectation and ambiguous appearance labels; these
were corrected. Parallel Playwright processes also shared a dev server, causing a
shutdown collision; the final full browser run used one process and passed.

No authenticated provider retest, complete native close/reopen preference acceptance,
full desktop visual matrix, abrupt-kill durability test, or cross-platform qualification
was performed. Keep those release criteria open.

## Integrated workstation gate (2026-11-01)

Commands ran from `/run/media/maybeizen/External1/projects/active/ai-harness` on
`codex/workstation` with Node v24.22.1. pnpm 11.25.0 came from the corepack shim:

```sh
export PATH="$PWD/.cache/node-v24.22.1-linux-x64/bin:$PWD/.cache/node-v24.22.1-linux-x64/lib/node_modules/corepack/shims:$PATH"
pnpm check
pnpm build
```

`pnpm check` is `format:check && lint && typecheck && test && test:browser`.
It exited 0.

- `prettier --check .` and `cargo fmt --check`: passed.
- `eslint . --max-warnings 0`, `node tooling/source-size.mjs`, and `cargo clippy --locked --all-targets -- -D warnings`: passed.
- `vue-tsc --noEmit -p tsconfig.json`: passed.
- Vitest: 86 files passed, 240 tests passed.
- `cargo test --locked`: 22 passed, 0 failed, 0 ignored.
- Playwright: 13 passed (`chat.spec.ts`, `appearance.spec.ts`, `integrations.spec.ts`, and `workflow.spec.ts`).

`pnpm build` exited 0. It produced the Vite production client bundle and finished the Tauri release profile in 2m 12s. `pnpm test:native-restart`, `pnpm test:live-providers`, and `pnpm test:package` were not run. Packaged AppImage smoke was not part of this build.

The browser workflow in `tests/browser/workflow.spec.ts` uses the fixture backend, not a live provider and not the keyring. Exercised in the UI: launch, connect the fixture OpenAI API provider, select Fixture One, send, read the streamed reply, see the saved history row, reload that state, create and open a project, switch modes, run an agent task, approve an edit, open the workspace Git list, review unified and split diffs, accept the patch, run the fixture test tool, read its result, and cancel a running task. Simulated in test code: agent events, tool results, Git status, and patch bytes. The fixture does not run bubblewrap or a real test command. History for a project with no associated chats shows the empty state because the fixture filter was extended in the browser harness.

Also covered by the passing suite, with temporary files or mocked HTTP and no live network: vision bytes are sent only when the model capability is supported; MCP stdio is refused without approval (`PERMISSION_DENIED`) or without bubblewrap (`ISOLATION_UNAVAILABLE`), and the sentinel process does not start. A connected bubblewrap stdio session was not executed.

Still open: native two-launch restart, live provider calls, Gemini CLI account sign-in, other operating systems, packaged-app smoke, and abrupt host-kill durability. The workstation is not complete while those remain unchecked.
