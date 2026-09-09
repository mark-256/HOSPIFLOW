FROM node:20-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
RUN npm ci --workspaces
COPY . .
RUN npm run build --workspace=@hospiflow/worker
USER nodejs
CMD ["node", "apps/worker/dist/worker.js"]
