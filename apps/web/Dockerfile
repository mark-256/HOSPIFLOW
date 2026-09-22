FROM node:20-slim AS builder

WORKDIR /app

ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=${API_INTERNAL_URL}

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

RUN npm run build --workspace=@hospiflow/web


FROM node:20-slim

RUN groupadd -g 1001 -r nodejs && \
    useradd -u 1001 -r -g nodejs -s /bin/sh -m nodejs

WORKDIR /app

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=nodejs:nodejs /app/apps/web/next.config.js ./apps/web/
COPY --from=builder --chown=nodejs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nodejs:nodejs /app/apps/web/package.json ./apps/web/

USER nodejs

EXPOSE 3000

WORKDIR /app/apps/web

CMD ["node", "../../node_modules/.bin/next", "start"]
