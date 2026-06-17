package datasource

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"talk2db/internal/models"
)

type ColumnInfo struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Nullable bool   `json:"nullable"`
	IsPK     bool   `json:"isPk"`
}

type EngineDriver interface {
	Open(ds models.Datasource) (*sql.DB, error)
	ListTables(db *sql.DB, database string) ([]string, error)
	DescribeTable(db *sql.DB, database, table string) ([]ColumnInfo, error)
}

type entry struct {
	db     *sql.DB
	engine string
	closed bool
}

type Registry struct {
	mu      sync.RWMutex
	conns   map[int64]*entry
	drivers map[string]EngineDriver
}

func NewRegistry() *Registry {
	r := &Registry{
		conns:   make(map[int64]*entry),
		drivers: make(map[string]EngineDriver),
	}
	r.drivers["mysql"] = &mysqlDriver{}
	r.drivers["postgres"] = &postgresDriver{}
	r.drivers["oracle"] = &oracleDriver{}
	r.drivers["dameng"] = &damengDriver{}
	return r
}

func (r *Registry) Open(ds models.Datasource) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if e, ok := r.conns[ds.ID]; ok {
		e.db.Close()
	}

	d, ok := r.drivers[ds.Engine]
	if !ok {
		return fmt.Errorf("unsupported engine: %s", ds.Engine)
	}
	db, err := d.Open(ds)
	if err != nil {
		return err
	}
	r.conns[ds.ID] = &entry{db: db, engine: ds.Engine}
	return nil
}

func (r *Registry) Close(datasourceID int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if e, ok := r.conns[datasourceID]; ok {
		e.db.Close()
		e.closed = true
	}
}

func (r *Registry) GetDB(datasourceID int64) (*sql.DB, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.getDBLocked(datasourceID)
}

func (r *Registry) getDBLocked(datasourceID int64) (*sql.DB, error) {
	e, ok := r.conns[datasourceID]
	if !ok || e.closed {
		return nil, fmt.Errorf("datasource %d not connected", datasourceID)
	}
	return e.db, nil
}

func (r *Registry) getDriver(datasourceID int64) (EngineDriver, error) {
	e, ok := r.conns[datasourceID]
	if !ok {
		return nil, fmt.Errorf("datasource %d not found", datasourceID)
	}
	d, ok := r.drivers[e.engine]
	if !ok {
		return nil, fmt.Errorf("driver not found for engine: %s", e.engine)
	}
	return d, nil
}

func (r *Registry) TestConnection(ctx context.Context, ds models.Datasource) ([]string, error) {
	d, ok := r.drivers[ds.Engine]
	if !ok {
		return nil, fmt.Errorf("unsupported engine: %s", ds.Engine)
	}
	db, err := d.Open(ds)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(10 * time.Second)

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, err
	}

	return d.ListTables(db, ds.DatabaseName)
}

func (r *Registry) ListTables(ctx context.Context, datasourceID int64, dbName string) ([]string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	db, err := r.getDBLocked(datasourceID)
	if err != nil {
		return nil, err
	}
	d, err := r.getDriver(datasourceID)
	if err != nil {
		return nil, err
	}
	return d.ListTables(db, dbName)
}

func (r *Registry) DescribeTable(ctx context.Context, datasourceID int64, dbName, table string) ([]ColumnInfo, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	db, err := r.getDBLocked(datasourceID)
	if err != nil {
		return nil, err
	}
	d, err := r.getDriver(datasourceID)
	if err != nil {
		return nil, err
	}
	return d.DescribeTable(db, dbName, table)
}
