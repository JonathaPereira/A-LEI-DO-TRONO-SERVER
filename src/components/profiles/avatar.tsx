'use client';

import type { AvatarAppearance } from '../../types/domain';
import { avatarFile } from '../../lib/profiles/avatar';
import { avatarIcon } from '../../lib/profiles/icons';
import { useFileUrl } from '../files/use-files';
import { useState } from 'react';

export function Avatar({
  person,
  className,
  title,
  id,
  online,
  localUrl,
}: {
  person: AvatarAppearance;
  className: string;
  title?: string;
  id?: string;
  online?: boolean;
  localUrl?: string;
}) {
  const file = avatarFile(person),
    source = useFileUrl(file, !localUrl);
  const url = localUrl || source?.url;
  const [failed, setFailed] = useState<string | null>(null);
  return url && failed !== url ? (
    <span id={id} className={className} title={title} aria-label={title} data-online={online}>
      <img className="profile-avatar-photo" src={url} alt="Avatar" onError={() => setFailed(url)} />
    </span>
  ) : (
    <span
      id={id}
      className={className}
      title={title}
      aria-label={title}
      data-online={online}
      dangerouslySetInnerHTML={{ __html: avatarIcon(person.avatar_preset) }}
    />
  );
}
