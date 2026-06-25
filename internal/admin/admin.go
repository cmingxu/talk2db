package admin

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/sessions"

	"talk2db/internal/agent"
	"talk2db/internal/datasource"
	"talk2db/internal/db"
	"talk2db/internal/models"
	"talk2db/internal/skill"
	"talk2db/webui"
)

type Config struct {
	DB            *db.Store
	Registry      *datasource.Registry
	AgentFactory  *agent.AgentFactory
	SessionSecret string
	SkillsDir     string // skill 包目录路径，为空则默认 "skills"
}

func New(cfg Config) http.Handler {
	sessionStore := sessions.NewCookieStore([]byte(cfg.SessionSecret))

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(authMiddleware(sessionStore))

	// ── Auth ────────────────────────────────────────────────
	r.POST("/api/login", func(c *gin.Context) {
		var req struct {
			Nickname string `json:"nickname"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		user, err := cfg.DB.GetUserByNickname(c.Request.Context(), req.Nickname)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}

		if user.Password != req.Password {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}

		session, _ := sessionStore.Get(c.Request, "session-name")
		session.Values["authenticated"] = true
		session.Values["userID"] = user.ID
		session.Values["role"] = user.Role
		secure := isSecureRequest(c.Request)
		session.Options = &sessions.Options{
			Path:     "/",
			MaxAge:   86400 * 30,
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteLaxMode,
		}
		if err := session.Save(c.Request, c.Writer); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save session"})
			return
		}

		log.Printf("[Auth] User '%s' logged in successfully from %s", user.Nickname, c.ClientIP())
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	r.POST("/api/logout", func(c *gin.Context) {
		session, _ := sessionStore.Get(c.Request, "session-name")
		session.Values["authenticated"] = false
		secure := isSecureRequest(c.Request)
		session.Options = &sessions.Options{
			Path:     "/",
			MaxAge:   -1,
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteLaxMode,
		}
		if err := session.Save(c.Request, c.Writer); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save session"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	api := r.Group("/api")

	// ── Me ──────────────────────────────────────────────────
	api.GET("/me", func(c *gin.Context) {
		uid := getUserID(c, sessionStore)
		role := getRole(c)
		c.JSON(http.StatusOK, gin.H{"userID": uid, "role": role})
	})

	// ── Health ──────────────────────────────────────────────
	r.GET("/api/health", func(c *gin.Context) {
		status := gin.H{
			"ok":   true,
			"time": time.Now().UTC().Format(time.RFC3339Nano),
		}
		if cfg.DB != nil {
			if err := cfg.DB.Ping(c.Request.Context()); err != nil {
				status["db_ok"] = false
				status["db_error"] = err.Error()
				c.JSON(http.StatusServiceUnavailable, status)
				return
			}
			status["db_ok"] = true
		} else {
			status["db_ok"] = nil
		}
		c.JSON(http.StatusOK, status)
	})

	// ── Dashboard ───────────────────────────────────────────
	api.GET("/dashboard", requireAdmin(), func(c *gin.Context) {
		var userCount, dsCount, sessionCount int64
		if cfg.DB != nil {
			users, _ := cfg.DB.ListUsers(c.Request.Context())
			userCount = int64(len(users))
			datasources, _ := cfg.DB.ListDatasources(c.Request.Context())
			dsCount = int64(len(datasources))
			sessions, _ := cfg.DB.ListSessionsByUser(c.Request.Context(), 0, nil)
			sessionCount = int64(len(sessions))
		}
		c.JSON(http.StatusOK, gin.H{
			"user_count":       userCount,
			"datasource_count": dsCount,
			"session_count":    sessionCount,
			"time":             time.Now().UTC().Format(time.RFC3339Nano),
		})
	})

	// ── Users ───────────────────────────────────────────────
	uh := &userHandler{store: cfg.DB, sessionStore: sessionStore}
	userGroup := api.Group("/users", requireAdmin())
	userGroup.GET("", uh.list)
	userGroup.POST("", uh.create)
	userGroup.PUT("/:id/password", uh.updatePassword)
	userGroup.DELETE("/:id", uh.delete)
	userGroup.GET("/:id/datasources", uh.listDatasources)
	userGroup.PUT("/:id/datasources", uh.setDatasources)

	// ── System Config ───────────────────────────────────────
	sh := &systemHandler{store: cfg.DB}
	api.GET("/system-config", sh.get)
	api.PUT("/system-config", requireAdmin(), sh.update)

	// ── Datasources ─────────────────────────────────────────
	dh := &datasourceHandler{store: cfg.DB}
	api.GET("/datasources", dh.list)
	api.POST("/datasources", requireAdmin(), dh.create)
	api.GET("/datasources/:id", dh.get)
	api.PUT("/datasources/:id", requireAdmin(), dh.update)
	api.DELETE("/datasources/:id", requireAdmin(), dh.delete)

	// ── Table Spaces ────────────────────────────────────────
	tsh := &tableSpaceHandler{store: cfg.DB, registry: cfg.Registry}
	tableGroup := api.Group("/datasources/:id", requireAdmin())
	tableGroup.GET("/tables", tsh.listTables)
	tableGroup.POST("/test", tsh.testConnection)
	tableGroup.GET("/tablespaces", tsh.list)
	tableGroup.POST("/tablespaces", tsh.add)
	tableGroup.DELETE("/tablespaces/:tsid", tsh.remove)
	tableGroup.POST("/execute", tsh.executeSql)

	// ── Sessions ────────────────────────────────────────────
	sessH := &sessionHandler{store: cfg.DB, sessionStore: sessionStore}
	api.GET("/sessions", sessH.list)
	api.POST("/sessions", sessH.create)
	api.GET("/sessions/recent", sessH.recent)
	api.GET("/sessions/:id", sessH.get)
	api.PUT("/sessions/:id", sessH.update)
	api.DELETE("/sessions/:id", sessH.delete)

	// ── LLM Config ──────────────────────────────────────────
	lh := &llmHandler{store: cfg.DB, agentFactory: cfg.AgentFactory}
	api.GET("/llm-config", lh.get)
	api.PUT("/llm-config", requireAdmin(), lh.update)
	api.POST("/llm-config/test", requireAdmin(), func(c *gin.Context) {
		if cfg.AgentFactory == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "agent factory not configured"})
			return
		}
		if err := cfg.AgentFactory.TestLLMConnection(c.Request.Context()); err != nil {
			c.JSON(http.StatusOK, gin.H{"ok": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	// ── Skills ─────────────────────────────────────────────────
	skillsDir := cfg.SkillsDir
	if skillsDir == "" {
		skillsDir = "skills"
	}
	skillReg := skill.NewRegistry()
	skillRunner := skill.NewRunner(skillsDir)

	loader := &skill.Loader{}
	loadedSkills, err := loader.LoadAll(skillsDir)
	if err != nil {
		log.Printf("[Skills] Failed to load skills from %s: %v", skillsDir, err)
	} else if len(loadedSkills) > 0 {
		if err := skillReg.Register(loadedSkills); err != nil {
			log.Printf("[Skills] Failed to register skills: %v", err)
		} else {
			log.Printf("[Skills] Loaded %d skills with %d tools from %s", len(loadedSkills), len(skillReg.AllToolNames()), skillsDir)
		}
	}

	// ── Chat ────────────────────────────────────────────────
	ch := &chatHandler{
		store:         cfg.DB,
		registry:      cfg.Registry,
		agentFactory:  cfg.AgentFactory,
		sessionStore:  sessionStore,
		memoryStore:   agent.GetMemoryStore(),
		skillRegistry: skillReg,
		skillRunner:   skillRunner,
	}
	api.GET("/sessions/:id/messages", ch.messages)
	api.POST("/sessions/:id/chat", ch.chat)

	// ── Normal User Chat Session ─────────────────────────────
	api.POST("/normal/chat-session", func(c *gin.Context) {
		userID := getUserID(c, sessionStore)
		role := getRole(c)
		if role != models.RoleNormal {
			c.JSON(http.StatusForbidden, gin.H{"error": "normal users only"})
			return
		}

		var req struct {
			DatasourceID int64 `json:"datasourceId"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		assigned, err := cfg.DB.GetUserDatasourceIDs(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		found := false
		for _, id := range assigned {
			if id == req.DatasourceID {
				found = true
				break
			}
		}
		if !found {
			c.JSON(http.StatusForbidden, gin.H{"error": "datasource not assigned"})
			return
		}

		ds, err := cfg.DB.GetDatasource(c.Request.Context(), req.DatasourceID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		session, err := cfg.DB.CreateSession(c.Request.Context(), models.Session{
			Name:         ds.Name + " 聊天",
			DatasourceID: req.DatasourceID,
			UserID:       userID,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"sessionId": session.ID, "sessionName": session.Name})
	})

	webui.Register(r)

	return r
}
