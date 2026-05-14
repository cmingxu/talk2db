package datasource

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"talk2db/internal/models"

	_ "github.com/lib/pq"
)

type postgresDriver struct{}

func (d *postgresDriver) Open(ds models.Datasource) (*sql.DB, error) {
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable",
		ds.Username, ds.Password, ds.Host, ds.Port, ds.DatabaseName,
	)
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	return db, nil
}

func (d *postgresDriver) ListTables(db *sql.DB, database string) ([]string, error) {
	rows, err := db.QueryContext(context.Background(),
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		 ORDER BY table_name`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tables := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tables = append(tables, name)
	}
	return tables, rows.Err()
}

func (d *postgresDriver) DescribeTable(db *sql.DB, database, table string) ([]ColumnInfo, error) {
	rows, err := db.QueryContext(context.Background(),
		`SELECT column_name, udt_name, is_nullable,
		        CASE WHEN EXISTS (
		          SELECT 1 FROM information_schema.table_constraints tc
		          JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
		          WHERE tc.table_schema = 'public' AND tc.table_name = $1
		          AND tc.constraint_type = 'PRIMARY KEY' AND kcu.column_name = c.column_name
		        ) THEN 'PRI' ELSE '' END AS pk
		 FROM information_schema.columns c
		 WHERE table_schema = 'public' AND table_name = $1
		 ORDER BY ordinal_position`,
		table,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []ColumnInfo
	for rows.Next() {
		var name, colType, nullable, pk string
		if err := rows.Scan(&name, &colType, &nullable, &pk); err != nil {
			return nil, err
		}
		cols = append(cols, ColumnInfo{
			Name:     name,
			Type:     colType,
			Nullable: strings.EqualFold(nullable, "YES"),
			IsPK:     strings.EqualFold(pk, "PRI"),
		})
	}
	return cols, rows.Err()
}
