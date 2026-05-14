package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"talk2db/internal/admin"
	"talk2db/internal/agent"
	"talk2db/internal/config"
	"talk2db/internal/datasource"
	"talk2db/internal/logger"
	"github.com/gin-gonic/gin"

	"talk2db/internal/db"
)

func main() {
	if mode := os.Getenv("GIN_MODE"); mode != "" {
		gin.SetMode(mode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}
	cfg := config.LoadFromEnv()

	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	adminAddr := fs.String("admin-addr", cfg.AdminAddr, "admin listen address")
	dbDriver := fs.String("db-driver", cfg.DBDriver, "db driver (sqlite or pgx)")
	dbDSN := fs.String("db-dsn", cfg.DBDSN, "db dsn/connection string")
	fs.Parse(os.Args[1:])

	if err := logger.Init(""); err != nil {
		log.Printf("logger: %v (falling back to stdout)", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var store *db.Store
	if strings.TrimSpace(*dbDriver) != "" && strings.ToLower(strings.TrimSpace(*dbDriver)) != "none" {
		s, err := db.Open(ctx, db.OpenConfig{Driver: *dbDriver, DSN: *dbDSN, DebugSQL: cfg.DebugSQL})
		if err != nil {
			log.Fatalf("db open: %v", err)
		}
		store = s
		defer store.Close()

		if err := store.CreateDefaultUser(ctx); err != nil {
			log.Fatalf("create default user: %v", err)
		}
	}

	registry := datasource.NewRegistry()
	agentFactory := agent.NewAgentFactory(store, registry)

	secret := cfg.SessionSecret
	if secret == "" {
		secret = "change-me-to-a-random-secret"
	}

	adminHandler := admin.New(admin.Config{
		DB:            store,
		Registry:      registry,
		AgentFactory:  agentFactory,
		SessionSecret: secret,
	})

	adminSrv := &http.Server{
		Addr:              *adminAddr,
		Handler:           adminHandler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	printBanner(*adminAddr, *dbDriver, *dbDSN)
	logger.Info("startup", "server starting", map[string]any{
		"admin_addr": *adminAddr,
		"db_driver":  *dbDriver,
		"db_dsn":     *dbDSN,
	})

	errCh := make(chan error, 1)
	go func() { errCh <- adminSrv.ListenAndServe() }()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-sigCh:
		log.Printf("signal: %s", sig)
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("server error: %v", err)
		}
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	logger.Info("shutdown", "server shutting down", nil)
	_ = adminSrv.Shutdown(shutdownCtx)
}

func printBanner(addr, dbDriver, dbDSN string) {
	width := 56
	pad := func(s string, w int) string {
		if len(s) >= w {
			return s
		}
		return s + strings.Repeat(" ", w-len(s))
	}
	line := strings.Repeat("─", width)

	fmt.Fprintf(os.Stdout, "\n")
	fmt.Fprintf(os.Stdout, "  \033[1;36m%s\033[0m\n", line)
	fmt.Fprintf(os.Stdout, "  \033[1;36m│\033[0m  \033[1;37mTalk2DB\033[0m — AI-Powered SQL Assistant%s\033[1;36m│\033[0m\n",
		strings.Repeat(" ", width-40))
	fmt.Fprintf(os.Stdout, "  \033[1;36m%s\033[0m\n", line)
	fmt.Fprintf(os.Stdout, "  \033[1;36m│\033[0m  %s\033[1;36m│\033[0m\n", pad(fmt.Sprintf("Listen:    http://%s", addr), width))
	fmt.Fprintf(os.Stdout, "  \033[1;36m│\033[0m  %s\033[1;36m│\033[0m\n", pad(fmt.Sprintf("App DB:    %s → %s", dbDriver, dbDSN), width))
	fmt.Fprintf(os.Stdout, "  \033[1;36m│\033[0m  %s\033[1;36m│\033[0m\n", pad("Login:     admin / admin", width))
	fmt.Fprintf(os.Stdout, "  \033[1;36m│\033[0m  %s\033[1;36m│\033[0m\n", pad("Requires:  Configure LLM provider before chat", width))
	fmt.Fprintf(os.Stdout, "  \033[1;36m%s\033[0m\n", line)
	fmt.Fprintf(os.Stdout, "\n")
}

