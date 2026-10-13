#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" != "--apply" || $# != 1 ]]; then
  printf '%s\n' \
    'Usage: bash scripts/setup-repo.sh --apply' \
    'Requires repository administration permission in gh.' \
    'Applies branch/tag rulesets and enables supported security features.' \
    'Configure release-tag bypass and protected Environment reviewers manually.' \
    'See docs/index.md; this command never configures an unrestricted tag bypass.'
  exit 1
fi

gh auth status
branch=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
ref=$(jq -nr --arg ref "$branch" '$ref | @uri')
actions_id=$(gh api "repos/{owner}/{repo}/commits/$ref/check-runs?per_page=100" --paginate \
  --jq '.check_runs[] | select(.app.slug == "github-actions") | .app.id' | sort -u)
if [[ ! "$actions_id" =~ ^[0-9]+$ ]]; then
  printf '%s\n' 'Run CI on the default branch first; cannot resolve the GitHub Actions check publisher.' >&2
  exit 1
fi
for path in .github/rulesets/*.json; do
  name=$(jq -r '.name' "$path")
  id=$(gh api 'repos/{owner}/{repo}/rulesets' --paginate |
    jq -r --arg name "$name" '.[] | select(.name == $name) | .id')
  if [[ -n "$id" ]]; then
    actors=$(gh api "repos/{owner}/{repo}/rulesets/$id" --jq '.bypass_actors // []')
    jq --argjson actors "$actors" --argjson actions "$actions_id" \
      '.bypass_actors = $actors |
       (.rules[] | select(.type == "required_status_checks") |
        .parameters.required_status_checks[] | select(.context == "ci-ok") |
        .integration_id) = $actions' "$path" |
      gh api --method PUT "repos/{owner}/{repo}/rulesets/$id" --input - >/dev/null
  else
    jq --argjson actions "$actions_id" \
      '(.rules[] | select(.type == "required_status_checks") |
       .parameters.required_status_checks[] | select(.context == "ci-ok") |
       .integration_id) = $actions' "$path" |
      gh api --method POST 'repos/{owner}/{repo}/rulesets' --input - >/dev/null
  fi
  printf 'Applied ruleset: %s\n' "$name"
done

if gh api --method PUT 'repos/{owner}/{repo}/private-vulnerability-reporting' >/dev/null; then
  printf '%s\n' 'Private vulnerability reporting enabled.'
else
  printf '%s\n' 'NOT ENABLED: private vulnerability reporting; check repository/plan support.' >&2
fi
if gh api --method PATCH 'repos/{owner}/{repo}' --input - >/dev/null <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": {"status": "enabled"},
    "secret_scanning_push_protection": {"status": "enabled"}
  }
}
JSON
then
  printf '%s\n' 'Secret scanning and push protection enabled.'
else
  printf '%s\n' 'NOT ENABLED: secret scanning/push protection; check repository/plan support.' >&2
fi

printf '%s\n' \
  'Still required: protected release/staging/production Environments and reviewers,' \
  'authorized release-tag bypass, immutable releases, Actions SHA/default-token policy,' \
  'feature variables for licensed workflows, and Azure OIDC federation if deploying.' \
  'Review docs/index.md before publishing.'
