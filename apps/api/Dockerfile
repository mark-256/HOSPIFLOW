FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/database/package.json packages/database/
RUN npm ci --workspaces
COPY . .
RUN npm run build --workspace=@hospiflow/database
RUN npm run build --workspace=@hospiflow/api

FROM node:20-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/database ./packages/database
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/package.json ./apps/api/
USER nodejs
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
