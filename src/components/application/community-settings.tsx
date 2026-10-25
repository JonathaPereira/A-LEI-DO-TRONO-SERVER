'use client';
import { useModel, type ApplicationServices } from './services';
import { AppIcon as Icon } from './icons';
import {
  ChannelManagerContents,
  RoleEditorContents,
  ChannelFilesContents,
} from '../modals/community-management-contents';
import styles from './profile-settings.module.css';
import shell from './shell.module.css';
export function CommunityActions({ runtime }: { runtime: ApplicationServices }) {
  const state = useModel(runtime.TronoChannelManagement);
  if (!state.canManageChannels) return null;
  return (
    <button
      id="createChannelBtn"
      className={shell.friendsButton}
      type="button"
      onClick={() => void runtime.TronoChannelManagement.openManager()}
    >
      <Icon name="settings" size={16} /> Gerenciar canais
    </button>
  );
}
export function ChannelFilesAction({ runtime }: { runtime: ApplicationServices }) {
  const room = useModel(runtime.TronoChatMessages),
    dm = useModel(runtime.TronoDirectMessages);
  return (
    <button
      type="button"
      title="Arquivos do canal"
      className={shell.iconButton}
      aria-label="Arquivos do canal"
      disabled={!room.roomId || dm.open}
      onClick={() => void runtime.TronoChannelFiles.open()}
    >
      <Icon name="attach" size={18} />
    </button>
  );
}
export function CommunityDialogs({ runtime }: { runtime: ApplicationServices }) {
  return (
    <div className={styles.surface}>
      <dialog closedby="any" id="channelManagerDialog" aria-labelledby="channelManagerTitle">
        <ChannelManagerContents controller={runtime.TronoChannelManagement} />
      </dialog>
      <dialog closedby="any" id="roleDialog" aria-labelledby="roleTitle">
        <RoleEditorContents controller={runtime.TronoChannelManagement} />
      </dialog>
      <dialog closedby="any" id="channelFilesDialog" aria-labelledby="channelFilesTitle">
        <ChannelFilesContents controller={runtime.TronoChannelFiles} />
      </dialog>
    </div>
  );
}
