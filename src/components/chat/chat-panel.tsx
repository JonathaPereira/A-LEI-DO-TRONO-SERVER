import { ChatComposer } from './chat-composer';

export function ChatPanel() {
  return (
    <>
      <section className={'court-chat-section'} aria-label={'Mensagens de texto'}>
        <div className={'court-chat-title'}>
          <div>
            <small>MENSAGENS</small>
            <strong># conversa</strong>
          </div>
          <div className={'chat-title-actions'}>
            <button
              id={'channelFilesBtn'}
              className={'small-btn'}
              type={'button'}
              title={'Ver fotos e anexos do canal'}
            >
              Anexos
            </button>
            <button id={'muteTextBtn'} className={'small-btn'}>
              Silenciar chat
            </button>
            <button id={'chatDrawerCloseBtn'} className={'chat-drawer-close'} title={'Fechar chat'}>
              ×
            </button>
          </div>
        </div>
        <button id={'olderChatMessages'} type={'button'} className={'older-chat-messages hidden'}>
          Mensagens anteriores
        </button>
        <div id={'courtChatMessages'} className={'court-chat-messages'} aria-live={'polite'}></div>
        <ChatComposer />
        <div
          id={'attachmentStatus'}
          className={'attachment-status'}
          role={'status'}
          aria-live={'polite'}
        ></div>
        <small className={'chat-help'}>
          Enter envia • 10 MB por arquivo • 100 MB por vídeo MP4/WebM • 300 caracteres
        </small>
      </section>
    </>
  );
}
