import { ChatPanel } from '@/components/chat/chat-panel';
import { VoicePanel } from '@/components/voice/voice-panel';

export function CommunicationPanel() {
  return (
    <>
      <aside
        id={'socialPanel'}
        className={'social-panel hidden social-hidden'}
        aria-label={'Comunicação da Corte'}
      >
        <div id={'socialDragHandle'} className={'social-head'}>
          <div>
            <small>SALA DE VOZ</small>
            <strong id={'mnStageRoomName'}>Geral</strong>
          </div>
          <div className={'social-head-actions'}>
            <button id={'socialModeBtn'} title={'Ampliar câmeras e telas da chamada'}>
              Ampliar
            </button>
            <button id={'socialCloseBtn'} title={'Minimizar'}>
              —
            </button>
          </div>
        </div>
        <ChatPanel />
        <VoicePanel />
        <div
          id={'socialResizeGrip'}
          className={'social-resize-grip'}
          title={'Redimensionar janela'}
          aria-hidden={'true'}
        >
          ↘
        </div>
        <div id={'remoteAudioHost'} className={'remote-audio-host'} aria-hidden={'true'}></div>
      </aside>
    </>
  );
}
