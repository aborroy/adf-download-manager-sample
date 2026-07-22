# Self-contained build of the ACA SPA (with the adf-download-manager extension
# compiled inline) served by nginx. Build context is the repo ROOT, so the
# whole `aca/` Nx workspace is available and no host-side `nx build` is needed.
#
#   docker compose up --build      # builds this end-to-end, no prior steps
#
# Stage 1 installs deps + builds dist/content-ce; stage 2 is the nginx runtime,
# mirroring aca/Dockerfile (minus the cosmetic license-disclaimer copy).

# ── Stage 1: build the Angular bundle ─────────────────────────────────────────
# Full (non-slim) node image: it carries python3/make/g++ for any node-gyp deps.
FROM node:24 AS build
WORKDIR /usr/src/aca

# Install deps first for layer caching. ACA has a marked/ngx-markdown peer-dep
# clash, so --legacy-peer-deps is required (plain npm install fails).
COPY aca/package.json aca/package-lock.json ./
RUN npm install --legacy-peer-deps

# Copy the workspace source (host node_modules/dist are excluded by .dockerignore)
# and build content-ce. The default build inlines the library via the
# @alfresco/adf-download-manager tsconfig path mapping + preserveSymlinks.
COPY aca/ ./
RUN npx nx build content-ce

# ── Stage 2: nginx runtime ────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1-alpine

USER root
RUN apk update && apk upgrade
USER 101

COPY aca/docker/default.conf.template /etc/nginx/templates/
COPY aca/docker/docker-entrypoint.d/* /docker-entrypoint.d/

COPY --from=build /usr/src/aca/dist/content-ce /usr/share/nginx/html/
COPY --from=build /usr/src/aca/dist/content-ce/app.config.json /etc/nginx/templates/app.config.json.template
COPY --from=build /usr/src/aca/dist/content-ce/assets/app.extensions.json /etc/nginx/templates/app.extensions.json.template

USER root
RUN chmod a+w -R /etc/nginx/conf.d
USER 101

ENV BASE_PATH=/
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d
