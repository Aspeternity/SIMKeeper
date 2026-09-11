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
ENV SIMKEEPER_VOXI_CHROMIUM_EXECUTABLE=/usr/local/bin/simkeeper-chromium
ENV SIMKEEPER_REAL_CHROMIUM_EXECUTABLE=/usr/bin/chromium
ENV SIMKEEPER_VOXI_BROWSER_MODE=headful-xvfb
ENV HOME=/app/data/runtime-home
ENV XDG_CACHE_HOME=/app/data/runtime-home/.cache
ENV XDG_CONFIG_HOME=/app/data/runtime-home/.config
ENV TMPDIR=/tmp
ENV PUID=1000
ENV PGID=1000
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu chromium fonts-liberation fonts-noto-color-emoji xvfb xauth \
  && rm -rf /var/lib/apt/lists/* \
  && groupmod -n simkeeper node \
  && usermod -l simkeeper -d /app/data/runtime-home node \
  && mkdir -p /app/data/backups /app/data/carrier-browser/voxi /app/data/runtime-home/.cache /app/data/runtime-home/.config /app/data/runtime-home/tmp /tmp/.X11-unix \
  && chmod 1777 /tmp /tmp/.X11-unix \
  && chown -R simkeeper:simkeeper /app/data \
  && test "$(id -u simkeeper)" = "1000" \
  && test "$(id -g simkeeper)" = "1000" \
  && test "$(getent passwd simkeeper | cut -d: -f6)" = "/app/data/runtime-home"
COPY --from=builder --chown=simkeeper:simkeeper /app/public ./public
COPY --from=builder --chown=simkeeper:simkeeper /app/.next/standalone ./
COPY --from=builder --chown=simkeeper:simkeeper /app/.next/static ./.next/static
COPY --from=deps --chown=simkeeper:simkeeper /app/node_modules/playwright-core ./node_modules/playwright-core
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY simkeeper-chromium.sh /usr/local/bin/simkeeper-chromium
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/simkeeper-chromium \
  && sh -n /usr/local/bin/docker-entrypoint.sh \
  && bash -n /usr/local/bin/simkeeper-chromium \
  && gosu simkeeper env \
       HOME=/app/data/runtime-home \
       XDG_CACHE_HOME=/app/data/runtime-home/.cache \
       XDG_CONFIG_HOME=/app/data/runtime-home/.config \
       TMPDIR=/tmp \
       xvfb-run -a -s "-screen 0 1365x900x24 -nolisten tcp -nolock" \
       node -e "const { chromium } = require('playwright-core'); (async () => { const context = await chromium.launchPersistentContext('/app/data/carrier-browser/voxi/.image-selftest', { executablePath: '/usr/local/bin/simkeeper-chromium', headless: true, chromiumSandbox: false, args: ['--disable-dev-shm-usage','--no-sandbox','--disable-setuid-sandbox','--no-first-run','--no-default-browser-check'] }); const page = context.pages()[0] || await context.newPage(); await page.goto('data:text/html,<title>SIMKeeper Chromium self-test</title>'); const ua = await page.evaluate(() => navigator.userAgent); if (/HeadlessChrome/i.test(ua)) throw new Error('VOXI Chromium self-test still exposes a headless user agent'); await context.close(); })().catch((error) => { console.error(error); process.exit(1); });" \
  && rm -rf /app/data/carrier-browser/voxi/.image-selftest \
  && rm -f /tmp/.X*-lock /tmp/.X11-unix/X*
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
