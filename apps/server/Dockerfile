FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# Copy workspace manifests so bun can resolve the workspace graph
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN bun install --frozen-lockfile

COPY apps/server ./apps/server

EXPOSE 3000

# Run pending migrations then start the server
CMD ["sh", "-c", "cd /app/apps/server && bun run db:migrate && bun run start"]
