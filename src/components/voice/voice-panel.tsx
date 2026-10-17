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
        >
          <div className={'voice-settings-content'}>
            <section
              className={'voice-settings-pane active'}
              data-settings-panel={'audio'}
              role={'tabpanel'}
            >
              <label className={'mn-gain-label call-alert-volume'}>
                <span>Avisos de entrada e saída</span>
                <output id={'callAlertVolumeValue'}>85%</output>
                <input
                  id={'callAlertVolume'}
                  type={'range'}
                  min={'0'}
                  max={'100'}
                  step={'5'}
                  defaultValue={'85'}
                  aria-label={'Volume dos avisos da chamada'}
                />
              </label>
              <button
                id={'testCallAlert'}
                className={'royal-btn settings-secondary'}
                type={'button'}
                data-no-click-sfx={'1'}
              >
                Ouvir aviso de chamada
              </button>
              <div className={'settings-action-grid'}>
                <button
                  id={'voiceSfxBtn'}
                  className={'royal-btn settings-secondary audio-pref-btn'}
                  type={'button'}
                  title={'Ativar ou silenciar efeitos da interface e avisos da chamada'}
                >
                  🔔 Efeitos: Ligados
                </button>
                <button
                  id={'voiceMusicBtn'}
                  className={'royal-btn settings-secondary audio-pref-btn'}
                  type={'button'}
                  title={'Ativar ou silenciar a música da aplicação'}
                >
                  ♫ Música: Ligada
                </button>
              </div>
              <label className={'auth-check'}>
                <input id={'voiceProtection'} type={'checkbox'} defaultChecked /> Proteger a voz
                recebida durante jogos
              </label>
              <small id={'voiceProtectionStatus'} className={'settings-context-help'}>
                Ajusta a margem de reprodução de cada voz, sem trocar trilhas ou reconectar.
              </small>
              <small className={'settings-context-help'}>
                Pode acrescentar um pequeno atraso para tolerar oscilações. No Windows, solicita
                prioridade moderada somente ao serviço de áudio do app. Não reserva CPU e não altera
                os volumes.
              </small>
              <div className={'voice-devices voice-devices-vertical'}>
                <label>
                  <span>Música de fundo</span>
                  <select
                    id={'voiceMusicTrackSelect'}
                    aria-label={'Trocar música do chat de voz'}
                  ></select>
                </label>
              </div>
              <label className={'mn-gain-label'}>
                <span>Volume da música</span>
                <output id={'voiceMusicVolumeValue'}>32%</output>
                <input
                  id={'voiceMusicVolume'}
                  type={'range'}
                  min={'0'}
                  max={'100'}
                  defaultValue={'32'}
                />
              </label>
              <small
                id={'voiceMusicStatus'}
                className={'music-playback-status'}
                role={'status'}
                aria-live={'polite'}
              ></small>
              <small className={'settings-context-help'}>
                Avisos de entrada, saída e mensagens. Escolha sua música aqui; a preferência vale
                para este dispositivo.
              </small>
            </section>
            <section
              className={'voice-settings-pane'}
              data-settings-panel={'video'}
              role={'tabpanel'}
              hidden
            ></section>
            <section
              className={'voice-settings-pane'}
              data-settings-panel={'connection'}
              role={'tabpanel'}
              hidden
            >
              <div className={'settings-section-heading'}>
                <div>
                  <small>REDE &amp; DIAGNÓSTICO</small>
                  <strong>Conexão</strong>
                </div>
                <span>SFU, TURN e telemetria</span>
              </div>
              <label className={'auth-check'}>
                <input id={'adaptiveQuality'} type={'checkbox'} defaultChecked /> Adaptar vídeo para
                proteger a voz
              </label>
              <small id={'adaptiveQualityStatus'} className={'settings-context-help'}>
                Qualidade escolhida preservada; reduções temporárias quando necessário.
              </small>
              <div className={'settings-action-grid'}>
                <button
                  id={'telemetryOpenBtn'}
                  className={'royal-btn settings-secondary telemetry-open-btn'}
                  title={'Ver diagnóstico em tempo real'}
                >
                  ⌁ Abrir diagnóstico
                </button>
              </div>
              <div id={'realtimeInfraCard'} className={'realtime-infra-card'} aria-live={'polite'}>
                <div className={'realtime-infra-head'}>
                  <div>
                    <small>TRANSPORTE DE MÍDIA</small>
                    <strong id={'realtimeModeLabel'}>WebRTC P2P (fallback)</strong>
                  </div>
                  <span id={'realtimeUsageLabel'}>Aguardando dados do backend</span>
                </div>
                <div
                  id={'realtimeUsageBar'}
                  className={'realtime-usage-bar'}
                  role={'progressbar'}
                  aria-label={'Uso mensal estimado do Cloudflare Realtime'}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={0}
                >
                  <i></i>
                </div>
                <small id={'realtimePolicyLabel'}>Freio de consumo aguardando sincronização.</small>
              </div>
              <small className={'settings-context-help'}>
                Falhas de publicação/assinatura são ressicronizadas antes do fallback. TURN só é
                relevante quando a rota ICE não consegue se estabelecer.
              </small>
            </section>
          </div>
        </div>
        <section
          id={'telemetryPanel'}
          className={'telemetry-panel hidden'}
          aria-label={'Telemetria WebRTC'}
        >
          <div className={'telemetry-head'}>
            <div>
              <small>DIAGNÓSTICO EM TEMPO REAL</small>
              <strong>Saúde da conexão</strong>
            </div>
            <button
              id={'telemetryCloseBtn'}
              className={'settings-close'}
              title={'Fechar diagnóstico'}
            >
              ×
            </button>
          </div>
          <div className={'telemetry-hero'}>
            <span id={'telemetryHeroDot'} className={'telemetry-dot neutral'}></span>
            <div>
              <strong id={'telemetryHeroLabel'}>Aguardando mídia</strong>
              <small id={'telemetryRecommendation'}>
                Entre na chamada para iniciar a telemetria.
              </small>
            </div>
          </div>
          <div className={'telemetry-grid'}>
            <div>
              <small>Transporte</small>
              <strong id={'telemetryTransport'}>—</strong>
            </div>
            <div>
              <small>RTT</small>
              <strong id={'telemetryRtt'}>—</strong>
            </div>
            <div>
              <small>Upload</small>
              <strong id={'telemetryUpload'}>—</strong>
            </div>
            <div>
              <small>Download</small>
              <strong id={'telemetryDownload'}>—</strong>
            </div>
            <div>
              <small>FPS enviado</small>
              <strong id={'telemetryOutFps'}>—</strong>
            </div>
            <div>
              <small>FPS recebido</small>
              <strong id={'telemetryInFps'}>—</strong>
            </div>
            <div>
              <small>Resolução enviada</small>
              <strong id={'telemetryOutResolution'}>—</strong>
            </div>
            <div>
              <small>Resolução recebida</small>
              <strong id={'telemetryInResolution'}>—</strong>
            </div>
            <div>
              <small>Perda de pacotes</small>
              <strong id={'telemetryLoss'}>—</strong>
            </div>
            <div>
              <small>Jitter</small>
              <strong id={'telemetryJitter'}>—</strong>
            </div>
            <div className={'telemetry-network'}>
              <small>Estado WebRTC</small>
              <strong id={'telemetryPcState'}>—</strong>
            </div>
            <div className={'telemetry-network'}>
              <small>Rota ICE</small>
              <strong id={'telemetryIceRoute'}>—</strong>
            </div>
            <div className={'telemetry-network'}>
              <small>Fallback TURN</small>
              <strong id={'telemetryTurn'}>—</strong>
            </div>
            <div>
              <small>Versão do app</small>
              <strong id={'telemetryAppVersion'}>0.8.0-alpha</strong>
            </div>
            <div className={'telemetry-wide'}>
              <small>Reprodução de voz</small>
              <strong id={'telemetryPlayback'}>—</strong>
            </div>
            <div>
              <small>Receptores de voz</small>
              <strong id={'telemetryVoiceReceivers'}>—</strong>
            </div>
            <div>
              <small>Processamento de áudio</small>
              <strong id={'telemetryAudioContext'}>—</strong>
            </div>
            <div className={'telemetry-wide'}>
              <small>Saída de áudio</small>
              <strong id={'telemetryOutput'}>—</strong>
            </div>
            <div className={'telemetry-wide'}>
              <small>Limitador detectado</small>
              <strong id={'telemetryLimiter'}>—</strong>
            </div>
            <div className={'telemetry-wide'}>
              <small>Último erro SFU</small>
              <strong id={'telemetrySfuError'}>Nenhum</strong>
            </div>
          </div>
          <button id={'copyDiagnostics'} type={'button'} className={'royal-btn settings-secondary'}>
            Copiar diagnóstico
          </button>
          <span id={'copyDiagnosticsStatus'} role={'status'}></span>
          <div className={'telemetry-grid'}>
            <div>
              <small>Perda de voz</small>
              <strong id={'telemetryAudioLoss'}>—</strong>
            </div>
            <div>
              <small>Jitter de voz</small>
              <strong id={'telemetryAudioJitter'}>—</strong>
            </div>
            <div>
              <small>Áudio recuperado</small>
              <strong id={'telemetryConcealed'}>—</strong>
            </div>
            <div>
              <small>Atraso local</small>
              <strong id={'telemetryLocalLag'}>—</strong>
            </div>
            <div className={'telemetry-wide'}>
              <small>Recursos do app</small>
              <strong id={'telemetryResources'}>—</strong>
            </div>
          </div>
          <section className={'voice-reception-report'} aria-label={'Recepção de voz'}>
            <strong>Recepção de voz</strong>
            <p id={'telemetryVoiceAssessment'}></p>
            <p id={'telemetryVoiceRows'}></p>
            <small>Prioridade de áudio</small>
            <p id={'telemetryVoicePriority'}></p>
            <small>Lacunas na saída, no intervalo medido</small>
            <p id={'telemetryOutputGaps'}></p>
            <small>
              Voz 1, 2… são identificadores locais desta chamada. Margem solicitada e buffer medido
              são grandezas diferentes; nenhum deles mede o atraso total até seu fone.
            </small>
          </section>
          <small className={'telemetry-note'}>
            Leitura local via WebRTC getStats(), atualizada a cada 2 segundos com o painel em foco e
            a cada 5 segundos durante a chamada em segundo plano. Alguns campos variam conforme
            navegador e dispositivo.
          </small>
        </section>
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
