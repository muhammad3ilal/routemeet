# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# This browser key is public in the built JavaScript. Never pass the server key here.
ARG VITE_MAPTILER_KEY
ENV VITE_MAPTILER_KEY=${VITE_MAPTILER_KEY}
RUN test -n "$VITE_MAPTILER_KEY" && npm run build

FROM node:24-bookworm-slim AS backend-dependencies
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    DATABASE_PATH=/data/routemeet.sqlite
WORKDIR /app
COPY --from=backend-dependencies --chown=node:node /build/backend/node_modules ./backend/node_modules
COPY --chown=node:node backend/package.json backend/*.js ./backend/
COPY --chown=node:node backend/algorithms/ ./backend/algorithms/
COPY --chown=node:node backend/providers/ ./backend/providers/
COPY --chown=node:node backend/storage/ ./backend/storage/
COPY --from=frontend-build --chown=node:node /build/frontend/dist ./frontend/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 4000
CMD ["node", "backend/server.js"]
