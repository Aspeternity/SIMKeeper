FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV SIMKEEPER_DATA_DIR=/app/data
ENV PUID=1000
ENV PGID=1000
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 simkeeper \
  && useradd --system --uid 1001 --gid simkeeper simkeeper \
  && mkdir -p /app/data/backups
COPY --from=builder --chown=simkeeper:simkeeper /app/public ./public
COPY --from=builder --chown=simkeeper:simkeeper /app/.next/standalone ./
COPY --from=builder --chown=simkeeper:simkeeper /app/.next/static ./.next/static
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
