package config

import (
	"os"
	"strings"
)

type Config struct {
	AdminAddr     string
	DBDriver      string
	DBDSN         string
	SessionSecret string
	DebugSQL      bool
}

func Default() Config {
	return Config{
		AdminAddr: ":8080",
		DBDriver:  "sqlite",
		DBDSN:     "var/db/app.sqlite",
	}
}

func LoadFromEnv() Config {
	cfg := Default()

	if v := os.Getenv("ADMIN_ADDR"); v != "" {
		cfg.AdminAddr = v
	}
	if v := os.Getenv("DB_DRIVER"); v != "" {
		cfg.DBDriver = v
	}
	if v := os.Getenv("DB_DSN"); v != "" {
		cfg.DBDSN = v
	}
	if v := os.Getenv("DATABASE_URL"); v != "" && cfg.DBDSN == "var/db/app.sqlite" {
		cfg.DBDriver = "pgx"
		cfg.DBDSN = v
	}
	if v := os.Getenv("SESSION_SECRET"); v != "" {
		cfg.SessionSecret = v
	}
	if v := os.Getenv("DEBUG_SQL"); v != "" {
		cfg.DebugSQL = strings.EqualFold(v, "1") || strings.EqualFold(v, "true") || strings.EqualFold(v, "on")
	}

	return cfg
}
