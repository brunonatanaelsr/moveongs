interface FeedPostProps {
  authorName: string;
  authorAvatar?: string;
  createdAt: string;
  content: string;
  projectTag?: string;
}

export function FeedPost({ authorName, authorAvatar, createdAt, content, projectTag }: FeedPostProps) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-black/20 backdrop-blur-3xl transition hover:border-white/20">
      <header className="flex items-start gap-3">
        <div className="h-12 w-12 overflow-hidden rounded-2xl border border-white/20 bg-white/10">
          {authorAvatar ? (
            <img src={authorAvatar} alt={authorName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-white/60">
              {authorName.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white">{authorName}</span>
            {projectTag && (
              <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-200/80">{projectTag}</span>
            )}
            <time className="text-xs text-white/60" dateTime={createdAt}>
              {new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(createdAt))}
            </time>
          </div>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/80">{content}</p>
        </div>
      </header>
    </article>
  );
}
