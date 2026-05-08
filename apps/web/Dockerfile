FROM oven/bun:1.2-alpine AS builder
WORKDIR /app

# Declared as ARGs so Railway can inject them from the service's env vars
# at build time (VITE_* are baked into the JS bundle by Vite)
ARG VITE_API_URL=http://localhost:3000
ARG VITE_WS_URL=ws://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN bun install --frozen-lockfile --ignore-scripts

# Server source is needed for the TypeScript type imports in the web app
COPY apps/server/src ./apps/server/src
COPY apps/web ./apps/web

RUN cd /app/apps/web && bun run build

FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
