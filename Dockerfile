# Build stage
FROM node:22.17.0-bookworm AS builder

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm@10.12.4 && pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# Production stage
FROM node:22.17.0-bookworm-slim AS production

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm@10.12.4 && pnpm install --prod --frozen-lockfile

COPY --from=builder /usr/src/app/dist ./dist

CMD [ "node", "dist/src/main.js" ]
