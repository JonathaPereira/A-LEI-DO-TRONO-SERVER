import { CallNavigationHost } from '@/components/navigation/call-navigation';
import { ChatComposer } from './chat-composer';
import { ChatClearButton, ChatMessages, ChatModerationDialog } from './chat-messages';

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
            <ChatClearButton />
            <button
              id={'channelFilesBtn'}
              className={'small-btn'}
              type={'button'}
              title={'Ver fotos e anexos do canal'}
            >
              Anexos
            </button>
            <CallNavigationHost id="muteTextBtn" />
            <CallNavigationHost id="chatDrawerCloseBtn" />
          </div>
        </div>
        <ChatMessages />
        <ChatComposer />
        <small className={'chat-help'}>
          Enter envia • 10 MB por arquivo • 100 MB por vídeo MP4/WebM • 300 caracteres
        </small>
        <ChatModerationDialog />
      </section>
    </>
  );
}
