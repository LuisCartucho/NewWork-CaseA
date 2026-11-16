# Retailer Inbox Helper: one container serving the API and the static client.
# Layout inside the image mirrors the repo (/app/server, /app/client), so config.ts paths just work.

# ---- build: compile TypeScript ----
FROM node:24-slim AS build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ---- runtime: production deps + compiled JS + data ----
FROM node:24-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./dist
COPY server/data ./data
COPY server/results ./results
COPY client /app/client

# Run as the unprivileged user that ships with the node image.
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
