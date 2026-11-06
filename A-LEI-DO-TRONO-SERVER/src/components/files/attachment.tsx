'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatAttachment } from '../../types/domain';
import type { FilesClient } from '../../lib/files/client';
import { formatFileSize } from '../../lib/files/client';
import { openFile } from '../../lib/files/open';
import { useFiles, useFileUrl } from './use-files';
import { openAttachmentImage } from './image-viewer';

interface AttachmentProps {
  file: ChatAttachment;
  privateMessage?: boolean;
  client?: FilesClient;
}
export function AttachmentContent({
  file,
  privateMessage = false,
  client: provided,
}: AttachmentProps) {
  const { client, state } = useFiles(provided);
  const deleted = file.deleted || Object.hasOwn(state.deleted, file.id);
  const image = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.mime);
  const source = useFileUrl(file.id, image && !deleted);
  const key = `${state.epoch}:${file.id}`;
  const [status, setStatus] = useState<{ key: string; text: string } | null>(null);
  const [video, setVideo] = useState<{ key: string; url: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () =>
    mounted.current &&
    client?.getSnapshot().epoch === state.epoch &&
    !Object.hasOwn(client.getSnapshot().deleted, file.id);
  const notice = (text: string) => {
    if (current()) setStatus({ key, text });
  };
  const owned = !!state.accountId && file.ownerId === state.accountId;
  const canRemove = owned || (!privateMessage && file.kind !== 'direct' && state.moderateFiles);
  if (deleted) return <small>Arquivo excluído.</small>;
  return (
    <>
      {image && (
        <button
          className="file-image-open"
          type="button"
          aria-label="Abrir imagem"
          disabled={!client}
          onClick={() => {
            void openAttachmentImage(client!, file.id).catch((error) =>
              notice(error instanceof Error ? error.message : 'Imagem indisponível.'),
            );
          }}
        >
          {source?.url && (
            <img
              className="chat-file-image"
              src={source.url}
              alt="Imagem anexada"
              loading="lazy"
              onError={() => notice('Não foi possível abrir a imagem.')}
            />
          )}
        </button>
      )}
      {['video/mp4', 'video/webm'].includes(file.mime) &&
        (video?.key === key ? (
          <video
            className="chat-file-video"
            controls
            playsInline
            preload="metadata"
            src={video.url}
          />
        ) : (
          <button
            className="file-preview"
            type="button"
            disabled={!client}
            onClick={async () => {
              try {
                const url = await client!.url(file.id);
                if (current()) setVideo({ key, url });
              } catch (error) {
                notice(error instanceof Error ? error.message : 'Vídeo indisponível.');
              }
            }}
          >
            ▶ Abrir vídeo
          </button>
        ))}
      {file.mime === 'application/pdf' && (
        <button
          className="file-preview"
          type="button"
          disabled={!client}
          onClick={() => void openFile(() => client!.url(file.id), notice, current)}
        >
          ▤ Abrir PDF
        </button>
      )}
      {!image && (
        <button
          className="file-download"
          type="button"
          disabled={!client}
          onClick={() => void openFile(() => client!.url(file.id, true), notice, current)}
        >
          {file.name} · {formatFileSize(file.bytes)} ↓
        </button>
      )}
      <small>{status?.key === key ? status.text : (source?.error ?? '')}</small>
      {canRemove && (
        <button
          className="file-delete"
          aria-label={owned ? 'Excluir anexo' : 'Moderar: excluir'}
          title={owned ? 'Excluir anexo' : 'Moderar: excluir'}
          type="button"
          disabled={removing === key || !client}
          onClick={async () => {
            if (
              !client ||
              !confirm(
                privateMessage || file.kind === 'direct'
                  ? 'Excluir este anexo da conversa privada?'
                  : 'Excluir este anexo para todos no canal?',
              )
            )
              return;
            setRemoving(key);
            try {
              await client.remove(file.id);
            } catch (error) {
              notice(
                error instanceof Error ? error.message : 'Não foi possível excluir o arquivo.',
              );
            } finally {
              if (mounted.current) setRemoving((value) => (value === key ? null : value));
            }
          }}
        >
          {image ? '×' : owned ? 'Excluir anexo' : 'Moderar: excluir'}
        </button>
      )}
    </>
  );
}

export function Attachment(props: AttachmentProps) {
  return (
    <div
      className={`chat-attachment${['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(props.file.mime) ? ' image-attachment' : ''}`}
      data-attachment={props.file.id}
    >
      <AttachmentContent key={props.file.id} {...props} />
    </div>
  );
}
