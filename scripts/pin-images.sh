#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
dockerfile="$root/Dockerfile"
for tool in docker python3; do
  command -v "$tool" >/dev/null || { echo "$tool is required" >&2; exit 1; }
done

images=(node:24.21.0-trixie-slim gcr.io/distroless/nodejs24-debian13:nonroot)
digests=()
for image in "${images[@]}"; do
  digest=$(docker buildx imagetools inspect "$image" --format '{{.Manifest.Digest}}')
  if [[ ! "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    echo "No valid registry digest returned for $image" >&2
    exit 1
  fi
  digests+=("$digest")
done

# Inspect both tags successfully before changing either pin.
python3 - "$dockerfile" "${images[0]}" "${digests[0]}" "${images[1]}" "${digests[1]}" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text()
for image, digest in zip(sys.argv[2::2], sys.argv[3::2]):
    pattern = rf"(?m)^(FROM (?:--platform=\S+ )?){re.escape(image)}(?:@sha256:[0-9a-f]{{64}})?(?= AS |$)"
    text, count = re.subn(pattern, lambda match: f"{match[1]}{image}@{digest}", text)
    if count != 1:
        raise SystemExit(f"Expected exactly one FROM for {image}; found {count}")
path.write_text(text)
PY
printf 'Pinned %s@%s\n' "${images[0]}" "${digests[0]}" "${images[1]}" "${digests[1]}"
