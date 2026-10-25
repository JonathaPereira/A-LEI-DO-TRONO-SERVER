import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import type { ChannelManagement } from '../../lib/channels/management';
import type { ChannelFiles } from '../../lib/channels/files';
import { AppIcon as Icon } from '../application/icons';
import { AttachmentContent } from '../files/attachment';

/** Native modality stays on the stable host; close/cancel always invalidate the owning model. */
function useDialog(id: string, open: boolean, close: () => void) {
  useLayoutEffect(() => {
    const dialog = document.getElementById(id) as HTMLDialogElement;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [id, open]);
  useEffect(() => {
    const dialog = document.getElementById(id) as HTMLDialogElement;
    const cancel = (event: Event) => {
      event.preventDefault();
      close();
    };
    const closed = () => {
      if (!dialog.open) close();
    };
    dialog.addEventListener('cancel', cancel);
    dialog.addEventListener('close', closed);
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.removeEventListener('close', closed);
    };
  }, [id, close]);
}

export function ChannelManagerContents({ controller }: { controller: ChannelManagement }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const editor = state.manager,
    draft = editor.draft;
  useDialog('channelManagerDialog', editor.open, controller.closeManager);
  return (
    <>
      <button
        id="channelManagerClose"
        className="dialog-close"
        type="button"
        aria-label="Fechar gerenciamento"
        onClick={controller.closeManager}
      >
        <Icon name="close" />
      </button>
      <span className="section-eyebrow">SUA COMUNIDADE</span>
      <h2 id="channelManagerTitle">Organize os canais</h2>
      <form
        id="createChannelForm"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.createChannel();
        }}
      >
        <div className="form-columns">
          <label>
            Nome
            <input
              id="channelName"
              minLength={2}
              maxLength={40}
              required
              placeholder="Ex.: momentos"
              disabled={editor.busy}
              value={draft.name}
              onChange={(event) => controller.setDraft({ name: event.target.value })}
            />
          </label>
          <label>
            Tipo
            <select
              id="channelType"
              disabled={editor.busy}
              value={draft.type}
              onChange={(event) =>
                controller.setDraft({ type: event.target.value === 'voice' ? 'voice' : 'text' })
              }
            >
              <option value="text"># Canal de texto</option>
              <option value="voice">♬ Canal de voz</option>
            </select>
          </label>
        </div>
        <label>
          Descrição <small>opcional</small>
          <input
            id="channelDescription"
            maxLength={160}
            placeholder="Um espaço para compartilhar"
            disabled={editor.busy}
            value={draft.description}
            onChange={(event) => controller.setDraft({ description: event.target.value })}
          />
        </label>
        <button
          id="createChannelSubmit"
          className="primary-button"
          type="submit"
          disabled={editor.busy || !state.canManageChannels}
        >
          + Criar canal
        </button>
      </form>
      <p id="channelManagerMessage" className="feature-message" role="status">
        {editor.message}
      </p>
      <div id="managedChannels" className="managed-channels" aria-busy={editor.loading}>
        {!state.channels.length
          ? 'Nenhum canal criado.'
          : state.channels.map((channel) => (
              <div key={channel.id} className="managed-channel">
                <span>
                  {channel.type === 'text' ? '# ' : '♬ '}
                  {channel.name}
                </span>
                <button
                  type="button"
                  className="danger-button"
                  aria-label={`Excluir canal ${channel.name}`}
                  disabled={editor.busy || !state.canManageChannels}
                  onClick={() => {
                    if (
                      confirm(
                        `Excluir o canal “${channel.name}”? Os participantes sairão da chamada; os anexos continuam nos arquivos dos donos.`,
                      )
                    )
                      void controller.deleteChannel(channel.id);
                  }}
                >
                  Excluir
                </button>
              </div>
            ))}
      </div>
    </>
  );
}

export function RoleEditorContents({ controller }: { controller: ChannelManagement }) {
  const state = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    ),
    editor = state.roleEditor;
  useDialog('roleDialog', !!editor.target, controller.closeRole);
  return (
    <>
      <button
        id="roleClose"
        className="dialog-close"
        type="button"
        aria-label="Fechar cargo"
        onClick={controller.closeRole}
      >
        <Icon name="close" />
      </button>
      <span className="section-eyebrow">PERMISSÕES</span>
      <h2 id="roleTitle">
        Cargo de <span id="rolePersonName">{editor.target?.name ?? ''}</span>
      </h2>
      <p>Somente o criador pode conceder ou remover Admin.</p>
      <form
        id="roleForm"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.saveRole();
        }}
      >
        <input id="rolePersonId" type="hidden" value={editor.target?.id ?? ''} />
        <label>
          Cargo
          <select
            id="roleSelect"
            disabled={editor.busy}
            value={editor.selected}
            onChange={(event) =>
              controller.selectRole(event.target.value === 'admin' ? 'admin' : 'member')
            }
          >
            <option value="member">Membro</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <p id="roleMessage" className="feature-message" role="status">
          {editor.message}
        </p>
        <button
          id="roleSave"
          className="primary-button"
          type="submit"
          disabled={editor.busy || !state.canManageRoles}
        >
          Salvar cargo
        </button>
      </form>
    </>
  );
}

export function ChannelFilesContents({ controller }: { controller: ChannelFiles }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useDialog('channelFilesDialog', state.open, controller.close);
  return (
    <>
      <button
        id="channelFilesClose"
        className="dialog-close"
        type="button"
        aria-label="Fechar anexos"
        onClick={controller.close}
      >
        <Icon name="close" />
      </button>
      <span className="section-eyebrow">ARQUIVOS DO CANAL</span>
      <h2 id="channelFilesTitle">Fotos &amp; anexos</h2>
      <p id="channelFilesMessage" className="feature-message" role="status">
        {state.message}
      </p>
      <div id="channelFileList" className="channel-file-list" aria-busy={state.loading}>
        {state.files.map((file) => (
          <article
            key={file.id}
            data-attachment={file.id}
            className={`channel-file-card${['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.mime) ? ' image-attachment' : ''}`}
          >
            <AttachmentContent file={file} />
          </article>
        ))}
        {(state.hasMore || state.error) && (
          <button
            type="button"
            className="files-load-more"
            disabled={state.loading}
            onClick={() => void (state.hasMore ? controller.more() : controller.open())}
          >
            {state.hasMore ? 'Carregar mais' : 'Tentar novamente'}
          </button>
        )}
      </div>
    </>
  );
}
