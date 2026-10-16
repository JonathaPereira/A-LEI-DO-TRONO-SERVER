import { FILE_LIMITS, formatFileSize } from '../files/client.ts';
import type { NetworkClient } from '../socket/client.ts';
import type { ChatFiles, ComposerSnapshot } from '../../types/chat';
import type { SocketMessage } from '../../types/socket';

type ChatNetwork = Pick<NetworkClient, 'getSnapshot' | 'subscribe' | 'onMessage' | 'sendChat'>;

interface ComposerOptions {
  network: ChatNetwork;
  getFiles(): ChatFiles | null;
  getAccountId(): string | null;
  subscribeIdentity?: (listener: () => void) => () => void;
  warn?: (error: unknown) => void;
}

interface UploadOperation {
  roomId: string;
  accountId: string | null;
  controller: AbortController;
}

export const EMPTY_COMPOSER: ComposerSnapshot = Object.freeze({
  draft: '',
  file: null,
  uploading: false,
  status: '',
  focusVersion: 0,
});

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.';
}

function uploadedId(value: unknown): string {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !value.id
  )
    throw new Error('Resposta inválida ao enviar o arquivo.');
  return value.id;
}

/** Owns the draft, selected file and upload lifetime; there is no DOM or second socket here. */
export function createChatComposer({
  network,
  getFiles,
  getAccountId,
  subscribeIdentity,
  warn = (error) => console.warn('[ChatComposer]', error),
}: ComposerOptions) {
  let state = EMPTY_COMPOSER;
  let active: UploadOperation | null = null;
  let disposed = false;
  let roomId = network.getSnapshot().currentRoom;
  let accountId = getAccountId();
  const listeners = new Set<() => void>();

  function update(patch: Partial<ComposerSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        warn(error);
      }
    }
  }

  function cancel() {
    const previous = active;
    active = null;
    previous?.controller.abort();
    update({ file: null, uploading: false, status: '' });
  }

  function isCurrent(operation: UploadOperation): boolean {
    const connection = network.getSnapshot();
    return (
      !disposed &&
      active === operation &&
      !operation.controller.signal.aborted &&
      connection.connected &&
      connection.currentRoom === operation.roomId &&
      getAccountId() === operation.accountId
    );
  }

  function reportStatus(status = '') {
    update({ status });
  }

  const unsubscribeState = network.subscribe(() => {
    const next = network.getSnapshot();
    if (roomId !== next.currentRoom || !next.connected) cancel();
    roomId = next.currentRoom;
  });
  const unsubscribeIdentity = subscribeIdentity?.(() => {
    const next = getAccountId();
    if (next === accountId) return;
    accountId = next;
    cancel();
    update({ draft: '' });
  });

  function receive(message: SocketMessage) {
    if (
      message.type !== 'error' ||
      typeof message.code !== 'string' ||
      !['CHAT_HISTORY_UNAVAILABLE', 'CHAT_HISTORY_RATE'].includes(message.code)
    )
      return;
    const failed = message.failedMessage;
    const attempt =
      failed && typeof failed === 'object' && 'roomId' in failed && 'text' in failed
        ? failed
        : null;
    const target = attempt?.roomId ?? message.roomId;
    if (typeof target !== 'string' || target !== network.getSnapshot().currentRoom) return;
    if (!state.draft && typeof attempt?.text === 'string')
      update({ draft: attempt.text.slice(0, 300) });
    reportStatus(
      typeof message.message === 'string' ? message.message : 'Não foi possível salvar a mensagem.',
    );
  }
  const unsubscribeMessages = network.onMessage(receive);

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setDraft(draft: string) {
      if (!state.uploading) update({ draft: draft.slice(0, 300) });
    },
    canAttach(): boolean {
      if (network.getSnapshot().currentRoom) return true;
      reportStatus('Entre em um canal para anexar arquivos.');
      return false;
    },
    selectFile(file: File): boolean {
      if (disposed || state.uploading) return false;
      if (!network.getSnapshot().currentRoom) {
        reportStatus('Entre em um canal para anexar arquivos.');
        return false;
      }
      const max = /\.(mp4|webm)$/i.test(file.name) ? FILE_LIMITS.video : FILE_LIMITS.file;
      if (!file.size || file.size > max) {
        update({ file: null, status: `Limite: ${formatFileSize(max)} por arquivo.` });
        return false;
      }
      update({ file, status: `${file.name} · ${formatFileSize(file.size)}. Clique em enviar.` });
      return true;
    },
    reportStatus,
    cancel,
    async send(): Promise<boolean> {
      if (disposed || active) return false;
      const text = state.draft.trim(),
        file = state.file;
      if (!text && !file) return false;
      if (!network.getSnapshot().connected) {
        reportStatus('Conexão interrompida. Aguarde a reconexão para enviar.');
        return false;
      }
      if (!file) {
        if (!network.sendChat(text)) {
          reportStatus('Conexão interrompida. Aguarde a reconexão para enviar.');
          return false;
        }
        update({ draft: '', status: '', focusVersion: state.focusVersion + 1 });
        return true;
      }
      const currentRoom = network.getSnapshot().currentRoom;
      const files = getFiles();
      if (!currentRoom || !files) {
        reportStatus('Entre em um canal e aguarde o carregamento dos arquivos.');
        return false;
      }
      const operation: UploadOperation = {
        roomId: currentRoom,
        accountId: getAccountId(),
        controller: new AbortController(),
      };
      active = operation;
      update({ uploading: true });
      let uploaded: string | null = null;
      let attached = false;
      try {
        const result = await files.upload(file, {
          roomId: currentRoom,
          signal: operation.controller.signal,
          onProgress: (percent) => {
            if (isCurrent(operation) && Number.isFinite(percent))
              reportStatus(
                `Enviando ${file.name}: ${Math.max(0, Math.min(100, Math.round(percent)))}%`,
              );
          },
        });
        uploaded = uploadedId(result);
        if (!isCurrent(operation)) return false;
        if (!network.sendChat(text, uploaded))
          throw new Error('Conexão interrompida. Tente novamente.');
        attached = true;
        update({ draft: '', file: null, status: 'Arquivo enviado.' });
        return true;
      } catch (error) {
        if (isCurrent(operation)) reportStatus(messageOf(error));
        return false;
      } finally {
        if (uploaded && !attached && getAccountId() === operation.accountId) {
          try {
            await files.remove(uploaded);
          } catch (error) {
            warn(error);
          }
        }
        if (active === operation) {
          active = null;
          update({ uploading: false, focusVersion: state.focusVersion + 1 });
        }
      }
    },
    dispose() {
      cancel();
      disposed = true;
      unsubscribeState();
      unsubscribeIdentity?.();
      unsubscribeMessages();
      listeners.clear();
    },
  };
}

export type ChatComposerController = ReturnType<typeof createChatComposer>;
