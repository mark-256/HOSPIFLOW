FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspaces
COPY . .
RUN npm run build --workspace=@hospiflow/web

FROM node:20-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=nodejs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nodejs:nodejs /app/apps/web/package.json ./apps/web/
USER nodejs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
