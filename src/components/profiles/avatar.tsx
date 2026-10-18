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
}: {
  person: AvatarAppearance;
  className: string;
  title?: string;
  id?: string;
  online?: boolean;
}) {
  const file = avatarFile(person),
    source = useFileUrl(file);
  const [failed, setFailed] = useState<string | null>(null);
  return source?.url && failed !== source.url ? (
    <span id={id} className={className} title={title} aria-label={title} data-online={online}>
      <img
        className="profile-avatar-photo"
        src={source.url}
        alt="Avatar"
        onError={() => setFailed(source.url!)}
      />
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
