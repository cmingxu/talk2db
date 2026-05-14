package datasource

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"talk2db/internal/models"

	goora "github.com/sijms/go-ora/v2"
)

type oracleDriver struct{}

func (d *oracleDriver) Open(ds models.Datasource) (*sql.DB, error) {
	return sql.Open("oracle", goora.BuildUrl(ds.Host, ds.Port, ds.DatabaseName, ds.Username, ds.Password, nil))
}

func (d *oracleDriver) ListTables(db *sql.DB, database string) ([]string, error) {
	// database parameter is the schema/owner name in Oracle
	rows, err := db.QueryContext(context.Background(),
		"SELECT table_name FROM all_tables WHERE owner = UPPER(:1) ORDER BY table_name",
		strings.ToUpper(database),
	)
	if err != nil {
		return nil, fmt.Errorf("oracle list tables: %w", err)
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

func (d *oracleDriver) DescribeTable(db *sql.DB, database, table string) ([]ColumnInfo, error) {
	rows, err := db.QueryContext(context.Background(),
		`SELECT atc.COLUMN_NAME, atc.DATA_TYPE, atc.NULLABLE,
		        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PRI' ELSE '' END AS pk
		 FROM all_tab_columns atc
		 LEFT JOIN (
		   SELECT acc.column_name
		   FROM all_cons_columns acc
		   JOIN all_constraints ac ON acc.constraint_name = ac.constraint_name AND acc.owner = ac.owner
		   WHERE ac.owner = UPPER(:1) AND ac.table_name = UPPER(:2) AND ac.constraint_type = 'P'
		 ) pk ON atc.COLUMN_NAME = pk.COLUMN_NAME
		 WHERE atc.owner = UPPER(:1) AND atc.table_name = UPPER(:2)
		 ORDER BY atc.column_id`,
		strings.ToUpper(database), strings.ToUpper(table),
	)
	if err != nil {
		return nil, fmt.Errorf("oracle describe table: %w", err)
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
			Nullable: strings.EqualFold(nullable, "Y"),
			IsPK:     strings.EqualFold(pk, "PRI"),
		})
	}
	return cols, rows.Err()
}
