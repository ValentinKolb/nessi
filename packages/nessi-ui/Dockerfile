# syntax=docker/dockerfile:1.7

FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY packages/nessi-ai/package.json packages/nessi-ai/package.json
COPY packages/nessi-core/package.json packages/nessi-core/package.json
COPY packages/nessi-ui/package.json packages/nessi-ui/package.json

RUN bun install --frozen-lockfile

FROM deps AS build

COPY packages/nessi-ai packages/nessi-ai
COPY packages/nessi-core packages/nessi-core
COPY packages/nessi-ui packages/nessi-ui

RUN bun run --filter nessi-ui build

FROM nginx:1.27-alpine AS runtime

COPY packages/nessi-ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/nessi-ui/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
