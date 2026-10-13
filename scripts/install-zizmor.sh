#!/usr/bin/env bash
set -euo pipefail

readonly version=1.30.1
if (( $# > 1 )); then
  echo "Usage: $0 [TOOLS_DIR]" >&2
  exit 2
fi
tools_dir=${1:-${TOOLS_DIR:-"$HOME/.local/bin"}}
[[ -n "$tools_dir" ]] || { echo "TOOLS_DIR must not be empty" >&2; exit 2; }
for tool in curl sha256sum tar install uname mktemp; do
  command -v "$tool" >/dev/null || { echo "$tool is required" >&2; exit 1; }
done
[[ "$(uname -s)" == Linux ]] || { echo "Only Linux is supported" >&2; exit 1; }
case "$(uname -m)" in
  x86_64 | amd64)
    target=x86_64-unknown-linux-gnu
    checksum=e65324f4430c2717591937edcec90ccbefaf14c174f8ec9415e03ca875b46e1a
    ;;
  aarch64 | arm64)
    target=aarch64-unknown-linux-gnu
    checksum=7ff1dce33bdd18fd2a4affe63bdd47efcccca97b2cec1c1863ec26e9e2647540
    ;;
  *) echo "Only Linux x64 and arm64 are supported" >&2; exit 1 ;;
esac

umask 077
staging=$(mktemp -d /tmp/template-typescript-zizmor.XXXXXX)
cleanup() { rm -rf -- "$staging"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

asset="zizmor-$target.tar.gz"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "https://github.com/zizmorcore/zizmor/releases/download/v$version/$asset" \
  --output "$staging/$asset"
printf '%s  %s\n' "$checksum" "$staging/$asset" | sha256sum --check --status
tar --extract --gzip --file "$staging/$asset" --directory "$staging" \
  --no-same-owner --no-same-permissions zizmor
[[ -f "$staging/zizmor" && ! -L "$staging/zizmor" ]] || {
  echo "Verified archive did not contain a regular zizmor binary" >&2
  exit 1
}
install -d -- "$tools_dir"
install -m 0755 -- "$staging/zizmor" "$tools_dir/zizmor"
"$tools_dir/zizmor" --version
