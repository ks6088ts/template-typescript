# Git
GIT_REVISION ?= $(shell git rev-parse --short HEAD)
GIT_TAG ?= $(shell git describe --tags --abbrev=0 --always)

# Docker
DOCKER_REPO_NAME ?= local
DOCKER_IMAGE_NAME ?= $(notdir $(CURDIR))
IMAGE ?= $(DOCKER_REPO_NAME)/$(DOCKER_IMAGE_NAME):$(GIT_TAG)
TOOLS_DIR ?= $(HOME)/.local/bin
COMMAND ?= src/main.ts

.PHONY: help install-deps-dev install-trivy install-actionlint install-zizmor workflow-lint format-check format fix lint test build ci-test run docker-build docker-run docker-lint docker-scan ci-test-docker
.DEFAULT_GOAL := help

help: ## show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

install-deps-dev: ## install the pinned package manager and locked dependencies
	npm install --global "$$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).packageManager')"
	pnpm install --frozen-lockfile

install-trivy: ## install verified Trivy release assets
	bash scripts/install-trivy.sh "$(TOOLS_DIR)"

install-actionlint: ## install verified actionlint release assets
	bash scripts/install-actionlint.sh "$(TOOLS_DIR)"

install-zizmor: ## install checksum-pinned zizmor
	bash scripts/install-zizmor.sh "$(TOOLS_DIR)"

workflow-lint: ## validate workflow syntax and security
	actionlint
	zizmor .github/workflows .github/actions

format-check: ## check formatting and import order
	pnpm format:check

format: ## format and organize imports
	pnpm run format

fix: format ## apply auto-fixes

lint: ## check lint, types and toolchain consistency
	pnpm lint
	pnpm typecheck
	pnpm check:versions

test: ## run tests with coverage thresholds
	pnpm test:cov

build: ## build only production source
	pnpm build

ci-test: format-check lint test build ## run application CI checks using installed dependencies

run: ## run TypeScript directly
	node --env-file-if-exists=.env $(COMMAND)

docker-build: ## build the container image
	docker build -t "$(IMAGE)" --build-arg GIT_REVISION="$(GIT_REVISION)" --build-arg GIT_TAG="$(GIT_TAG)" .

docker-run: ## run the HTTP service on port 3000
	docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges -p 3000:3000 "$(IMAGE)"

docker-lint: ## run Docker Build Checks
	docker buildx build --check .

docker-scan: ## fail on fixable high or critical vulnerabilities
	trivy image --exit-code 1 --severity CRITICAL,HIGH --ignore-unfixed "$(IMAGE)"

ci-test-docker: docker-lint docker-build docker-scan ## validate the container and graceful shutdown
	bash scripts/smoke-test.sh "$(IMAGE)"
