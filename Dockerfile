# Self-hosted HermitPDF image.
#
# Build:  docker build -t hermitpdf .
# Run:    docker run -p 3000:3000 hermitpdf
#
# The image is the self-hosted distribution: it builds with
# HERMITPDF_SELF_HOSTED=1, which trims the marketing hero from the home page
# (the header logo suffices for people running their own instance). Build
# with --build-arg SELF_HOSTED=0 to keep the full home page.

FROM node:24-alpine AS builder
WORKDIR /app

# Install dependencies first so they cache independently of source changes.
# The mupdf postinstall step copies mupdf-wasm.wasm into public/, so public/
# must exist before `npm ci` runs.
COPY package.json package-lock.json ./
COPY public ./public
RUN npm ci

COPY . .

ARG SELF_HOSTED=1
# Baked in at build time — the home page is statically prerendered.
ENV HERMITPDF_SELF_HOSTED=${SELF_HOSTED}
ENV NEXT_OUTPUT_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# The standalone output contains the server and the traced subset of
# node_modules; static assets and public/ are served by the same server but
# aren't included automatically.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
