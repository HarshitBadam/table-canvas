# ---- Stage 1: Build ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npx tsc --outDir dist-scripts --module NodeNext --moduleResolution NodeNext \
    --target ES2022 --esModuleInterop --skipLibCheck scripts/seed.ts

# ---- Stage 2: Production runtime ----
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-scripts ./dist/scripts
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/ready || exit 1
CMD ["node", "dist/index.js"]
