#!/usr/bin/env bash
set -euo pipefail

readonly version=1.7.12
readonly repo=rhysd/actionlint
if (( $# > 1 )); then
  echo "Usage: $0 [TOOLS_DIR]" >&2
  exit 2
fi
tools_dir=${1:-${TOOLS_DIR:-"$HOME/.local/bin"}}
[[ -n "$tools_dir" ]] || { echo "TOOLS_DIR must not be empty" >&2; exit 2; }
for tool in gh tar install uname; do
  command -v "$tool" >/dev/null || { echo "$tool is required" >&2; exit 1; }
done
[[ "$(uname -s)" == Linux ]] || { echo "Only Linux is supported" >&2; exit 1; }
case "$(uname -m)" in
  x86_64 | amd64) arch=amd64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "Only Linux x64 and arm64 are supported" >&2; exit 1 ;;
esac

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
umask 077
staging="$root/.actionlint-download.$$.$RANDOM"
mkdir -- "$staging"
cleanup() { rm -rf -- "$staging"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

asset="actionlint_${version}_linux_${arch}.tar.gz"
gh release download "v$version" --repo "$repo" --pattern "$asset" --dir "$staging"
gh attestation verify "$staging/$asset" --repo "$repo"
tar --extract --gzip --file "$staging/$asset" --directory "$staging" \
  --no-same-owner --no-same-permissions actionlint
[[ -f "$staging/actionlint" && ! -L "$staging/actionlint" ]] || {
  echo "Verified archive did not contain a regular actionlint binary" >&2
  exit 1
}
install -d -- "$tools_dir"
install -m 0755 -- "$staging/actionlint" "$tools_dir/actionlint"
"$tools_dir/actionlint" -version
