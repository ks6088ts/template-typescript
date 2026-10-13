# Repository development

Use the exact Node version in `.node-version` and package manager in
`package.json`. Install with `pnpm install --frozen-lockfile`.

Run focused Vitest tests first, then `make ci-test`. Application source belongs
in `src/`; the production build must never emit `test/` or `scripts/`.
Use explicit `.ts` relative imports, type-only imports, and erasable TypeScript.
Oxlint owns lint rules; Biome owns formatting and import organization.

Keep runtime dependencies minimal. Add tests for request validation, resource
cleanup, and shutdown changes. Do not run unverified downloaded scripts or
weaken release/scanner gates. Pin actions to verified commit SHAs.

Keep secrets and generated output out of commits. Document checks that could
not run, and distinguish repository files from owner-managed GitHub settings.
