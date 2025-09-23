import type { ReactNode } from 'react';
import { PermissionGuard } from './PermissionGuard';

interface ProfileCardProps {
  avatarUrl?: string;
  displayName: string;
  email: string;
  bio?: string;
  pronouns?: string;
  location?: string;
  links?: Array<{ label: string; url: string }>;
  actions?: ReactNode;
  canEdit?: string | string[];
}

export function ProfileCard({
  avatarUrl,
  displayName,
  email,
  bio,
  pronouns,
  location,
  links = [],
  actions,
  canEdit = 'profiles:update',
}: ProfileCardProps) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-lg shadow-black/20 backdrop-blur-3xl">
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-3xl border border-white/20 bg-white/10">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white/60">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-white">{displayName}</h2>
            <p className="text-sm text-white/70">{email}</p>
            {pronouns && <p className="mt-1 text-xs uppercase tracking-wide text-white/50">{pronouns}</p>}
            {location && <p className="mt-1 text-xs text-white/60">📍 {location}</p>}
          </div>
        </div>

        <div className="flex-1 space-y-4 text-sm text-white/80">
          {bio && <p className="leading-relaxed text-white/80">{bio}</p>}
          {links.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {links.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 transition hover:border-white/40 hover:text-white"
                  >
                    🔗 {link.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {actions && (
          <PermissionGuard require={canEdit}>
            <div className="flex flex-col items-stretch gap-2 md:min-w-[8rem]">{actions}</div>
          </PermissionGuard>
        )}
      </div>
    </article>
  );
}
