import { CallNavigationHost } from '@/components/navigation/call-navigation';
import { ChatPanel } from '@/components/chat/chat-panel';
import { VoicePanel } from '@/components/voice/voice-panel';

export function CommunicationPanel({ active = true }: { active?: boolean }) {
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
            <strong id={'mnStageRoomName'} />
          </div>
          <div className={'social-head-actions'}>
            <button id={'socialModeBtn'} title={'Ampliar câmeras e telas da chamada'}>
              Ampliar
            </button>
            <CallNavigationHost id="socialCloseBtn" />
          </div>
        </div>
        <ChatPanel active={active} />
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
