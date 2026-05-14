import { useState, useMemo } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';

const TRUNCATE_LENGTH = 300;

interface Props {
  text: string;
}

export default function ThinkingBlock({ text }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [truncated, setTruncated] = useState(true);

  const needsTruncation = text.length > TRUNCATE_LENGTH;
  const displayText = useMemo(() => {
    if (!needsTruncation || !truncated) return text;
    return text.slice(0, TRUNCATE_LENGTH) + '...';
  }, [text, needsTruncation, truncated]);

  return (
    <div className="border border-amber-200/60 bg-amber-50/30 rounded-lg overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50/60 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Brain className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Thinking</span>
        <span className="text-amber-400 ml-auto shrink-0">
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-2 pt-0.5">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{displayText}</p>
          {needsTruncation && (
            <button
              onClick={() => setTruncated(!truncated)}
              className="text-xs text-amber-600 hover:text-amber-800 mt-1 font-medium"
            >
              {truncated ? 'Show full reasoning' : 'Show less'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
