FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/ui/package.json packages/ui/
RUN npm ci --workspaces --ignore-scripts && npm rebuild
COPY . .
RUN npm run db:generate --workspace=@hospiflow/database
RUN npm run build --workspace=@hospiflow/database
RUN npm run build --workspace=@hospiflow/api

FROM node:20-slim
RUN groupadd -g 1001 -r nodejs && useradd -u 1001 -r -g nodejs -s /bin/sh -m nodejs
RUN apt-get update && apt-get install -y --no-install-recommends libssl3 ca-certificates libpq5 gzip && rm -rf /var/lib/apt/lists/*
COPY --from=postgres:16-bookworm /usr/lib/postgresql/16/bin/pg_dump /usr/local/bin/pg_dump
COPY --from=postgres:16-bookworm /usr/lib/postgresql/16/bin/psql /usr/local/bin/psql
WORKDIR /app
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/database ./packages/database
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/package.json ./apps/api/
USER nodejs
EXPOSE 3001
CMD ["node", "apps/api/dist/src/server.js"]
