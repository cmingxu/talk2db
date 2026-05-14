import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children, ...props }: any) => (
          <pre className="bg-slate-950 text-slate-50 rounded-lg border p-3 text-xs font-mono overflow-x-auto my-3" {...props}>
            {children}
          </pre>
        ),
        code: ({ className, children, ...props }: any) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-muted rounded px-1.5 py-0.5 text-xs font-mono" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className={`text-xs font-mono ${className || ''}`} {...props}>
              {children}
            </code>
          );
        },
        table: ({ children, ...props }: any) => (
          <div className="overflow-x-auto my-3 rounded-lg border">
            <table className="min-w-full border-collapse text-xs" {...props}>{children}</table>
          </div>
        ),
        th: ({ children, ...props }: any) => (
          <th className="border px-3 py-2 bg-muted font-medium text-left whitespace-nowrap" {...props}>{children}</th>
        ),
        td: ({ children, ...props }: any) => (
          <td className="border px-3 py-2 whitespace-nowrap" {...props}>{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
