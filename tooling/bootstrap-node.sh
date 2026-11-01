#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
version=24.22.1
archive="node-v${version}-linux-x64.tar.xz"
mkdir -p .cache
curl --fail --location --retry 3 "https://nodejs.org/dist/v${version}/${archive}" -o ".cache/${archive}"
printf '%s  %s\n' '6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6' ".cache/${archive}" | sha256sum --check -
tar -xJf ".cache/${archive}" -C .cache
printf 'Run: export PATH="$PWD/.cache/node-v%s-linux-x64/bin:$PATH"\n' "$version"
