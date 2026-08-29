package admin

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"talk2db/internal/models"
)

func parseID(s string) (int64, error) {
	return strconv.ParseInt(s, 10, 64)
}

// getRole returns the role of the current request.
//
// Authentication has been removed: every request is treated as an admin so
// all management features are available without a login.
func getRole(c *gin.Context) string {
	return models.RoleAdmin
}

// requireAdmin is kept for route compatibility. With authentication removed
// every request is treated as admin, so it simply passes through.
func requireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) { c.Next() }
}
