# Atlas & Ink as one container: the API, which also serves the built web app.
# Build:  docker build -t atlas-ink .
# Run:    see docker-compose.prod.yml and DEPLOY.md

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @atlas/web build && pnpm --filter @atlas/api build
# Only what the API needs to run (sharp's binaries, pdfkit, the database driver and so on).
RUN pnpm --filter @atlas/api deploy --prod /out

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
COPY --from=build /repo/apps/web/dist ./web
# Maps and pictures are written here; mount a volume on it.
RUN mkdir -p /data/storage && chown -R node:node /data /app
USER node
ENV API_HOST=0.0.0.0 API_PORT=3000 STORAGE_DIR=/data/storage WEB_DIST=/app/web
EXPOSE 3000
VOLUME /data/storage
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Bring the database up to date, then start.
CMD ["sh", "-c", "node dist/migrate.js && node dist/server.js"]
