package admin

import (
	"github.com/gin-gonic/gin"
)

// defaultUserID is the user identity every request is attributed to.
//
// Authentication/authorization has been removed from Talk2DB (single-user
// deployment, no login). All sessions and actions use this fixed identity.
const defaultUserID int64 = 1

// getUserID returns the identity of the current request.
//
// Since authentication is disabled, every request is treated as the same
// default user. The signature keeps a gin.Context so call sites remain
// unchanged if identity ever needs to be re-introduced.
func getUserID(c *gin.Context) int64 {
	return defaultUserID
}
