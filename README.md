[![test](https://github.com/ks6088ts/template-typescript/actions/workflows/test.yaml/badge.svg?branch=main)](https://github.com/ks6088ts/template-typescript/actions/workflows/test.yaml?query=branch%3Amain)
[![docker](https://github.com/ks6088ts/template-typescript/actions/workflows/docker.yaml/badge.svg?branch=main)](https://github.com/ks6088ts/template-typescript/actions/workflows/docker.yaml?query=branch%3Amain)
[![docker-release](https://github.com/ks6088ts/template-typescript/actions/workflows/docker-release.yaml/badge.svg)](https://github.com/ks6088ts/template-typescript/actions/workflows/docker-release.yaml)
[![ghcr-release](https://github.com/ks6088ts/template-typescript/actions/workflows/ghcr-release.yaml/badge.svg)](https://github.com/ks6088ts/template-typescript/actions/workflows/ghcr-release.yaml)

# template-typescript

A GitHub template repository for TypeScript

## Prerequisites

- [Node 22.12.0+](https://nodejs.org/en/download)
- [pnpm](https://pnpm.io/installation)
- [GNU Make](https://www.gnu.org/software/make/)

## Development instructions

### Local development

Use Makefile to run the project locally.

```shell
# help
make

# install dependencies for development
make install-deps-dev

# run tests
make test

# build applications
make build

# run CI tests
make ci-test

# release applications
make release
```

### Docker development

```shell
# build docker image
make docker-build

# run docker container
make docker-run

# run CI tests in docker container
make ci-test-docker
```

## Deployment instructions

### Docker Hub

To publish the docker image to Docker Hub, you need to [create access token](https://app.docker.com/settings/personal-access-tokens/create) and set the following secrets in the repository settings.

```shell
gh secret set DOCKERHUB_USERNAME --body $DOCKERHUB_USERNAME
gh secret set DOCKERHUB_TOKEN --body $DOCKERHUB_TOKEN
```
