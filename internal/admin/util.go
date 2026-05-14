package admin

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"talk2db/internal/models"
)

func parseID(s string) (int64, error) {
	return strconv.ParseInt(s, 10, 64)
}

func getRole(c *gin.Context) string {
	if role, exists := c.Get("role"); exists {
		if s, ok := role.(string); ok {
			return s
		}
	}
	return models.RoleNormal
}

func requireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		if getRole(c) != models.RoleAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "admin only"})
			c.Abort()
			return
		}
		c.Next()
	}
}
