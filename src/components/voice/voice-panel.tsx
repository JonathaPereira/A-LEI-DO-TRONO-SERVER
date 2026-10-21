import { CallNavigationHost } from '@/components/navigation/call-navigation';
export function VoicePanel() {
  return (
    <>
      <section className={'voice-section'}>
        <div className={'text-voice-connection'}>
          <span id={'textVoiceRoomName'}></span>
          <CallNavigationHost id="returnToVoiceRoom" />
        </div>
        <div className={'voice-title'}>
          <div>
            <strong>O papo acontece aqui.</strong>
            <small className={'voice-subtitle'}>Microfone, câmera ou tela. Do seu jeito.</small>
          </div>
          <span id="call-status-host" style={{ display: 'contents' }} />
        </div>
        <div
          className={'voice-actions call-toolbar call-control-columns'}
          aria-label={'Controles principais da chamada'}
        >
          <div className={'call-control-group call-control-primary'}>
            <small>CHAMADA</small>
            <span
              id="call-control-joinVoiceBtn"
              data-call-control-host="joinVoiceBtn"
              style={{ display: 'contents' }}
            />
          </div>
          <div className={'call-control-group'}>
            <small>ÁUDIO</small>
            <span
              id="call-control-muteMicBtn"
              data-call-control-host="muteMicBtn"
              style={{ display: 'contents' }}
            />
            <span
              id="call-control-deafenVoiceBtn"
              data-call-control-host="deafenVoiceBtn"
              style={{ display: 'contents' }}
            />
          </div>
          <div className={'call-control-group'}>
            <small>VÍDEO &amp; TELA</small>
            <span
              id="call-control-cameraBtn"
              data-call-control-host="cameraBtn"
              style={{ display: 'contents' }}
            />
            <span
              id="call-control-screenShareBtn"
              data-call-control-host="screenShareBtn"
              style={{ display: 'contents' }}
            />
          </div>
          <div id="callReplayControls" className={'call-control-group call-control-clips'}>
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
            <span
              id="call-control-voiceSettingsBtn"
              data-call-control-host="voiceSettingsBtn"
              style={{ display: 'contents' }}
            />
          </div>
        </div>
        <div id="callReplayDock" aria-label="Controles de replay" />
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
              <strong />
            </div>
            <span id="expandMosaicHost" style={{ display: 'contents' }} />
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
        <footer id="callFocusDock" aria-label="Controles da chamada" />
      </section>
    </>
  );
}
