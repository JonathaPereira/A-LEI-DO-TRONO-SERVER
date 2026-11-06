'use client';

import { useState, type CSSProperties } from 'react';
import { useFileUrl } from '../files/use-files';
import { useProfileDecoration } from './use-decoration';

function DecorationImage({
  fileId,
  position,
  zoom,
}: {
  fileId: string | null;
  position?: number;
  zoom?: number;
}) {
  const source = useFileUrl(fileId);
  const [failed, setFailed] = useState<string | null>(null);
  const key = source?.url ? `${source.key}:${source.url}` : null;
  if (!source?.url || !key || failed === key) return null;
  return (
    <img
      src={source.url}
      alt=""
      loading="lazy"
      style={{
        objectPosition: `center ${position ?? 50}%`,
        transform: `scale(${(zoom ?? 100) / 100})`,
      }}
      onError={() => setFailed(key)}
    />
  );
}
export function ParticipantBackground({ accountId }: { accountId: string | null | undefined }) {
  const data = useProfileDecoration(accountId)?.personalization;
  const style: CSSProperties & Record<`--participant-${string}`, string> = {
    '--participant-darkness': String((data?.darkness ?? 60) / 100),
    '--participant-blur': `${data?.blur ?? 0}px`,
  };
  return (
    <div
      className="participant-background"
      data-profile-background-slot=""
      aria-hidden="true"
      style={style}
    >
      <DecorationImage fileId={data?.background_file_id ?? null} />
    </div>
  );
}
export function DirectProfileBanner({ accountId }: { accountId: string }) {
  const data = useProfileDecoration(accountId)?.personalization;
  return (
    <span data-direct-banner-slot="" className="direct-profile-banner" aria-hidden="true">
      <DecorationImage
        fileId={data?.cover_file_id ?? null}
        position={data?.cover_position ?? 50}
        zoom={data?.cover_zoom ?? 100}
      />
    </span>
  );
}
