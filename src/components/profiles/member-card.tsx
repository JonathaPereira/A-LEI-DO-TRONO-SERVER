'use client';

import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MemberProfile, ProfileMediaKind } from '../../types/profiles';
import { useFileUrl } from '../files/use-files';
import { Avatar } from './avatar';

function clamp(value: number, minimum: number, maximum: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function httpsUrl(value: string, normalize = false) {
  let address = value.trim();
  if (normalize) {
    if (/^http:\/\//i.test(address)) address = address.replace(/^http:/i, 'https:');
    else if (!/^[a-z][a-z\d+.-]*:/i.test(address)) address = 'https://' + address;
  }
  try {
    const url = new URL(address);
    if (url.protocol !== 'https:' || url.username || url.password || /\s/.test(address))
      return null;
    return url;
  } catch {
    return null;
  }
}

/** The files client retains ownership of signed URLs and account epochs. */
function ProfileImage({ fileId, localUrl }: { fileId: string | null; localUrl?: string }) {
  const source = useFileUrl(fileId, !localUrl);
  const [failed, setFailed] = useState<string | null>(null);
  const url = localUrl || source?.url;
  const key = localUrl || (source?.url ? `${source.key}:${source.url}` : null);
  if (!url || !key || failed === key) return null;
  return <img src={url} alt="" loading="lazy" onError={() => setFailed(key)} />;
}

export function MemberCard({
  profile,
  localUrls,
  onCoverPositionChange,
}: {
  profile: MemberProfile;
  localUrls?: Partial<Record<ProfileMediaKind, string>>;
  onCoverPositionChange?: (position: number) => void;
}) {
  const drag = useRef<{ pointer: number; y: number; position: number; height: number } | null>(
    null,
  );
  const data = profile.personalization;
  const style: CSSProperties & Record<`--member-${string}`, string | number> = {
    '--member-accent': /^#[0-9a-f]{6}$/i.test(data.accent) ? data.accent : '#7865ff',
    '--member-darkness': clamp(data.darkness, 0, 90, 60) / 100,
    '--member-blur': `${clamp(data.blur, 0, 20, 0)}px`,
    '--member-opacity': clamp(data.opacity, 40, 100, 90) / 100,
    '--member-cover-position': `${clamp(data.cover_position, 0, 100, 50)}%`,
    '--member-cover-zoom': clamp(data.cover_zoom, 100, 250, 100) / 100,
  };
  const links = data.links.slice(0, 8).flatMap((link) => {
    const url = httpsUrl(link.url);
    return url ? [{ ...link, url: url.href }] : [];
  });
  const credits = Object.entries(data.media_credits).flatMap(([key, item]) => {
    if (!item) return [];
    const url = httpsUrl(item.source, true);
    if (!url || !['commons.wikimedia.org', 'giphy.com'].includes(url.hostname)) return [];
    const labels: Record<string, string> = { avatar: 'Avatar', cover: 'Capa', background: 'Fundo' };
    const label = labels[key] || 'Imagem';
    return [{ key, url: url.href, label, ...item }];
  });
  const created = profile.created_at ? new Date(profile.created_at) : null;
  const since =
    created && Number.isFinite(created.getTime())
      ? created.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : null;

  return (
    <article className="member-card" style={style}>
      <div className="member-background">
        <ProfileImage fileId={data.background_file_id} localUrl={localUrls?.background} />
      </div>
      <div className="member-shade" />
      <div className="member-content">
        <div
          className="member-cover"
          onPointerDown={(event) => {
            if (!onCoverPositionChange) return;
            event.preventDefault();
            drag.current = {
              pointer: event.pointerId,
              y: event.clientY,
              position: data.cover_position,
              height: Math.max(100, event.currentTarget.clientHeight),
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.pointer !== event.pointerId || !onCoverPositionChange) return;
            onCoverPositionChange(
              Math.round(
                clamp(
                  start.position - ((event.clientY - start.y) / start.height) * 100,
                  0,
                  100,
                  50,
                ),
              ),
            );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <ProfileImage fileId={data.cover_file_id} localUrl={localUrls?.cover} />
        </div>
        <Avatar person={profile} className="member-avatar" localUrl={localUrls?.avatar} />
        <h2 className="member-name">{profile.nickname || 'Seu nome'}</h2>
        {data.handle && <p className="member-handle">@{data.handle.replace(/^@/, '')}</p>}
        {(data.status || data.emoji) && (
          <p className="member-status">{[data.emoji, data.status].filter(Boolean).join(' ')}</p>
        )}
        {data.bio && (
          <>
            <h3>Sobre mim</h3>
            <p className="member-bio">{data.bio}</p>
          </>
        )}
        {data.tags.length > 0 && (
          <>
            <h3>Interesses</h3>
            <div className="member-tags">
              {data.tags.slice(0, 12).map((tag, index) => (
                <span key={`${index}:${tag}`}>{tag}</span>
              ))}
            </div>
          </>
        )}
        {data.links.length > 0 && (
          <>
            <h3>Links</h3>
            <div className="member-links">
              {links.map((link, index) => (
                <a
                  key={`${index}:${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </>
        )}
        {credits.length > 0 && (
          <details className="member-media-credits">
            <summary>Créditos das imagens</summary>
            {credits.map((credit) => (
              <a key={credit.key} href={credit.url} target="_blank" rel="noopener noreferrer">
                {credit.label}: {credit.title} · {credit.author} · {credit.license}
              </a>
            ))}
          </details>
        )}
        {since && <small className="member-since">Membro desde {since}</small>}
      </div>
    </article>
  );
}
