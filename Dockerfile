# ── Stage 1: Build ────────────────────────────────────────────────────────────
# Use npm (not pnpm) so Next.js standalone records flat /app/node_modules paths.
# better-sqlite3 needs native compilation — the build tools are only needed here.
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY . .
RUN npx next build

# ── Stage 2: Minimal production image ─────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app

LABEL version="20260609"

ENV NODE_ENV=production

# Next.js standalone output
COPY --from=builder --chown=1000:10 /app/.next/standalone ./
COPY --from=builder --chown=1000:10 /app/.next/static     ./.next/static
COPY --from=builder --chown=1000:10 /app/public           ./public

# Native module: better-sqlite3 + its runtime deps
COPY --from=builder --chown=1000:10 /app/node_modules/better-sqlite3   ./node_modules/better-sqlite3
COPY --from=builder --chown=1000:10 /app/node_modules/bindings         ./node_modules/bindings
COPY --from=builder --chown=1000:10 /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

USER 1000:10

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
