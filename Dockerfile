# syntax=docker/dockerfile:1

# ══════════════════════════════════════════════════════════════════
# Stage 1 — build the React frontend (outputs to webui/dist)
# ══════════════════════════════════════════════════════════════════
FROM node:22-alpine AS frontend
WORKDIR /build

# Install deps first so the layer is cached until package files change
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci

# Copy the rest of the frontend source and build.
# Vite is configured with `outDir: '../webui/dist'`, so the SPA lands
# in /build/webui/dist.
COPY web ./web
RUN cd web && npm run build

# ══════════════════════════════════════════════════════════════════
# Stage 2 — build the Go backend (embeds the frontend)
# ══════════════════════════════════════════════════════════════════
FROM golang:1.25-alpine AS backend
WORKDIR /build

# Cache modules
COPY go.mod go.sum ./
RUN go mod download

# Copy Go source
COPY cmd ./cmd
COPY internal ./internal
COPY webui ./webui

# Bring in the compiled SPA so `//go:embed all:dist` finds it
COPY --from=frontend /build/webui/dist ./webui/dist

# Static, fully self-contained binary (CGO off — SQLite driver is pure Go)
RUN CGO_ENABLED=0 GOOS=linux go build \
    -tags embed \
    -ldflags="-s -w" \
    -o /talk2db \
    ./cmd/talk2db

# ══════════════════════════════════════════════════════════════════
# Stage 3 — minimal runtime
# ══════════════════════════════════════════════════════════════════
FROM alpine:3.21

# python3 is required by the bundled skills (chart-designer etc.),
# tzdata for TZ support, ca-certificates for TLS to LLM providers.
RUN apk add --no-cache ca-certificates tzdata python3

WORKDIR /app

COPY --from=backend /talk2db /usr/local/bin/talk2db
COPY skills ./skills

# Persistent data (SQLite DB) + logs live under /app/var
RUN mkdir -p /app/var/db /app/var/log

ENV ADMIN_ADDR=":8080" \
    DB_DRIVER="sqlite" \
    DB_DSN="var/db/app.sqlite" \
    SKILLS_DIR="/app/skills" \
    LOG_FILE="/app/var/log/talk2db.log"

EXPOSE 8080

# Named volume for persistence — see docker-compose.yml
VOLUME ["/app/var"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["talk2db"]
