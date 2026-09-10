FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV SIMKEEPER_BUILD_TIME=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ARG SIMKEEPER_REVISION=dev
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV SIMKEEPER_DATA_DIR=/app/data
ENV SIMKEEPER_REVISION=${SIMKEEPER_REVISION}
ENV SIMKEEPER_VOXI_CHROMIUM_EXECUTABLE=/usr/bin/chromium
ENV HOME=/app/data/runtime-home
ENV XDG_CACHE_HOME=/app/data/runtime-home/.cache
ENV XDG_CONFIG_HOME=/app/data/runtime-home/.config
ENV TMPDIR=/tmp
ENV PUID=1000
ENV PGID=1000
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu chromium fonts-liberation \
  && rm -rf /var/lib/apt/lists/* \
  && groupmod -n simkeeper node \
  && usermod -l simkeeper -d /app/data/runtime-home node \
  && mkdir -p /app/data/backups /app/data/carrier-browser/voxi /app/data/runtime-home/.cache /app/data/runtime-home/.config /app/data/runtime-home/tmp \
  && chown -R simkeeper:simkeeper /app/data \
  && test "$(id -u simkeeper)" = "1000" \
  && test "$(id -g simkeeper)" = "1000" \
  && test "$(getent passwd simkeeper | cut -d: -f6)" = "/app/data/runtime-home"
COPY --from=builder --chown=simkeeper:simkeeper /app/public ./public
COPY --from=builder --chown=simkeeper:simkeeper /app/.next/standalone ./
COPY --from=builder --chown=simkeeper:simkeeper /app/.next/static ./.next/static
COPY --from=deps --chown=simkeeper:simkeeper /app/node_modules/playwright-core ./node_modules/playwright-core
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && sh -n /usr/local/bin/docker-entrypoint.sh \
  && gosu simkeeper env \
       HOME=/app/data/runtime-home \
       XDG_CACHE_HOME=/app/data/runtime-home/.cache \
       XDG_CONFIG_HOME=/app/data/runtime-home/.config \
       TMPDIR=/tmp \
       node -e "const { chromium } = require('playwright-core'); (async () => { const context = await chromium.launchPersistentContext('/app/data/carrier-browser/voxi/.image-selftest', { executablePath: '/usr/bin/chromium', headless: true, chromiumSandbox: false, args: ['--disable-dev-shm-usage','--no-sandbox','--disable-setuid-sandbox','--no-first-run','--no-default-browser-check'] }); const page = context.pages()[0] || await context.newPage(); await page.goto('data:text/html,<title>SIMKeeper Chromium self-test</title>'); await context.close(); })().catch((error) => { console.error(error); process.exit(1); });" \
  && rm -rf /app/data/carrier-browser/voxi/.image-selftest
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
