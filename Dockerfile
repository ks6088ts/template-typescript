# Define versions for reuse
ARG NODE_VERSION=22.17.0
ARG ALPINE_VARIANT=alpine
ARG PNPM_VERSION=10.12.4

# Build stage
FROM node:${NODE_VERSION}-${ALPINE_VARIANT} AS builder

ARG PNPM_VERSION

WORKDIR /usr/src/app

# Copy package files first for better layer caching
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm@"${PNPM_VERSION}" \
  && pnpm install --frozen-lockfile

# Copy source code and build
COPY . .
RUN pnpm build

# Production stage
FROM node:${NODE_VERSION}-${ALPINE_VARIANT} AS production

ARG PNPM_VERSION

# Install dumb-init for proper signal handling
# hadolint ignore=DL3018
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs \
  && adduser -S nextjs -u 1001 -G nodejs

WORKDIR /usr/src/app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and production dependencies only
RUN npm install -g pnpm@"${PNPM_VERSION}" \
  && pnpm install --prod --frozen-lockfile \
  && npm cache clean --force \
  && rm -rf ~/.pnpm-store

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /usr/src/app/dist ./dist

# Switch to non-root user
USER nextjs

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main.js"]
