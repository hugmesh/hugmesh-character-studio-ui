# VN character-studio — native-federation remote, served as a static bundle.
# Mirrors the org's micro-frontend serving pattern (nginx-unprivileged :8080).
# Built + deployed only when the OPTIONAL character-studio mesh feature is enabled.

# ---- build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
# --base-href is REQUIRED: this UI is served under /character-studio/ behind the fe-gateway.
# Without it Angular emits ROOT-relative asset URLs, so loading /character-studio/ fetches
# /styles-*.css from the gateway root, gets the shell's HTML back, and the
# remote renders BLANK — it only works when opened at the container's own
# address (operator report, 2026-08-14). The generator's .stack-src tree
# carried this as an UNCOMMITTED local edit; committed here so a clean clone
# builds a working image.
RUN npm run build:character-studio -- --base-href=/character-studio/

# ---- serve ----
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/character-studio/browser /usr/share/nginx/html
EXPOSE 8080

#### Runtime THEME injection (the fleet-wide login-ui 50-snap-theme.sh
#### mechanism; see hugmesh-host-shell PR #11 for the full rationale). The hook
#### writes $SNAP_THEME_CSS verbatim at container start; nginx serves it via
#### the exact-match /snap-theme.css alias. /tmp, NOT the docroot: on the
#### nginx-unprivileged images uid 101 cannot write the docroot, and on the
#### root images /tmp is equally correct — ONE stanza for the whole fleet.
#### COPY --chmod, NOT COPY + RUN chmod: unprivileged final stages run as
#### uid 101 and a RUN chmod on root-owned COPY output exits 1 (BuildKit is
#### always on for this stack: Makefile DOCKER_BUILDKIT=1).
COPY --chmod=0755 docker-entrypoint.d/50-snap-theme.sh /docker-entrypoint.d/50-snap-theme.sh
ENV SNAP_THEME_OUT=/tmp/snap-theme.css
