ARG NODE_VERSION=24.14.1
ARG ALPINE_VERSION=3.23

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node-base

RUN apk add --no-cache \
    bash \
    ca-certificates \
    curl \
    git \
    libstdc++

FROM node-base AS build

WORKDIR /workspace

COPY . .

RUN npm ci --ignore-scripts \
    && npm run prepare:generated \
    && npm run build:workspace \
    && npm prune --omit=dev --ignore-scripts

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runtime

ENV NODE_ENV=production
ENV OPENCLAW_HOME=/var/lib/devplat/openclaw

WORKDIR /app

RUN apk add --no-cache ca-certificates libstdc++ \
    && addgroup -S devplat && adduser -S -G devplat devplat \
    && mkdir -p /var/lib/devplat /config \
    && chown -R devplat:devplat /var/lib/devplat /config /app

COPY --from=build /workspace/package.json /workspace/package-lock.json ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages ./packages
COPY docker/openclaw-runtime/entrypoint.sh /usr/local/bin/devplat-openclaw-entrypoint

RUN chmod +x /usr/local/bin/devplat-openclaw-entrypoint \
    && chown -R devplat:devplat /app

USER devplat

EXPOSE 18789

ENTRYPOINT ["devplat-openclaw-entrypoint"]
CMD []
