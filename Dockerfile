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
