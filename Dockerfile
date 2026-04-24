# Stage 1: Build with npm (NOT pnpm) so Next.js records flat node_modules paths
FROM node:20-bookworm-slim@sha256:f93745c153377ee2fbbdd6e24efcd03cd2e86d6ab1d8aa9916a3790c40313a55 AS builder
WORKDIR /app

# Install build tools for native modules (python3, make, g++)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package.json only (npm install without lockfile is fine for Docker)
COPY package.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npx next build

# Stage 2: Minimal Production Image
FROM node:20-bookworm-slim@sha256:f93745c153377ee2fbbdd6e24efcd03cd2e86d6ab1d8aa9916a3790c40313a55 AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy standalone output (Next.js now references flat /app/node_modules/better-sqlite3/ paths)
COPY --from=builder --chown=1000:10 /app/.next/standalone ./
COPY --from=builder --chown=1000:10 /app/.next/static ./.next/static
COPY --from=builder --chown=1000:10 /app/public ./public

# Copy the real better-sqlite3 with its compiled native binary
COPY --from=builder --chown=1000:10 /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
# bindings module is needed by better-sqlite3 to locate the .node file
COPY --from=builder --chown=1000:10 /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder --chown=1000:10 /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

USER 1000:10

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
