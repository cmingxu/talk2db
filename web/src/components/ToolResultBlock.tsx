import { useState } from 'react';
import { Table, AlertCircle, ChevronDown } from 'lucide-react';

interface Props {
  columns?: string[];
  rows?: string[][];
  count?: number;
  error?: string;
}

export default function ToolResultBlock({ columns, rows, count, error }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  if (error) {
    return (
      <div className="border border-red-200 bg-red-50/30 rounded-lg p-3">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Error</span>
        </div>
        <p className="text-sm text-red-600 mt-1">{error}</p>
      </div>
    );
  }

  if (!columns || columns.length === 0) {
    return (
      <div className="border border-gray-200 bg-gray-50/50 rounded-lg p-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Table className="h-3.5 w-3.5" />
          <span className="text-xs">Query executed successfully. No rows returned.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b w-full text-left hover:bg-gray-100 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        <Table className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Results</span>
        {count !== undefined && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
            {count} row{count !== 1 ? 's' : ''}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                {columns.map((col, i) => (
                  <th key={i} className="text-left px-3 py-2 font-medium text-muted-foreground border-b whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows?.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-3 py-1.5 border-b border-gray-100 whitespace-nowrap max-w-64 overflow-hidden text-ellipsis ${
                        cell === 'NULL' ? 'text-muted-foreground italic' : ''
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
