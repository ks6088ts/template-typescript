# Setup, migration, and operations

## Template initialization

Use GitHub's **Use this template**, then run
`node scripts/init-template.ts OWNER REPO` and review the diff. This updates
the README links, package name/author, security report link, and CODEOWNERS.
Workflow image names derive
from `github.repository`; local Make targets default to `local/<directory>`.
No Docker Hub namespace or personal access token is embedded in publishing.

Open the Dev Container for the same Node release and locked dependencies used
by CI. `.env` is ignored by Git and excluded from the Docker context.
Do not put credentials into `.env.example`.

## Toolchain decisions

1. **Node and TypeScript:** `.node-version` is the runtime source of truth.
   `pnpm check:versions` checks the engine minimum, Node types, Docker, and
   Dev Container. Node 24 is the production baseline; Node 26 has a CI lane.
   TypeScript 7 uses explicit strict ESM/NodeNext settings. Change all checked
   versions together when promoting a new LTS.
2. **No runtime dependencies:** HTTP uses `node:http`; CLI parsing uses
   `node:util`. Adopt a framework when application complexity justifies it.
3. **Source-only build:** typechecking covers source, tests, and scripts;
   `tsconfig.build.json` emits only source. A clean build prevents stale output.
4. **One release:** GHCR replaces separate Docker Hub/GHCR builds. The tag is the
   release version; `package.json` is private and is not an npm release source.
5. **Verified tooling:** fixed versions and authenticated release downloads,
   followed by cryptographic verification. Neither a checksum fetched alongside
   an asset nor a version tag alone proves its origin. Verification also cannot
   defend against a compromised authorized builder; waiting periods and review
   remain necessary.

The dependency age policy deliberately prevented adoption of releases younger
than three days during this migration. Vitest/coverage and typed lint use the
latest eligible versions. `tinybench` is temporarily constrained to an eligible
release; remove that override in a reviewed update after newer releases mature.
Only esbuild is allowed to run a dependency build script.

## GitHub configuration (owner action required)

Files in a template cannot enable repository settings or assign reviewers.
Before relying on CI/CD as a protection boundary:

`bash scripts/setup-repo.sh --apply` applies the supplied rulesets and attempts
to enable supported security reporting/secret features using your administrative
`gh` session. It does not set reviewers, cloud credentials, or an unrestricted
tag bypass. Unsupported features are reported explicitly. Review the rulesets
and arrange authorized release-tag bypass before applying them.

- Set Actions' default token permissions to read-only and require full-length
  action SHA references. Restrict actions to reviewed publishers.
- Import the JSON policies in `.github/rulesets/`. Require **ci-ok** on the
  default branch, pull requests/reviews, resolved discussions, and prohibit
  force pushes/deletion. The `merge_group` CI trigger supports merge queues.
- Configure the release-tag ruleset bypass for your authorized release actor.
  Do not grant general contributors bypass. Confirm a normal user cannot
  create, move, or delete `v*` tags and the release workflow can create them.
  The built-in `GITHUB_TOKEN` is **not** assumed to bypass tag creation.
  For the creation ruleset, install a dedicated GitHub App on this repository
  with contents-write permission and grant **that App** creation-policy bypass.
  Set `RELEASE_APP_CLIENT_ID` and `RELEASE_APP_PRIVATE_KEY` in the protected
  release Environment. The workflow mints a repository-scoped, contents-only
  token and revokes it after the job. Do not grant this App bypass of the separate
  update/deletion ruleset. Without an App, the built-in token works only when
  source-tag creation is otherwise allowed; a restrictive policy fails closed.
- Create a **release** Environment with default-branch-only deployments and
  required trusted reviewers. Create **staging** and **production**, restrict
  both to the default branch, require production review, and prevent self-review.
  Without these settings, declaring `environment:` alone is not approval.
- Enable immutable releases in repository Settings before publishing.
- Enable secret scanning/push protection and private vulnerability reporting
  where supported. CodeQL and dependency review require appropriate licenses
  for private repositories. Configure workflow variables as described below;
  unsupported features must not silently replace a required protection.
- Enable Artifact Attestations where your plan supports them. Public
  repositories support them; private repositories may require Enterprise Cloud.
- Update CODEOWNERS to your team's reviewers, not the template owner.
- After merging, test `copilot-setup-steps.yml` using Actions. Its single setup
  job installs the same locked toolchain; it does not receive release secrets.

CodeQL scans TypeScript and GitHub Actions. Workflow-security runs actionlint
and zizmor. Review their output as well as package and container vulnerabilities.
Dependabot handles npm, GitHub Actions, Docker, and Dev Containers, with
grouping and cooling periods. Keep SHA comments and hashes synchronized.

| Repository variable | Policy |
| --- | --- |
| `ENABLE_DEPENDENCY_REVIEW=true` | Enable dependency review on a licensed private repository; public repositories enable it by default. |
| `ENABLE_CODEQL=true` | Enable CodeQL on a licensed private repository; public repositories enable it by default. |
| `ENABLE_ATTESTATIONS=true` | Required for attestations in a supported private repository. Public repositories enable attestations unless explicitly set to `false`. |
| `ENABLE_DEPLOYMENT=true` | Opt into Azure deployment. Deployment still requires attestations and valid Environment/OIDC configuration. |

Disabling attestations is a documented registry-only mode, not a deployable
release. Unsupported licensed checks should be explicitly acknowledged by the
owner; do not claim they ran.

Locally, use `make install-actionlint install-zizmor` and
`make workflow-lint` after adding the tool directory to PATH.

## Release procedure

1. Merge changes through `ci-ok`; select **Release** on the default branch.
2. Supply a full SemVer version. The workflow rejects malformed or reused
   versions and stable versions not newer than the latest stable release.
3. All required CI gates rerun before publishing. Release paths do not consume
   dependency/build caches.
4. Approve the release Environment only after checking the selected commit.
5. Review GHCR vulnerability results, provenance/SBOM, and the GitHub Release
   containing the image digest. A prerelease does not advance `latest`.

There is no tag-push publishing workflow. Built-in-token-created tags do not
trigger other workflows; App-created tags may trigger any separately configured
tag listeners, so review those when customizing the template.
Never bypass a failed vulnerability gate to get a release out: update the base
image/dependency, investigate, and rerun verification.

## Azure deployment and rollback

Deployment is opt-in and assumes an existing Azure Container App. The optional
`infra/azure/main.bicep` provisions a small app in an existing managed environment.
It expects a publicly pullable, digest-pinned image; private GHCR pulls require
separately configured registry credentials, not Azure managed-identity magic.

Create a federated deployment identity in Azure. Use GitHub's actual OIDC issuer,
audience, and subject for the target Environment (retrieve the repository's OIDC
configuration rather than assuming a legacy name-based subject). Limit its Azure
role to the target apps/resource group, not the subscription.
Configure `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
`AZURE_RESOURCE_GROUP`, and `AZURE_CONTAINER_APP` as Environment variables.
The workflow obtains a short-lived OIDC token; there is no Azure client secret.

For initial deployment or rollback, dispatch **Deploy** on the default branch
with the recorded `sha256:<64 hex digits>` digest. Only an image from this
repository with verified release-workflow provenance is accepted. Stage and
health-check it first, then approve production. Keep the previously working
digest for rollback. Required attestation verification fails closed; do not
disable it to deploy on a plan without support.

Azure is optional; do not enable deployment until federation, registry access,
reviewers, branch restrictions, and health probes have been tested.

## Validation boundaries

Local application tests, source/build execution, and static checks do not prove
GitHub Environment enforcement, live registry publishing, attestation issuance,
or Azure federation. Validate these in a disposable repository/environment
before production adoption. Docker and scanner validation also depend on
registry/release/database network availability; failures must be reported,
not represented as successful scans.

## References

- [Node TypeScript support](https://nodejs.org/api/typescript.html)
- [pnpm settings](https://pnpm.io/settings)
- [GitHub artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations)
- [Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets)
- [Azure OIDC](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-azure)
