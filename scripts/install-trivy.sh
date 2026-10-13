#!/usr/bin/env bash
set -euo pipefail

readonly version=0.75.0
readonly repo=aquasecurity/trivy
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
  x86_64 | amd64) arch=64bit ;;
  aarch64 | arm64) arch=ARM64 ;;
  *) echo "Only Linux x64 and arm64 are supported" >&2; exit 1 ;;
esac

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
umask 077
staging="$root/.trivy-download.$$.$RANDOM"
mkdir -- "$staging"
cleanup() { rm -rf -- "$staging"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

asset="trivy_${version}_Linux-${arch}.tar.gz"
gh release download "v$version" --repo "$repo" --pattern "$asset" --dir "$staging"
gh release verify-asset "v$version" "$staging/$asset" --repo "$repo"
tar --extract --gzip --file "$staging/$asset" --directory "$staging" \
  --no-same-owner --no-same-permissions trivy
[[ -f "$staging/trivy" && ! -L "$staging/trivy" ]] || {
  echo "Verified archive did not contain a regular trivy binary" >&2
  exit 1
}
install -d -- "$tools_dir"
install -m 0755 -- "$staging/trivy" "$tools_dir/trivy"
"$tools_dir/trivy" --version
