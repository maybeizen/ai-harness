# Development

## Prerequisites

Pinned versions: Node 24.22.1, pnpm 11.25.0, Rust 1.98.0. Use rustup; the repository toolchain file requests Rustfmt and Clippy. Native addons must be installed with the same Node version as the bundled runtime.

CachyOS/Arch:

```bash
sudo pacman -S --needed base-devel rustup webkit2gtk-4.1 libayatana-appindicator librsvg patchelf git python curl xorg-server-xvfb fuse2
```

Ubuntu 24.04 (also the CI environment):

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf git python3 curl xvfb libfuse2t64
```

Install rustup from its official installer if absent. Run the Node bootstrap and PATH export from the README, install the pinned pnpm version, then `pnpm install --frozen-lockfile`. `pnpm run doctor` reports missing prerequisites instead of skipping checks. Git remains an external prerequisite for future repository tooling.

## Commands

| Command             | Result                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`          | Starts Vite and Tauri; runtime/provider/contract changes rebuild resources and restart the native host and sidecar |
| `pnpm build`        | Verifies Node archive, stages native resources, checks them offline, builds UI and Rust release executable         |
| `pnpm package`      | Produces the Linux x86_64 AppImage                                                                                 |
| `pnpm lint`         | Typed ESLint, import boundaries, file sizes, Clippy with warnings denied                                           |
| `pnpm format`       | Prettier and Rustfmt                                                                                               |
| `pnpm format:check` | Read-only formatting validation                                                                                    |
| `pnpm typecheck`    | Strict Vue and TypeScript checking                                                                                 |
| `pnpm test`         | Vitest plus Rust unit tests                                                                                        |
| `pnpm test:browser` | Real Chromium checks for Monaco workers, xterm lifecycle, and deterministic chat flows                             |
| `pnpm test:package` | Extracted AppImage launch and bundled native checks under Xvfb with no system Node                                 |
| `pnpm check`        | All source-quality, unit/native, and browser checks                                                                |
| `pnpm run doctor`   | Toolchain and native prerequisite checks                                                                           |

Install the test browser using `pnpm exec playwright install chromium`; Ubuntu CI additionally uses `--with-deps`. Initial builds require network access for npm, crates.io, Node downloads, and AppImage tooling. Packaging does not publish anything.

`pnpm build` stages resources needed by Rust compilation. On a fresh checkout, run it before standalone Cargo checks or `pnpm check`. The normal development command also stages resources automatically.

## Native and packaged troubleshooting

A Node-version change requires reinstalling/rebuilding native dependencies and restaging resources. Do not copy native addons between architectures or Node ABIs. The packaged native probe loads SQLite, creates and closes a temporary PTY, checks MCP import compatibility, and constructs an offline provider handle.

The Node archive hash is pinned in `tooling/node-runtime.json` and the bootstrap script; update both together with `.node-version`, package engines, CI, and documentation. Bundled resources include native package licenses and Node's license.

On machines without FUSE, the smoke check extracts the AppImage instead of mounting it. It still tests the packaged resources and bundled Node. Browser/WebKit failures under headless graphics should be diagnosed using the captured logs; never skip failing native checks. `LIBGL_ALWAYS_SOFTWARE=1` is used by headless packaging verification.

On Linux rolling distributions, build locally for personal use. Ubuntu CI establishes a separate baseline; local binaries built against newer system libraries may not run on older distributions. No cross-distribution portability guarantee is made beyond the verified build environments.

Smoke logs live in `.cache/package-smoke/` and are uploaded with AppImages in CI. Development resources, build outputs, test artifacts, and local databases are ignored by Git.

If Xvfb is installed outside PATH, set `HARNESS_XVFB` to its absolute executable path for `doctor` and `test:package`. The smoke test always launches a real virtual display; this override does not skip verification.

## Fish shell

From the project directory, use fish syntax to activate the exact bundled toolchain:

```fish
bash tooling/bootstrap-node.sh
set -gx PATH "$PWD/.cache/node-v24.22.1-linux-x64/bin" $PATH
npm install --global pnpm@11.25.0
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm dev
```

The expected versions are v24.22.1 and 11.25.0. A different Node patch version is rejected because native addons must match the packaged toolchain. Repeat the PATH command in each new terminal, or configure your preferred version manager with `.node-version`.

Browser chat tests inject a clearly labelled test-only transport; they never use saved credentials. Native packaging smoke tests use a separate temporary application directory. Live provider acceptance is a separate manual step through Connections; never paste credentials into logs or issues.
