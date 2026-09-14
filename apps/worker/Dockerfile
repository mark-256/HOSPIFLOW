FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/ui/package.json packages/ui/
RUN npm ci --workspaces --ignore-scripts && npm rebuild
COPY . .
RUN npm run build --workspace=@hospiflow/worker

FROM node:20-slim
RUN groupadd -g 1001 -r nodejs && useradd -u 1001 -r -g nodejs -s /bin/sh -m nodejs
WORKDIR /app
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/worker/package.json ./apps/worker/
USER nodejs
CMD ["node", "apps/worker/dist/worker.js"]
