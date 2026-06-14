# Single-process image: builds the client, serves it + the authoritative
# Colyseus server from one Node process. Runs the server via tsx (the schema
# @view() decorators don't survive bundling).
FROM node:22-slim

RUN corepack enable
WORKDIR /app

# Install deps first for layer caching.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile

# Build the client.
COPY . .
RUN pnpm build

ENV NODE_ENV=production
ENV PORT=2567
EXPOSE 2567

CMD ["pnpm", "start"]
