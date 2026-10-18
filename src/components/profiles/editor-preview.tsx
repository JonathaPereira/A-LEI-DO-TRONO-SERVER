'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { ProfileEditorSnapshot } from '../../lib/profiles/editor';
import type { MemberProfile } from '../../types/profiles';
import { useFileUrl } from '../files/use-files';
import { MemberCard } from './member-card';

export function ProfileEditorPreview({
  state,
  onCoverPositionChange,
}: {
  state: ProfileEditorSnapshot;
  onCoverPositionChange: (position: number) => void;
}) {
  const source = useFileUrl(state.draft.background_file_id, state.loaded && !state.urls.background);
  const url = state.loaded ? state.urls.background || source?.url : undefined;
  const [failed, setFailed] = useState<string | null>(null);
  const style: CSSProperties & Record<`--member-${string}`, string | number> = {
    '--member-darkness': state.draft.darkness / 100,
    '--member-blur': `${state.draft.blur}px`,
  };
  const profile: MemberProfile = {
    id: state.accountId ?? '',
    nickname: state.nickname,
    avatar_preset: state.avatarPreset,
    avatar_file_id: state.avatarFileId,
    created_at: state.createdAt,
    personalization: state.draft,
  };
  return (
    <aside className="profile-editor-preview">
      <div
        id="profilePreviewScene"
        className="profile-preview-scene"
        data-file={
          state.loaded ? state.urls.background || state.draft.background_file_id || '' : ''
        }
        style={style}
      >
        {url && failed !== url && <img src={url} alt="" onError={() => setFailed(url)} />}
      </div>
      <small>PRÉVIA AO VIVO</small>
      <div id="profileLivePreview">
        {state.loaded && (
          <MemberCard
            profile={profile}
            localUrls={state.urls}
            onCoverPositionChange={state.busy ? undefined : onCoverPositionChange}
          />
        )}
      </div>
    </aside>
  );
}
