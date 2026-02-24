# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ENV DOCKER_BUILD=true

RUN npm run build

# Stage 2: Run
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json .
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=80
ENV HOST=0.0.0.0

# Default runtime env vars (all overridable via docker run -e)
ENV ORIGIN=http://localhost
ENV PUBLIC_APP_MODE=cloud
ENV PUBLIC_API_BASE_URL=https://api.openfilamentdatabase.org
ENV PUBLIC_CACHE_ENABLED=true
ENV GITHUB_UPSTREAM_OWNER=OpenFilamentCollective
ENV GITHUB_UPSTREAM_REPO=open-filament-database

EXPOSE 80

CMD ["node", "-r", "dotenv/config", "build"]
