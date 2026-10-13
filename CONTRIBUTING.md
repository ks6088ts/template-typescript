# Contributing

Use the Node and pnpm releases specified in `.node-version` and `package.json`.
Install with `make install-deps-dev`, then run `make ci-test`.
Container changes also require `make ci-test-docker`; workflow changes require
actionlint and zizmor. Do not commit generated output or credentials.

Use Conventional Commit PR titles, for example `fix: preserve prerelease tags`.
Include focused regression tests and describe validation limitations. Keep
production builds source-only. Dependency updates must retain a genuine lockfile
and respect the supply-chain waiting/build-script policies.

Report vulnerabilities privately using the security policy, not a public issue.
