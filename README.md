[![CI](https://github.com/ks6088ts/template-typescript/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ks6088ts/template-typescript/actions/workflows/ci.yml)

# template-typescript

A TypeScript template with a dependency-free HTTP service, CLI, tested lifecycle,
and security-gated container releases.

## Development

- Install the exact Node release in `.node-version` (Node 24 LTS).
- `package.json#packageManager` specifies the exact pnpm version.
- GNU Make, Docker/Buildx, and GitHub CLI are needed for container/workflow checks.

```sh
make install-deps-dev
cp .env.example .env
pnpm dev
curl http://localhost:3000/healthz

pnpm format:check
pnpm lint
pnpm typecheck
pnpm check:versions
pnpm test:cov
pnpm build
pnpm start
```

`make ci-test` wraps the application checks. `pnpm format` formats and organizes
imports; Oxlint is the single linter, including type-aware Promise rules.
TypeScript runs directly during development; production builds include only
`src/`, never tests or maintenance scripts. Node 26 is also tested in CI.

The service exposes `/healthz`, `/readyz`, `/version`, and calculator APIs.
`/version` reports the build tag and Git revision; untagged local builds fall
back to the private package's version.
Invalid requests receive RFC 9457 problem responses. SIGTERM/SIGINT drain
requests within a bounded deadline. Configuration, structured logs, and tests
are examples to adapt, not a substitute for application-specific policies.

```sh
curl -H 'content-type: application/json' \
  -d '{"a":2,"b":3}' http://localhost:3000/api/v1/add
pnpm cli --message World
pnpm cli add 2 3
```

## Containers

```sh
make install-actionlint
make install-trivy
export PATH="$HOME/.local/bin:$PATH"
make docker-lint docker-build docker-scan
make ci-test-docker
```

Tool installers download fixed releases and verify their GitHub attestations or
immutable release assets **before** extraction/execution. Authenticate `gh`
locally; CI supplies a read-only token. Verification failures stop installation.
The runtime is distroless and non-root, with no shell or package manager.
The smoke test exercises a read-only filesystem, health checks, and clean stop.
`bash scripts/pin-images.sh` refreshes verified image digests when updating bases.

## Release and deployment

Use the **Release** workflow on the default branch with an unused SemVer version,
for example `0.1.0` or `0.2.0-rc.1`. Do not push tags to publish.
Release verification reruns CI without dependency/build caches. GHCR is the
only publishing registry; Docker Hub credentials are no longer required.
Prereleases retain their complete version and never update `latest`.
Stable versions must be newer than the latest stable release.

Configure protected GitHub Environments before using releases or deployments.
Deployment is optional: provision Azure Container Apps, configure OIDC, and
set the documented variables. Deployments and rollback use an attested image
**digest**, not a mutable tag. See [repository setup and migration](docs/index.md).

## Supply-chain policy

Dependencies and GitHub Actions are pinned and updated by Dependabot. pnpm
rejects versions published less than three days ago, provenance downgrades,
exotic transitive sources, and unapproved build scripts. Commit the real
`pnpm-lock.yaml`; CI installs with `--frozen-lockfile`.

Coverage gates: lines/statements 90%, functions 85%, branches 80%.
Trivy fails on fixable HIGH/CRITICAL findings. Workflow syntax/security checks,
CodeQL, and dependency review complement application tests.

See [contributing](CONTRIBUTING.md) and [security reporting](.github/SECURITY.md).
