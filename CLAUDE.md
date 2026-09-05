# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build / Run

```bash
make build-web     # Build React frontend (web/dist)
make build         # Build full binary with embedded frontend → bin/talk2db
make dev           # Run with !embed build tag (serve webui/dist from disk)
make test          # go test ./...
make vet           # go vet ./...
```

The `embed` build tag controls whether the React SPA is embedded in the Go binary (`webui/webui_embed.go`) or served from disk (`webui/webui_disk.go`). For frontend development, run `cd web && npm run dev` separately.

## Architecture

**Talk2DB** — AI-powered SQL assistant. Users configure datasources (MySQL/PostgreSQL/Oracle), select tables (table spaces), then chat in sessions where an LLM agent converts natural language questions to SELECT queries and executes them.

### Backend (Go)

```
cmd/talk2db/main.go          — bootstrap: opens DB, creates registry, starts Gin server
internal/
  config/config.go           — env-based config (ADMIN_ADDR, DB_DRIVER, DB_DSN)
  db/db.go                   — GORM Store: auto-migrate models, CRUD for all entities
  models/                    — GORM models (User, Datasource, TableSpace, Session, Message, LLMConfig, SystemConfig)
  admin/                     — Gin HTTP handlers (no auth — single-user mode, everyone is admin)
    admin.go                 — route registration and handler wiring
    auth.go                  — identity helpers only; auth/login removed (getUserID returns a fixed user)
    handler_chat.go          — SSE-based chat: loads agent, streams thinking/message/sql/done events
    handler_datasource.go    — CRUD for datasources
    handler_session.go       — CRUD for sessions
    handler_table_space.go   — table space management + test connection
    handler_llm.go           — LLM provider config CRUD + test endpoint
    handler_system.go        — system config (warn text)
    handler_dashboard.go     — per-datasource dashboard panels CRUD + batch data execution
    handler_users.go         — user management (unused, no auth)
    util.go                  — shared helpers
  datasource/
    registry.go              — connection pool registry; EngineDriver interface for Open/ListTables/DescribeTable
    mysql.go, postgres.go, oracle.go — EngineDriver implementations
  agent/
    agent.go                 — AgentFactory: creates/caches ReAct agents per datasource
    chat_model.go            — OpenAI-compatible ChatModel with request/response logging to stdout
    prompt.go                — BuildSystemPrompt: describes schema to the LLM, enforces SELECT-only rules
    tool_sql.go              — execute_sql tool: runs SELECT queries, returns JSON with columns+rows
```

**Key data flow (chat):** Client sends message → handler loads session+datasource+tableSpaces → `AgentFactory.GetOrCreate()` builds/caches a ReAct agent with `execute_sql` tool → agent generates response (LLM iterates: think → write SQL → execute → interpret results) → response streamed via SSE.

**ReAct agent:** Uses [CloudWeGo Eino](https://github.com/cloudwego/eino) (`react.NewAgent`). The agent has one tool (`execute_sql`) that enforces read-only SELECT. `MaxStep: 10` limits the think/act loop.

### Frontend (React + TypeScript)

```
web/src/
  App.tsx                    — layouts + route definitions: /admin/* (management) and /chat/* (per-datasource chat)
  pages/                     — Dashboard, DatasourceList, DatasourceDetail, SessionList, ChatPage, DashboardView, DashboardConfig, LLMConfig, SystemConfig
  components/                — ui/ (shadcn-style primitives), ToolCallBlock, ToolResultBlock, EChartsBlock, EChart, InlineChatPanel, SqlPlayground
  hooks/                     — useSSE (Server-Sent Events client), use-toast
  api/                       — typed API client functions (client.ts, datasources.ts, llm.ts, sessions.ts)
```

UI uses React Router v7, Tailwind CSS, Radix UI primitives, lucide-react icons.

### URL scheme (no auth)

- **Admin:** `/admin` → dashboard, datasources, sessions, LLM config, system config
- **Chat per datasource:** `/chat/:slug` (legacy links) and `/chat` redirect to `/chat/:slug/dashboard` — the datasource's single page. The dashboard embeds the chat panel (InlineChatPanel, 1/4 width right side, toggleable fullscreen), so there is no separate datasource chat landing page. `/chat/:slug/session/:id` was removed; the admin session chat lives at `/admin/sessions/:id/chat`. The slug is a unique, editable field on the datasource (auto-derived from the name when empty); legacy `/chat/:id` numeric links still resolve. The admin datasource list (card layout) has a per-datasource 仪表盘 link with the panel count.
- **Dashboard:** one per datasource, made of `dashboard_panels` rows (name, SQL, chartType bar/pie/line/text/scatter/bar-stack, theme, sortOrder, refreshInterval seconds). Configured at `/admin/datasources/:id/dashboard` (add/edit/delete/reorder + live query preview + AI 生成面板 wizard); data endpoint `POST /api/datasources/:id/panels/data` executes panel SQLs in parallel (validated SELECT, 1000-row cap per panel for charts). View at `/chat/:slug/dashboard`: cards render progressively (per-panel async fetch), auto-refresh at their own interval (master toggle in the header), per-card exports: raw full CSV via `GET /api/datasources/:id/panels/:pid/export` (no row cap, RFC 5987 filename) and current-view CSV, plus a fullscreen zoom popup (放大). The admin datasource list (card layout) has a per-datasource 仪表盘 link with the panel count.
- Every `/api/*` endpoint is open (no login/session).

### Key dependencies

- **HTTP framework:** Gin (`github.com/gin-gonic/gin`)
- **ORM:** GORM with SQLite (glebarez) and PostgreSQL drivers
- **AI agent framework:** CloudWeGo Eino (`github.com/cloudwego/eino`) — ReAct agent + tool calling
- **Target DB drivers:** go-sql-driver/mysql, lib/pq, go-ora (Oracle)

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ADMIN_ADDR` | `:8080` | Admin server listen address |
| `DB_DRIVER` | `sqlite` | App DB driver (`sqlite` or `pgx`) |
| `DB_DSN` | `var/db/app.sqlite` | App DB connection string |
| `DATABASE_URL` | — | Overrides DB driver to `pgx` and sets DSN |

## Auth

Authentication/authorization was removed — Talk2DB runs as a single-user tool. There is no login; every request is treated as admin, and all `/api/*` endpoints are open. All sessions are attributed to the fixed default user (see `internal/admin/auth.go`).
