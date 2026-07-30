# VN character-studio — native-federation remote, served as a static bundle.
# Mirrors the org's micro-frontend serving pattern (nginx-unprivileged :8080).
# Built + deployed only when the OPTIONAL character-studio mesh feature is enabled.

# ---- build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:character-studio

# ---- serve ----
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/character-studio/browser /usr/share/nginx/html
EXPOSE 8080
