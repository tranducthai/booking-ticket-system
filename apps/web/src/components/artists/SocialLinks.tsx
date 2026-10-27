/** An artist's social links, one per line with its icon — shared by the public artist page and the admin approval list. */
const SOCIAL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  spotify: "Spotify",
  tiktok: "TikTok",
};

const SOCIAL_ICON_PATHS: Record<string, string> = {
  facebook: "M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z",
  instagram: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM17.5 6.5h.01",
  youtube: "M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7zM10 9v6l5-3-5-3z",
  spotify: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM7 9.5c3-1 7-.8 10 1M7.5 12.5c2.5-.7 5.5-.5 8 .8M8 15.5c2-.5 4-.3 6 .6",
  tiktok: "M15 3v11a4 4 0 1 1-4-4M15 3c0 3 2 5 5 5",
};

function SocialIcon({ name }: { name: string }) {
  const d = SOCIAL_ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** `showUrl` prints the link itself instead of the network name — for the admin, who has to check where it goes. */
export function SocialLinks({ links, className = "", showUrl = false }: { links: Record<string, string> | null | undefined; className?: string; showUrl?: boolean }) {
  const entries = Object.entries(links ?? {}).filter(([, url]) => url);
  if (entries.length === 0) return null;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {entries.map(([key, url]) => (
        <a key={key} href={url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-brand-600 hover:underline" title={SOCIAL_LABELS[key] ?? key}>
          <SocialIcon name={key} />
          <span className={showUrl ? "truncate" : ""}>{showUrl ? url : (SOCIAL_LABELS[key] ?? key)}</span>
        </a>
      ))}
    </div>
  );
}
