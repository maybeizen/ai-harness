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
