#!/usr/bin/env bash
set -euo pipefail

if (( $# > 1 )); then
  echo "Usage: $0 [IMAGE]" >&2
  exit 2
fi
image=${1:-template-typescript:smoke}
for tool in docker node; do
  command -v "$tool" >/dev/null || { echo "$tool is required" >&2; exit 1; }
done

container=""
cleanup() {
  if [[ -n "$container" ]]; then
    docker rm --force "$container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

container=$(docker run --detach --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  --publish 127.0.0.1::3000 \
  --env HOST=0.0.0.0 --env PORT=3000 "$image")
healthy=false
for (( attempt=0; attempt<60; attempt++ )); do
  state=$(docker inspect --format '{{.State.Status}}' "$container")
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container")
  if [[ "$health" == healthy ]]; then
    healthy=true
    break
  fi
  if [[ "$state" != running || "$health" == unhealthy || "$health" == missing ]]; then
    break
  fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  docker logs "$container" >&2
  echo "Container did not become healthy" >&2
  exit 1
fi

binding=$(docker port "$container" 3000/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:[0-9]+$ ]] || {
  echo "Unexpected port binding: $binding" >&2
  exit 1
}
metadata=$(docker exec "$container" /nodejs/bin/node -p \
  'JSON.stringify({packageVersion:require("./package.json").version,gitTag:process.env.GIT_TAG||"unknown",gitRevision:process.env.GIT_REVISION??"unknown"})')
node --input-type=module - "http://$binding" "$metadata" <<'JS'
import assert from "node:assert/strict";

const base = process.argv[2];
async function request(path, options, status = 200) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, status, path);
  assert.match(response.headers.get("content-type") ?? "", /^application\/(?:problem\+)?json\b/);
  return response.json();
}
assert.deepEqual(await request("/healthz"), { status: "ok" });
assert.deepEqual(await request("/readyz"), { status: "ready" });
const version = await request("/version");
const metadata = JSON.parse(process.argv[3]);
assert.deepEqual(version, {
  version: metadata.gitTag && metadata.gitTag !== "unknown" ? metadata.gitTag : metadata.packageVersion,
  gitTag: metadata.gitTag,
  gitRevision: metadata.gitRevision,
});
const post = (body) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
assert.deepEqual(await request("/api/v1/add", post({ a: 2, b: 3 })), { result: 5 });
assert.deepEqual(await request("/api/v1/sum", post({ numbers: [1, 2, 3] })), { result: 6 });
for (const [path, options, status] of [
  ["/missing", undefined, 404],
  ["/api/v1/add", undefined, 405],
  ["/api/v1/add", post({ a: "2", b: 3 }), 400],
]) {
  const problem = await request(path, options, status);
  assert.equal(problem.status, status);
  assert.equal(typeof problem.type, "string");
  assert.equal(typeof problem.title, "string");
}
JS

docker stop --time 15 "$container" >/dev/null
exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$container")
[[ "$exit_code" == 0 ]] || {
  docker logs "$container" >&2
  echo "Expected graceful SIGTERM exit 0, got $exit_code" >&2
  exit 1
}
echo "Container health, HTTP contract and graceful shutdown passed."
