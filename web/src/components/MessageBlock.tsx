import Markdown from './Markdown';

interface Props {
  content: string;
}

export default function MessageBlock({ content }: Props) {
  return (
    <div className="max-h-96 overflow-y-auto">
      <div className="text-sm whitespace-pre-wrap leading-relaxed">
        <Markdown content={content} />
      </div>
    </div>
  );
}
