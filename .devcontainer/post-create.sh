#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
manager=$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).packageManager')
npm install --global "$manager"
pnpm install --frozen-lockfile
