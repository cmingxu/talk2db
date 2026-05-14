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
  config/config.go           — env-based config (ADMIN_ADDR, DB_DRIVER, DB_DSN, SESSION_SECRET)
  db/db.go                   — GORM Store: auto-migrate models, CRUD for all entities
  models/                    — GORM models (User, Datasource, TableSpace, Session, Message, LLMConfig, SystemConfig)
  admin/                     — Gin HTTP handlers + cookie-session auth middleware
    admin.go                 — route registration and handler wiring
    auth.go                  — session auth middleware, all /api/* (except /api/login) protected
    handler_chat.go          — SSE-based chat: loads agent, streams thinking/message/sql/done events
    handler_datasource.go    — CRUD for datasources
    handler_session.go       — CRUD for sessions
    handler_table_space.go   — table space management + test connection
    handler_llm.go           — LLM provider config CRUD + test endpoint
    handler_system.go        — system config (warn text)
    handler_users.go         — user management
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
  App.tsx                    — sidebar layout + route definitions
  pages/                     — Dashboard, DatasourceList, DatasourceDetail, SessionList, ChatPage, LLMConfig, SystemConfig, UserManagement, Login
  components/                — PrivateRoute, ChangePasswordModal, DeleteUserModal, ui/ (shadcn-style primitives)
  hooks/                     — useAuth, useSSE (Server-Sent Events client), use-toast
  api/                       — typed API client functions (client.ts, datasources.ts, llm.ts, sessions.ts)
```

UI uses React Router v7, Tailwind CSS, Radix UI primitives, lucide-react icons.

### Key dependencies

- **HTTP framework:** Gin (`github.com/gin-gonic/gin`)
- **ORM:** GORM with SQLite (glebarez) and PostgreSQL drivers
- **AI agent framework:** CloudWeGo Eino (`github.com/cloudwego/eino`) — ReAct agent + tool calling
- **Session store:** gorilla/sessions (cookie-based)
- **Target DB drivers:** go-sql-driver/mysql, lib/pq, go-ora (Oracle)

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `ADMIN_ADDR` | `:8080` | Admin server listen address |
| `DB_DRIVER` | `sqlite` | App DB driver (`sqlite` or `pgx`) |
| `DB_DSN` | `var/db/app.sqlite` | App DB connection string |
| `DATABASE_URL` | — | Overrides DB driver to `pgx` and sets DSN |
| `SESSION_SECRET` | `change-me-to-a-random-secret` | Cookie session encryption key |

## Default login

`admin` / `admin` — created automatically on first startup by `Store.CreateDefaultUser()`.
