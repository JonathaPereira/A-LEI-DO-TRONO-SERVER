export function VoicePanel() {
  return (
    <>
      <section className={'voice-section'}>
        <div className={'text-voice-connection'}>
          <span id={'textVoiceRoomName'}></span>
          <button id={'returnToVoiceRoom'} type={'button'}>
            Voltar à sala de voz
          </button>
        </div>
        <div className={'voice-title'}>
          <div>
            <strong>O papo acontece aqui.</strong>
            <small className={'voice-subtitle'}>Microfone, câmera ou tela. Do seu jeito.</small>
          </div>
          <span id={'voiceStatus'} role={'status'} aria-live={'polite'}>
            Fora do chat de voz.
          </span>
          <button id={'resumeAudioBtn'} className={'royal-btn hidden'} type={'button'}>
            🔊 Liberar áudio
          </button>
        </div>
        <div
          className={'voice-actions call-toolbar call-control-columns'}
          aria-label={'Controles principais da chamada'}
        >
          <div className={'call-control-group call-control-primary'}>
            <small>CHAMADA</small>
            <button id={'joinVoiceBtn'} className={'royal-btn primary call-action'}>
              <span className={'call-icon'}>☎</span>
              <span>Entrar na voz</span>
            </button>
          </div>
          <div className={'call-control-group'}>
            <small>ÁUDIO</small>
            <button id={'muteMicBtn'} className={'royal-btn call-action'} disabled>
              <span className={'call-icon'}>🎙</span>
              <span>Mutar microfone</span>
            </button>
            <button id={'deafenVoiceBtn'} className={'royal-btn call-action'} disabled>
              <span className={'call-icon'}>🔊</span>
              <span>Silenciar voz</span>
            </button>
          </div>
          <div className={'call-control-group'}>
            <small>VÍDEO &amp; TELA</small>
            <button id={'cameraBtn'} className={'royal-btn call-action'}>
              <span className={'call-icon'}>▣</span>
              <span>Ligar câmera</span>
            </button>
            <button
              id={'screenShareBtn'}
              className={'royal-btn screen-share-btn call-action'}
              disabled
            >
              <span className={'call-icon'}>▤</span>
              <span>Compartilhar tela</span>
            </button>
          </div>
          <div className={'call-control-group call-control-clips'}>
            <small>REPLAY</small>
            <button
              id={'clipToolbarNow'}
              className={'royal-btn call-action'}
              type={'button'}
              disabled
            >
              <span className={'call-icon'}>✂</span>
              <span id={'clipToolbarLabel'}>Clipar</span>
            </button>
            <button
              className={'royal-btn call-action'}
              data-open-clips={''}
              type={'button'}
              aria-label={'Abrir central de clipes'}
            >
              <span className={'call-icon'}>▦</span>
              <span>
                Meus clipes{' '}
                <b id={'clipToolbarCount'} hidden>
                  0
                </b>
              </span>
            </button>
          </div>
          <div className={'call-control-group call-control-system'}>
            <small>SISTEMA</small>
            <button
              id={'voiceSettingsBtn'}
              className={'royal-btn call-action settings-btn'}
              aria-expanded={'false'}
            >
              <span className={'call-icon'}>⚙</span>
              <span>Configurações</span>
            </button>
          </div>
        </div>
        <div
          id={'voiceSettingsPanel'}
          className={'voice-settings-panel hidden'}
          aria-label={'Configurações da chamada'}
        ></div>
        <div id="voiceDiagnosticsLauncher" style={{ display: 'contents' }} />
        <section
          id="telemetryPanel"
          className="telemetry-panel hidden"
          aria-label="Telemetria WebRTC"
        />
        <div className={'mn-media-stage'}>
          <div className={'mosaic-toolbar'}>
            <div>
              <span className={'section-eyebrow'}>AO VIVO</span>
              <strong>Câmeras &amp; telas</strong>
            </div>
            <button id={'expandMosaicBtn'} className={'small-btn'} type={'button'} disabled>
              ▦ Grade · até 6
            </button>
          </div>
          <div id={'mediaMosaic'} className={'media-mosaic'}>
            <div
              id={'screenShareGrid'}
              className={'screen-share-grid hidden'}
              aria-label={'Compartilhamentos de tela'}
            ></div>
            <div
              id={'cameraGrid'}
              className={'camera-grid camera-grid-empty'}
              aria-label={'Câmeras da chamada'}
            ></div>
          </div>
          <div
            id={'voiceRoster'}
            className={'voice-roster'}
            aria-label={'Participantes da chamada'}
          ></div>
        </div>
        <small className={'voice-help'}>
          Escolha Assistir stream para abrir uma tela. Amplie o mosaico com até 6 pessoas.
        </small>
      </section>
    </>
  );
}
