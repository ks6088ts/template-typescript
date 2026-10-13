# syntax=docker/dockerfile:1
# check=error=true

FROM --platform=$BUILDPLATFORM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS builder

WORKDIR /app

RUN npm install --global pnpm@12.11.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Deliberately avoid mutable cache mounts: release builds must not consume shared caches.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN pnpm build

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:9eeb7f5887d0e239e78264b06f7f11d2e14be534050481803a9e4728fcdd278e AS production

ARG GIT_TAG=unknown
ARG GIT_REVISION=unknown

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    GIT_TAG=$GIT_TAG \
    GIT_REVISION=$GIT_REVISION

WORKDIR /app
COPY --from=builder --chown=65532:65532 /app/package.json ./
COPY --from=builder --chown=65532:65532 /app/dist/ ./dist/

USER 65532:65532
EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/nodejs/bin/node", "-e", "const http=require('node:http');const req=http.get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/healthz'},res=>{res.resume();process.exitCode=res.statusCode===200?0:1;});req.setTimeout(2000,()=>{req.destroy();process.exitCode=1;});req.on('error',()=>{process.exitCode=1;});"]

ENTRYPOINT ["/nodejs/bin/node"]
CMD ["dist/main.js"]
