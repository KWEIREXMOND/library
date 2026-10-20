# ── Build ──────────────────────────────────────────────────────────────
# Node 22 ships `node:sqlite`, which the server uses instead of a native
# better-sqlite3 build.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NODE_NO_WARNINGS=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.server.json vite.config.ts vitest.config.ts ./
COPY tailwind.config.js postcss.config.js index.html ./
COPY public ./public
COPY src ./src
COPY server ./server
COPY scripts ./scripts

RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    PORT=4000 \
    DATA_DIR=/data \
    CLIENT_DIST=/app/dist

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist-server/index.js"]
