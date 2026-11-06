'use client';

import type { ProfileEditorSnapshot } from '../../lib/profiles/editor';
import type { MemberProfile } from '../../types/profiles';
import { MemberCard } from './member-card';

export function ProfileEditorPreview({
  state,
  onCoverPositionChange,
}: {
  state: ProfileEditorSnapshot;
  onCoverPositionChange: (position: number) => void;
}) {
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
      <small>PRÉVIA DO CARTÃO</small>
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
