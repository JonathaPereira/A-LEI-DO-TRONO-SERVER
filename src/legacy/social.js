'use strict';
window.TronoSocial = (() => {
  const $ = (id) => document.getElementById(id);
  const storage = window.TronoStorage || localStorage;
  const profileActivities = new Map();
  let lastSfuError = '';
  const profileMedia = new Map();

  const clampGain = window.TronoVoiceCapture.clampAudioGain;
  const controlState = () => callControls.getSnapshot();
  let volumeOwner = null;
  const foreground = () => !document.hidden && document.hasFocus();
  function updateVoiceBackgroundClass() {
    document.body.classList.toggle(
      'voice-background',
      voiceCall.getSnapshot().joined && !foreground(),
    );
  }
  const isScreenKind = (kind) => kind === 'screen' || kind === 'screen-audio';
  const wantsSfuPublication = (pub) => mediaInterest.wants(pub);
  const streamAudioKey = (id) => `stream:${id}`;
  function ensureMediaAudioContext() {
    return callAudio.ensureContext();
  }
  function updateAudioRecoveryUI() {
    voiceSettings.refresh();
    const state = callAudio.getSnapshot().context;
    const blocked =
      audioPlayback.getSnapshot().entries.some((entry) => entry.blocked) ||
      (voiceCall.getSnapshot().joined && state && state !== 'running');
    $('resumeAudioBtn')?.classList.toggle('hidden', !blocked);
  }
  function unlockCallAudio() {
    callAudio.unlock();
  }
  function attachRemoteAudio(key) {
    const screen = key.startsWith('stream:'),
      peerId = screen ? key.slice(7) : key;
    if (screen && !mediaInterest.isWatching(peerId)) return;
    const streams = remoteMedia.getStreams(peerId);
    const track = (screen ? streams.screen : streams.av)
      .getAudioTracks()
      .find((t) => t.readyState === 'live');
    if (!track) {
      audioPlayback.remove(key);
      return;
    }
    const stream = audioPlayback.attach(key, track);
    if (!screen && stream) void speakingIndicators.watch(peerId, stream);
  }
  const removeRemoteAudio = (key) => audioPlayback.remove(key);
  function setStreamGain(id, value) {
    unlockCallAudio();
    audioPlayback.setGain(streamAudioKey(id), value);
    attachRemoteAudio(streamAudioKey(id));
    const tile = findPeerTile($('screenShareGrid'), id, '.screen-share-tile');
    const label = tile?.querySelector('.mn-stream-volume output');
    if (label) label.textContent = `${audioPlayback.getGain(streamAudioKey(id))}%`;
  }
  const toggleWatchStream = (id) => mediaInterest.toggleScreen(id);
  function setPeerGain(id, value) {
    if (!privateVoiceRoster.has(id) || id === meId()) return;
    unlockCallAudio();
    audioPlayback.setGain(id, value);
    attachRemoteAudio(id);
    const account = privateVoiceRoster.get(id)?.accountId;
    if (account) window.TronoPersonal?.set('volume:' + account, audioPlayback.getGain(id));
    const slider = document.querySelector(`[data-peer-volume="${CSS.escape(id)}"]`);
    const label = slider?.closest('.mn-peer-gain')?.querySelector('output');
    if (label) label.textContent = `${audioPlayback.getGain(id)}%`;
  }

  let roomState = null,
    chatRoomState = null,
    gameRoomState = null;
  let localStream = null;
  let panelOpen = false;
  let chatHubMode = false;
  const panelMode = 'floating';
  let chatMuted = storage.getItem('tronoChatMuted') === '1';
  const { QUALITY_ORDER, SCREEN_FORMATS } = window.TronoVoiceCapture;
  const qualityPreferences = () => callQuality.getSnapshot().preferences;
  let chatDrawerOpen = false;
  let chatUnreadCount = 0;
  let telemetryOpen = false;
  const callQuality = window.TronoVoiceCapture.createCallQuality({
    storage,
    policy: () => ({
      sfu: transportIsSfu(),
      maxQuality: realtime.getSnapshot().status?.maxQuality,
      highAllowed: realtime.getSnapshot().status?.highAllowed,
    }),
    call: () => voiceCall.getSnapshot(),
    refreshCamera: () => cameraCapture.refreshQuality(),
    refreshScreenHint: () => screenCapture.refreshHint(),
    *senders() {
      for (const pc of peers.values()) {
        yield { sender: pc._tronoAudioSender, kind: 'audio' };
        yield { sender: pc._tronoVideoSender, kind: 'camera' };
        yield { sender: pc._tronoScreenSender, kind: 'screen' };
        yield { sender: pc._tronoScreenAudioSender, kind: 'screen-audio' };
      }
      for (const pub of sfuLocalPublications.values()) yield { sender: pub.sender, kind: pub.kind };
    },
    subscriptions: () => sfuSubscriptions.values(),
    setLayer: (key, rid) => sfuSession.setLayer(key, rid),
  });

  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const meId = () => window.TronoNetwork?.clientId;
  const realtime = window.TronoVoiceCapture.createRealtimeConfiguration({
    connected: () => !!window.TronoNetwork?.connected,
    visible: () => document.visibilityState !== 'hidden',
    callGeneration: () => voiceCall.getSnapshot().generation,
    baseIce: window.TRONO_RTC_CONFIG,
    requestStatus: () => window.TronoNetwork.getRealtimeStatus(),
    requestIce: () => window.TronoNetwork.requestSfu('ice-config', {}, 8000),
    onMessage: (listener) => window.TronoNetwork.onMessage(listener),
    onChange: updateQualityUI,
    onStatus: applyRealtimeStatus,
  });
  const speakingIndicators = window.TronoVoiceCapture.createSpeakingIndicators({
    getSettings: () => ({
      enabled: voiceCall.getSnapshot().joined,
      hidden: document.hidden,
      foreground: foreground(),
      lightMode: controlState().voiceLightMode,
    }),
    getContext: ensureMediaAudioContext,
    createStream: (track) => new MediaStream([track]),
    windowEvents: window,
    documentEvents: document,
    onChange: updateMediaIndicators,
  });
  const microphone = window.TronoVoiceCapture.createMicrophone({
    mediaDevices: navigator.mediaDevices,
    getSettings: () => ({
      generation: voiceCall.getSnapshot().generation,
      enabled: controlState().noiseSuppression,
      nativeOnly: !!(
        controlState().voiceLightMode ||
        (window.TronoDesktop && controlState().noiseEngine === 'native')
      ),
      deviceId: controlState().selectedInput,
      gain: controlState().microphoneVolume,
      muted: controlState().micMuted,
    }),
    getStream: ensureLocalStream,
    customSuppressionSupported: () => !!window.TronoNoise?.supported(ensureMediaAudioContext()),
    createProcessor: (stream, options) =>
      window.TronoVoiceCapture.createMicrophoneProcessor(stream, options, {
        desktop: !!window.TronoDesktop,
        getContext: ensureMediaAudioContext,
        nativeSuppressionSupported: () =>
          !!navigator.mediaDevices?.getSupportedConstraints?.().noiseSuppression,
        createNoise: (ctx, onFailure) => window.TronoNoise.create(ctx, { onFailure }),
        onModeChange: updateNoiseButton,
        onNativeUnavailable: (processor) => {
          if (
            voiceCall.getSnapshot().joined &&
            microphone.getSnapshot().capture?.processor === processor
          )
            void acquireMic({ nativeOnly: true }).catch((err) => {
              if (err?.code !== 'VOICE_CANCELLED')
                setStatus('Microfone ativo, mas a redução nativa não iniciou.', 'warn');
            });
        },
      }),
    onTrackChanged: (change) => devicePublication.publishMicrophone(change),
  });
  microphone.subscribe(updateNoiseButton);
  const screenCapture = window.TronoVoiceCapture.createScreenCapture({
    mediaDevices: navigator.mediaDevices,
    getSettings: () => ({
      generation: voiceCall.getSnapshot().generation,
      joined: voiceCall.getSnapshot().joined,
      format: qualityProfile().screen,
      replay: window.TronoClips?.captureProfile?.(),
      audio: screenSharingControls.getSnapshot().audio,
      contentHint: qualityPreferences().screenContent,
    }),
    onStarted: (change) => screenPublication.publish(change),
    onEnded: () => stopScreenShare(true),
    onAudioEnded: (change) => screenPublication.detachAudio(change),
    onSourceStarted: (source) => {
      void window.TronoClips?.sharedStarted?.(source);
    },
    onSourceStopped: (source) => {
      window.TronoClips?.sharedStopped?.(source);
    },
  });
  const screenSharing = () => screenCapture.getCapture() !== null;
  const cameraCapture = window.TronoVoiceCapture.createCamera({
    mediaDevices: navigator.mediaDevices,
    getSettings: () => ({
      generation: voiceCall.getSnapshot().generation,
      joined: voiceCall.getSnapshot().joined,
      deviceId: controlState().selectedCamera,
      format: qualityProfile().camera,
    }),
    getStream: ensureLocalStream,
    onStarted: (change) => devicePublication.publishCamera(change),
    onStopped: () => devicePublication.cameraStopped(),
    onDeviceMissing: (deviceId) => callControls.forgetCamera(deviceId),
  });
  const cameraOn = () => cameraCapture.getSnapshot().capture !== null;
  cameraCapture.subscribe(renderCameraState);
  const p2pPeers = window.TronoVoiceCapture.createP2pPeers({
    getSettings: () => ({
      enabled: voiceCall.getSnapshot().joined && !transportIsSfu() && !transportPending(),
      localId: meId(),
    }),
    createConnection: () => new RTCPeerConnection(realtime.configuration('p2p')),
    getTracks: () => ({
      audio: localStream?.getAudioTracks()[0] || null,
      camera: localStream?.getVideoTracks()[0] || null,
      screen: screenCapture.getCapture()?.outgoing.getVideoTracks()[0] || null,
      'screen-audio':
        screenCapture
          .getCapture()
          ?.outgoing.getAudioTracks()
          .find((t) => t.readyState === 'live') || null,
    }),
    applyQuality: applySenderQuality,
    sendSignal: (id, type, data) => window.TronoNetwork?.sendVoiceSignal(id, type, data),
    getScreenWatch: (id) => mediaInterest.isWatching(id),
    onTrack: (id, track, transceiver) => remoteMedia.attachPeer(id, track, transceiver),
    onClosed: clearPeerMedia,
    onStateChange: renderVoiceRoster,
    onStatus: peerStatus,
  });
  const peers = p2pPeers.connections;
  const remoteMedia = window.TronoVoiceCapture.createRemoteMedia({
    enabled: () => voiceCall.getSnapshot().joined,
    createStream: () => new MediaStream(),
    getPeer: (id) => peers.get(id),
    isPeerCurrent: (id, pc) => p2pPeers.isCurrent(id, pc),
    getInterest: (id) => ({
      camera: !!privateVoiceRoster.get(id)?.camera && !mediaInterest.isCameraHidden(id),
      screen: !!privateVoiceRoster.get(id)?.screen && mediaInterest.isWatching(id),
    }),
    isCameraHidden: (id) => mediaInterest.isCameraHidden(id),
    onVoiceReceiver: (id, receiver, added) => {
      if (added) voiceTelemetry.registerReceiver(id, receiver);
      else voiceTelemetry.removeReceiver(receiver);
    },
    onAudioReady: (id, kind) =>
      attachRemoteAudio(kind === 'screen-audio' ? streamAudioKey(id) : id),
    onChange: () => {
      renderVideoGrid();
      renderScreenGrid();
      renderSeatMedia();
    },
    onRecover: recoverRemoteMedia,
  });

  const audioPlayback = window.TronoVoiceCapture.createAudioPlayback({
    volume: storage.getItem('mnOutputGain') ?? 100,
    output: storage.getItem('tronoVoiceOutput') || '',
    createAudio: (key) => {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.dataset.peer = key;
      $('remoteAudioHost')?.appendChild(audio);
      return audio;
    },
    createStream: (track) => new MediaStream([track]),
    createContext: () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      return Ctx ? new Ctx({ latencyHint: 0.04, sampleRate: 48000 }) : null;
    },
    onChange: updateAudioRecoveryUI,
    onBlocked: () => setStatus('Áudio recebido. Toque em Liberar áudio para ouvir.', 'warn'),
    onOutputFallback: (failed) => {
      storage.setItem('tronoVoiceOutput', audioPlayback.getSnapshot().output);
      voiceSettings.refresh();
      setStatus(
        failed
          ? 'Não foi possível abrir a saída de áudio. Escolha outra saída em Configurações.'
          : 'Saída escolhida indisponível. Usando a saída padrão.',
        failed ? 'error' : 'warn',
      );
    },
  });

  const callAlerts = window.TronoVoiceCapture.createCallAlerts({
    storage,
    getSettings: () => ({
      enabled: window.TronoAudio?.sfxEnabled !== false,
      muted: controlState().deafened || storage.getItem('tronoSfxEnabled') === '0',
      output: audioPlayback.getSnapshot().output,
    }),
    createContext: () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      return Ctx ? new Ctx() : null;
    },
  });
  const callAudio = window.TronoVoiceCapture.createCallAudio({
    desktop: !!window.TronoDesktop,
    getSettings: () => ({
      joined: voiceCall.getSnapshot().joined,
      generation: voiceCall.getSnapshot().generation,
      output: audioPlayback.getSnapshot().output,
      visible: document.visibilityState === 'visible',
    }),
    createContext: (options) => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      return Ctx ? new Ctx(options) : null;
    },
    playback: audioPlayback,
    alerts: callAlerts,
    refreshMicrophone: refreshMicPipeline,
    documentEvents: document,
    onChange: updateAudioRecoveryUI,
  });

  const voiceTelemetry = window.TronoVoiceCapture.createVoiceTelemetry({
    protection: storage.getItem('mnVoiceProtection') !== '0',
    getSettings: () => ({
      joined: voiceCall.getSnapshot().joined,
      transport: voiceTransport.getSnapshot().mode,
      detailsOpen: telemetryOpen,
      foreground: foreground(),
      visible: document.visibilityState !== 'hidden',
      desktop: !!window.TronoDesktop,
    }),
    getConnections: allTelemetryPeerConnections,
    getLocalVideo: () =>
      screenSharing()
        ? screenCapture.getCapture()?.outgoing.getVideoTracks()[0]
        : localStream?.getVideoTracks()[0],
    getResources: window.TronoDesktop?.getResources
      ? () => window.TronoDesktop.getResources()
      : undefined,
    setVoiceProtection: window.TronoDesktop?.setVoiceProtection
      ? (active) => window.TronoDesktop.setVoiceProtection(active)
      : undefined,
    onSample: async (snapshot, isCurrent) => {
      if (!isCurrent() || !callQuality.sample(snapshot, performance.now())) return;
      await applyQualityToLiveMedia();
      if (isCurrent())
        setStatus(
          callQuality.getSnapshot().adaptation.level
            ? 'Vídeo adaptado para aliviar ' + callQuality.getSnapshot().adaptation.reason + '.'
            : 'Qualidade de vídeo restaurada.',
          'ok',
        );
    },
    onChange: renderTelemetry,
  });

  const sfuSession = window.TronoVoiceCapture.createSfuSession({
    getSettings: () => ({
      enabled: voiceCall.getSnapshot().joined && transportIsSfu(),
      screenAllowed: !!realtime.getSnapshot().status?.screenAllowed,
      quality: cappedQuality(),
      screenBitrate: effectiveScreenBitrate(),
      videoBitrate: qualityProfile().videoBitrate,
      camera: qualityProfile().camera,
      screen: qualityProfile().screen,
      ice: realtime.configuration('sfu'),
    }),
    createConnection: (config) => new RTCPeerConnection(config),
    request: (action, payload, timeout) => window.TronoNetwork.requestSfu(action, payload, timeout),
    wants: wantsSfuPublication,
    getTrack: (kind) =>
      kind === 'audio'
        ? localStream?.getAudioTracks()[0]
        : kind === 'camera'
          ? cameraCapture.getSnapshot().capture?.track
          : kind === 'screen'
            ? screenCapture.getCapture()?.outgoing.getVideoTracks()[0]
            : screenCapture
                .getCapture()
                ?.outgoing.getAudioTracks()
                .find((t) => t.readyState === 'live'),
    onPublicationRetry: (kind, error, attempt, done) => {
      if (error?.code === 'HIGH_BUDGET_BLOCKED') {
        realtime.restrictHighQuality();
      }
      const label = {
        audio: 'Microfone',
        camera: 'Câmera',
        screen: 'Tela',
        'screen-audio': 'Áudio da tela',
      }[kind];
      lastSfuError = label + ': ' + (error?.code || 'SFU_ERROR');
      setStatus(
        done && kind !== 'audio'
          ? label + ' não conectou. A voz continua pelo SFU.'
          : label + ' reconectando pelo SFU…',
        'warn',
      );
    },
    watchVersion: (id) => mediaInterest.watchVersion(id),
    preferredRid: (kind) => preferredRidForMedia(kind, false),
    applyQuality: applySenderQuality,
    onTrack: attachSfuRemoteTrack,
    onSubscriptionClosed: detachSfuRemoteMedia,
    onReady: (kind, receiving) => {
      if (receiving || lastSfuError.toLowerCase().includes(kind)) lastSfuError = '';
    },
    onRetry: reportSfuRetry,
    onFallback: (reason) =>
      fallbackToP2p(
        reason === 'publisher'
          ? 'A conexão com o SFU falhou; retornando ao P2P.'
          : 'Não foi possível negociar a mídia pelo SFU. Reconectando a chamada por P2P.',
      ),
    onChange: () => {
      renderVoiceRoster();
      renderVideoGrid();
      renderScreenGrid();
      renderSeatMedia();
    },
  });
  const sfuLocalPublications = sfuSession.publications,
    sfuSubscriptions = sfuSession.subscriptions;
  const {
    closePublication: closeSfuPublication,
    closeSubscription: closeSfuSubscription,
    refreshPublications: refreshSfuPublicationList,
    syncSubscriptions: syncSfuSubscriptions,
    clearRetry: clearSfuRetry,
  } = sfuSession;

  const voiceTransport = window.TronoVoiceCapture.createVoiceTransport({
    call: () => voiceCall.getSnapshot(),
    community: () => communityVoice(),
    realtime,
    sfu: sfuSession,
    tracks: () => ({
      audio: localStream?.getAudioTracks()[0],
      camera: cameraCapture.getSnapshot().capture?.track,
      screen: screenCapture.getCapture()?.outgoing.getVideoTracks()[0],
      'screen-audio': screenCapture
        .getCapture()
        ?.outgoing.getAudioTracks()
        .find((track) => track.readyState === 'live'),
    }),
    closePeers: closeAllPeers,
    clearReceived: () => {
      for (const { key: id } of audioPlayback.getSnapshot().entries) {
        removeRemoteAudio(id);
        if (id !== meId()) speakingIndicators.remove(id);
      }
      remoteMedia.reset();
    },
    syncPeers,
    announce: (mode) =>
      window.TronoNetwork?.setVoiceState(
        true,
        controlState().micMuted,
        cameraOn(),
        screenSharing(),
        qualityPreferences().transmissionQuality,
        mode,
      ),
    fallbackRoom: () => window.TronoNetwork?.fallbackVoice?.(),
    onMessage: (listener) => window.TronoNetwork.onMessage(listener),
    onChange: () => {
      updateQualityUI();
      renderVoiceRoster();
      renderVideoGrid();
      renderScreenGrid();
      renderSeatMedia();
    },
    onStatus: setStatus,
    onError: (error) => {
      lastSfuError = error
        ? `Áudio: ${error.code || error.name || 'SFU_ERROR'} — ${error.message || 'falha ao conectar'}`
        : '';
    },
  });
  const { fallback: fallbackToP2p } = voiceTransport;

  const voiceCall = window.TronoVoiceCapture.createVoiceCall({
    prepare: () => window.TronoNetwork.prepareVoice(),
    microphone,
    roomId: () => roomState?.id,
    onMessage: (listener) => window.TronoNetwork.onMessage(listener),
    onPreparing: prepareCallUi,
    onPrepared: (choice) => {
      voiceTransport.prepare(choice.mode);
      setStatus('Solicitando acesso ao microfone…');
    },
    onJoined: showJoinedCall,
    connect: voiceTransport.connect,
    onLeaving: prepareLeaveUi,
    release: [
      realtime.cancelIce,
      speakingIndicators.reset,
      voiceTelemetry.reset,
      cameraCapture.stop,
      closeAllPeers,
      voiceTransport.reset,
      audioPlayback.reset,
      () => {
        localStream?.getTracks().forEach((track) => track.stop());
        localStream = null;
      },
      screenCapture.stop,
    ],
    onLeft: showLeftCall,
    onError: (error) => setStatus(error?.message || 'Não foi possível abrir o microfone.', 'error'),
    onChange: updateButtons,
  });
  const { toggle: joinVoice, leave: leaveVoice } = voiceCall;
  const callControls = window.TronoVoiceCapture.createCallControls({
    desktop: !!window.TronoDesktop,
    storage,
    call: () => voiceCall.getSnapshot(),
    join: joinVoice,
    microphone,
    camera: cameraCapture,
    watchMicrophone: () => speakingIndicators.watch(meId(), localStream),
    setDeafened: (value) => audioPlayback.setDeafened(value),
    unlockAudio: unlockCallAudio,
    announce: () =>
      window.TronoNetwork?.setVoiceState(
        voiceCall.getSnapshot().joined,
        controlState().micMuted,
        cameraOn(),
        screenSharing(),
        qualityPreferences().transmissionQuality,
        announcedTransport(),
      ),
    restartTelemetry: () => voiceTelemetry.start(),
    isSfu: () => transportIsSfu(),
    onStatus: setStatus,
    onChange: (change) => {
      voiceSettings.refresh();
      if (change === 'processing' || change === 'gain') updateNoiseButton();
      if (change === 'mute') {
        updateButtons();
        renderVoiceRoster();
        updateMediaIndicators();
      }
      if (change === 'camera') {
        updateButtons();
        renderVideoGrid();
        renderSeatMedia();
      }
    },
  });

  const controlBindings = window.TronoVoiceCapture.createCallControlBindings({
    controls: callControls,
    root: document,
  });
  const voiceRoster = window.TronoVoiceCapture.createVoiceRoster({
    localId: meId,
    call: () => voiceCall.getSnapshot(),
    transport: () => voiceTransport.getSnapshot().mode,
    peers: p2pPeers,
    closePeer,
    sfu: sfuSession,
    hasGain: (id) => audioPlayback.hasGain(id),
    restoreGain: (id, accountId) =>
      audioPlayback.setGain(
        id,
        clampGain(window.TronoPersonal?.get('volume:' + accountId, 100) ?? 100),
      ),
    onSound: playCallSound,
    onNotice: callNotice,
    onChange: renderCallMedia,
    onMessage: (listener) => window.TronoNetwork.onMessage(listener),
  });
  const privateVoiceRoster = voiceRoster.members;
  const mediaInterest = window.TronoVoiceCapture.createMediaInterest({
    call: () => voiceCall.getSnapshot(),
    localId: meId,
    participant: (id) => privateVoiceRoster.get(id),
    community: () => inChatHub(),
    isSfu: () => transportIsSfu(),
    cameraTracks: (id) => remoteMedia.getStreams(id).av.getVideoTracks(),
    unlockAudio: unlockCallAudio,
    removeScreenAudio: (id) => removeRemoteAudio(streamAudioKey(id)),
    attachScreenAudio: (id) => attachRemoteAudio(streamAudioKey(id)),
    cancelRecovery: (id) => remoteMedia.cancelRecovery(id),
    clearCameraRetry: (id) => clearSfuRetry(sfuKey(id, 'camera')),
    closeSubscription: (id, kind) => closeSfuSubscription(sfuKey(id, kind)),
    syncSubscriptions: syncSfuSubscriptions,
    sendWatch: (id, watching) =>
      window.TronoNetwork?.sendVoiceSignal(id, 'stream-watch', { watching }),
    hide: (id, kind) => mediaInterestBindings.hide(id, kind),
    onChange: (kind) => {
      renderVoiceRoster();
      if (kind === 'screen') renderScreenGrid();
      else {
        renderVideoGrid();
        renderSeatMedia();
        window.dispatchEvent(new CustomEvent('trono-media-change'));
      }
    },
  });
  const mediaInterestBindings = window.TronoVoiceCapture.createMediaInterestBindings({
    document,
    toggleScreen: (id) => toggleWatchStream(id),
    toggleCamera: (id) => toggleWatchCamera(id),
  });

  const screenSharingControls = window.TronoVoiceCapture.createScreenSharing({
    storage,
    call: () => voiceCall.getSnapshot(),
    community: () => communityVoice(),
    supported: () => !!navigator.mediaDevices?.getDisplayMedia,
    join: joinVoice,
    policy: () => ({
      sfu: transportIsSfu(),
      screenAllowed: realtime.getSnapshot().status?.screenAllowed,
      highAllowed: realtime.getSnapshot().status?.highAllowed,
    }),
    capture: screenCapture,
    quality: callQuality,
    peers,
    stopWatching: p2pPeers.stopWatching,
    closePublication: closeSfuPublication,
    announceStopped: () =>
      window.TronoNetwork?.setVoiceState(
        voiceCall.getSnapshot().joined,
        controlState().micMuted,
        cameraOn(),
        false,
        qualityPreferences().transmissionQuality,
        announcedTransport(),
      ),
    onChange: (kind) => {
      if (kind === 'settings') updateQualityUI();
      else {
        if (kind === 'stopped') updateButtons();
        renderScreenGrid();
        renderVoiceRoster();
      }
    },
    onStatus: setStatus,
  });
  const screenSharingBindings = window.TronoVoiceCapture.createScreenSharingBindings({
    document,
    sharing: screenSharingControls,
    call: () => voiceCall.getSnapshot(),
    localId: meId,
    replayEnabled: () => !!window.TronoClips?.captureProfile?.(),
    onRender: renderScreenGrid,
  });

  const screenPublication = window.TronoVoiceCapture.createScreenPublication({
    isSfu: () => transportIsSfu(),
    sfu: sfuSession,
    p2p: p2pPeers,
    quality: callQuality,
    sharing: screenSharingControls,
    announce: () => {
      window.TronoNetwork?.setVoiceState(
        true,
        controlState().micMuted,
        cameraOn(),
        true,
        qualityPreferences().transmissionQuality,
        announcedTransport(),
      );
      updateButtons();
      renderScreenGrid();
      renderVoiceRoster();
    },
    onAudioDetached: renderScreenGrid,
    onStatus: setStatus,
  });

  const devicePublication = window.TronoVoiceCapture.createDevicePublication({
    call: () => voiceCall.getSnapshot(),
    isSfu: () => transportIsSfu(),
    sfu: sfuSession,
    p2p: p2pPeers,
    quality: callQuality,
    camera: cameraCapture,
    controls: callControls,
    closePeer,
    announceCamera: () => {
      window.TronoNetwork?.setVoiceState(
        voiceCall.getSnapshot().joined,
        controlState().micMuted,
        cameraOn(),
        screenSharing(),
        qualityPreferences().transmissionQuality,
        announcedTransport(),
      );
      renderCameraState();
    },
    onMicrophoneResumed: (stream) => {
      void speakingIndicators.watch(meId(), stream);
    },
    onDevicesChanged: enumerateDevices,
  });

  const publicVoiceActive = () => !!roomState?.voiceActive;
  const detailedPlayers = () => voiceRoster.getSnapshot().participants;
  const inGame = () => !$('gameScreen')?.classList.contains('hidden');
  const communityVoice = () => roomState?.kind === 'chat';
  const inChatHub = () => chatHubMode || !$('chatOnlyScreen')?.classList.contains('hidden');
  const cappedQuality = () => callQuality.getSnapshot().effectiveQuality;
  const effectiveScreenBitrate = () => callQuality.getSnapshot().screenBitrate;
  const qualityProfile = () => callQuality.getSnapshot().profile;
  const transportIsSfu = () => voiceTransport.getSnapshot().mode === 'sfu';
  const transportPending = () =>
    voiceTransport.getSnapshot().mode === 'sfu-pending' ||
    voiceTransport.getSnapshot().mode === 'stopping';
  const announcedTransport = voiceTransport.announced;
  function setStatus(text, kind = '') {
    const el = $('voiceStatus');
    if (el) {
      el.textContent = text;
      el.dataset.kind = kind;
    }
  }
  function setUnreadCount(value) {
    chatUnreadCount = Math.max(0, Number(value) || 0);
    for (const id of ['chatUnread', 'chatOnlyUnread']) {
      const el = $(id);
      if (!el) continue;
      el.textContent = String(chatUnreadCount);
      el.classList.toggle('hidden', chatUnreadCount === 0);
    }
    $('chatOnlyTextBtn')?.classList.toggle('has-unread', chatUnreadCount > 0);
  }
  function updateChatDrawerUI() {
    const hub = inChatHub(),
      panel = $('socialPanel');
    if (hub && chatRoomState?.channelType === 'text') chatDrawerOpen = true;
    if (hub && chatRoomState?.channelType === 'voice') chatDrawerOpen = false;
    panel?.classList.toggle('chat-drawer-open', hub && chatDrawerOpen);
    const chat = panel?.querySelector('.court-chat-section');
    if (chat) {
      chat.hidden = hub && !chatDrawerOpen;
      chat.setAttribute('aria-hidden', String(hub && !chatDrawerOpen));
    }
    for (const id of ['chatOnlyTextBtn', 'mnSidebarTextBtn'])
      $(id)?.setAttribute('aria-expanded', String(hub && chatDrawerOpen));
    $('chatOnlyTextBtn')?.classList.toggle('active', hub && chatDrawerOpen);
    $('chatDrawerCloseBtn')?.classList.toggle('hidden', !hub);
    if (hub && chatDrawerOpen) setUnreadCount(0);
  }
  function toggleTextChat(force) {
    if (!inChatHub()) {
      showPanel(typeof force === 'boolean' ? force : !panelOpen);
      return;
    }
    chatDrawerOpen = typeof force === 'boolean' ? force : !chatDrawerOpen;
    updateChatDrawerUI();
    if (chatDrawerOpen) {
      setUnreadCount(0);
      setTimeout(() => $('courtChatInput')?.focus(), 80);
    }
  }
  function toggleTelemetry(force) {
    telemetryOpen = typeof force === 'boolean' ? force : !telemetryOpen;
    $('telemetryPanel')?.classList.toggle('hidden', !telemetryOpen);
    $('telemetryOpenBtn')?.setAttribute('aria-expanded', String(telemetryOpen));
    window.dispatchEvent(
      new CustomEvent('trono-telemetry-change', { detail: { open: telemetryOpen } }),
    );
    renderTelemetry();
    voiceTelemetry.start();
  }
  function ensureLocalStream() {
    if (!localStream) localStream = new MediaStream();
    return localStream;
  }
  function playCallSound(kind = 'join', id = 'local') {
    callAlerts.play(kind, id);
  }
  function callNotice(event) {
    window.TronoCommunity?.voiceNotice?.(event);
  }
  function toggleVoiceSettings(force) {
    window.TronoCallSettings.toggle(force);
  }
  function setSettingsTab(tab = 'audio') {
    window.TronoCallSettings.select(tab);
  }
  function updateQualityUI() {
    voiceSettings.refresh();
    updateRealtimeUI();
  }
  function updateRealtimeUI() {
    const card = $('realtimeInfraCard'),
      mode = $('realtimeModeLabel'),
      usage = $('realtimeUsageLabel'),
      bar = $('realtimeUsageBar'),
      policy = $('realtimePolicyLabel');
    if (!card) return;
    const r = realtime.getSnapshot().status;
    const modeState = voiceCall.getSnapshot().joined
      ? announcedTransport()
      : voiceTransport.getSnapshot().mode;
    card.classList.toggle('realtime-live', modeState === 'sfu');
    card.classList.toggle('realtime-warning', !!r?.softWarning);
    card.classList.toggle('realtime-blocked', !!r?.hardBlocked);
    if (mode) {
      if (!inChatHub()) mode.textContent = 'WebRTC P2P (partida)';
      else if (modeState === 'sfu') mode.textContent = 'Cloudflare SFU';
      else if (modeState === 'sfu-pending') mode.textContent = 'Conectando ao SFU…';
      else if (!voiceCall.getSnapshot().joined && r?.enabled && r?.configured && !r?.hardBlocked)
        mode.textContent = 'Cloudflare SFU pronto';
      else mode.textContent = 'WebRTC P2P (fallback)';
    }
    if (usage)
      usage.textContent = r
        ? `${Number(r.estimatedGb || 0).toFixed(2)} / ${Number(r.thresholds?.hard || 950).toFixed(0)} GB estimados • margem ${Number(r.estimateSafetyFactor || 1).toFixed(1)}×`
        : realtime.getSnapshot().error || 'Aguardando dados do backend';
    if (bar) {
      const hard = Number(r?.thresholds?.hard || 950),
        v = Math.min(100, Math.max(0, (Number(r?.estimatedGb || 0) / hard) * 100));
      bar.style.setProperty('--realtime-progress', `${v}%`);
      bar.setAttribute('aria-valuenow', String(Math.round(v)));
    }
    if (policy) {
      if (!r)
        policy.textContent = realtime.getSnapshot().error
          ? 'Não foi possível sincronizar o freio de consumo. O SFU não será assumido como disponível até nova confirmação.'
          : 'Freio de consumo aguardando sincronização.';
      else if (!r.configured) policy.textContent = 'SFU não configurado no backend.';
      else if (!r.enabled) policy.textContent = 'Kill switch desligado: mídia permanece em P2P.';
      else if (r.hardBlocked) policy.textContent = 'Limite de segurança atingido: SFU bloqueado.';
      else if (!r.screenAllowed)
        policy.textContent = 'Economia crítica: compartilhamento de tela bloqueado.';
      else if (!r.highAllowed) policy.textContent = 'Economia automática: máximo Equilibrada.';
      else policy.textContent = 'Proteção ativa • tela até 1080p/60 permitida.';
    }
    updateTelemetryHeader();
  }
  function applySenderQuality(sender, kind) {
    return callQuality.applySender(sender, kind);
  }
  function applyQualityToLiveMedia() {
    return callQuality.applyAll().finally(() => voiceSettings.refresh());
  }
  function preferredRidForMedia(kind, maximized = false) {
    return callQuality.preferredRid(kind, maximized);
  }
  async function setSfuTileLayer(tile, maximized) {
    if (!transportIsSfu() || !tile) return;
    const kind = tile.classList.contains('screen-share-tile')
      ? 'screen'
      : tile.classList.contains('camera-tile')
        ? 'camera'
        : null;
    if (!kind) return;
    const peerId = tile.dataset.peer;
    if (!peerId || peerId === meId()) return;
    const sub = sfuSubscriptions.get(sfuKey(peerId, kind));
    if (!sub) return;
    const requested = preferredRidForMedia(kind, maximized);
    try {
      await sfuSession.setLayer(sub.key, requested);
    } catch (err) {
      console.warn('[TronoSocial] qualidade ao maximizar', kind, err.code || err);
    }
  }
  async function toggleMediaFullscreen(tile) {
    if (!tile) return;
    const video = tile.querySelector('video'),
      wasMax = tile.classList.contains('media-maximized') || document.fullscreenElement === tile;
    window.TronoMosaic?.close();
    if (!wasMax && tile.classList.contains('screen-share-tile')) {
      if (tile.dataset.peer === meId()) {
        screenSharingControls.resetPreview();
      } else tile.dataset.collapsed = '0';
      renderScreenGrid();
    }
    if (wasMax && !document.fullscreenElement) {
      tile.classList.remove('media-maximized');
      document.body.classList.remove('media-focus-open');
      await setSfuTileLayer(tile, false);
      return;
    }
    const old = document.querySelector('.media-maximized');
    if (old) {
      old.classList.remove('media-maximized');
      document.body.classList.remove('media-focus-open');
      void setSfuTileLayer(old, false);
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        await setSfuTileLayer(tile, false);
        return;
      }
      if (tile.requestFullscreen) {
        await tile.requestFullscreen();
        await setSfuTileLayer(tile, true);
        return;
      }
      if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
        await setSfuTileLayer(tile, true);
        return;
      }
    } catch (err) {
      console.warn('[TronoSocial] tela cheia', err);
    }
    tile.classList.add('media-maximized');
    document.body.classList.add('media-focus-open');
    await setSfuTileLayer(tile, true);
  }
  function fullscreenMedia(peerId, kind = 'screen') {
    const tiles = document.querySelectorAll(
      kind === 'camera' ? '#socialPanel .camera-tile' : '#screenShareGrid .screen-share-tile',
    );
    const tile = [...tiles].find((t) => t.dataset.peer === peerId);
    if (tile) return toggleMediaFullscreen(tile);
  }
  function bindMediaFullscreen(tile) {
    if (!tile || tile.dataset.fullscreenBound) return;
    tile.dataset.fullscreenBound = '1';
    tile.querySelector('.media-fullscreen-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMediaFullscreen(tile);
    });
    tile.querySelector('video')?.addEventListener('dblclick', () => toggleMediaFullscreen(tile));
  }
  const FLOATING_RECT_KEY = 'tronoSocialFloatingRectV3';
  function readFloatingRect() {
    try {
      return JSON.parse(storage.getItem(FLOATING_RECT_KEY) || 'null');
    } catch {
      return null;
    }
  }
  function persistFloatingRect() {
    const panel = $('socialPanel');
    if (!panel || panelMode !== 'floating' || inChatHub()) return;
    const r = panel.getBoundingClientRect();
    storage.setItem(
      FLOATING_RECT_KEY,
      JSON.stringify({
        left: Math.round(r.left),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }),
    );
  }
  function clearFloatingInlineStyles() {
    const panel = $('socialPanel');
    if (!panel) return;
    for (const k of ['left', 'top', 'right', 'bottom', 'width', 'height']) panel.style[k] = '';
  }
  function restoreFloatingRect() {
    const panel = $('socialPanel');
    if (!panel || panelMode !== 'floating' || inChatHub() || innerWidth <= 760) return;
    const saved = readFloatingRect();
    if (!saved) return;
    const width = Math.max(280, Math.min(Number(saved.width) || 360, 460, innerWidth - 16)),
      height = Math.max(220, Math.min(Number(saved.height) || 360, 560, innerHeight - 16));
    const left = Math.max(0, Math.min(Number(saved.left) || 0, innerWidth - width)),
      top = Math.max(0, Math.min(Number(saved.top) || 0, innerHeight - height));
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function applyPanelMode() {
    const panel = $('socialPanel'),
      modeBtn = $('socialModeBtn');
    if (!panel) return;
    const hub = inChatHub();
    panel.classList.toggle('social-chat-hub', hub);
    panel.classList.remove('social-full');
    panel.classList.toggle('social-floating', !hub && panelMode === 'floating');
    if (modeBtn) {
      modeBtn.classList.toggle('hidden', hub);
      modeBtn.textContent = 'Ampliar';
      modeBtn.title = 'Ampliar câmeras e telas da chamada';
    }
    clearFloatingInlineStyles();
    if (!hub && panelMode === 'floating') restoreFloatingRect();
    storage.setItem('tronoSocialMode', panelMode);
    renderVideoGrid();
    renderScreenGrid();
    renderSeatMedia();
  }
  function clearChannelChat() {
    window.TronoChatMessages.clear();
    setUnreadCount(0);
    toggleTextChat(false);
  }
  function setChatHubMode(active) {
    chatHubMode = !!active;
    if (!chatHubMode) document.body.classList.remove('channel-text-active', 'channel-voice-active');
    document.body.classList.toggle('chat-only-active', chatHubMode);
    if (chatHubMode) chatDrawerOpen = chatRoomState?.channelType === 'text';
    applyPanelMode();
    updateChatDrawerUI();
    updateButtons();
    updateTelemetryHeader();
    if (chatHubMode) showPanel(true);
  }
  function togglePanelMode() {
    if (inChatHub()) return;
    window.TronoMosaic?.open();
  }
  function showPanel(show = true) {
    panelOpen = !!show;
    const panel = $('socialPanel');
    panel?.classList.toggle('social-hidden', !panelOpen);
    $('socialBtn')?.classList.toggle('music-active', panelOpen);
    $('roomSocialBtn')?.classList.toggle('ready-active', panelOpen);
    $('chatOnlyOpenSocialBtn')?.classList.toggle('hidden', panelOpen);
    const canDock = !panelOpen && !inChatHub() && panel && !panel.classList.contains('hidden');
    $('socialMiniDock')?.classList.toggle('hidden', !canDock);
    if (panelOpen && !inChatHub()) markRead();
    renderSeatMedia();
  }
  function showForRoom(show = true) {
    $('socialPanel')?.classList.toggle('hidden', !show);
    if (show) showPanel(true);
    else {
      showPanel(false);
      toggleVoiceSettings(false);
    }
  }

  function markRead() {
    setUnreadCount(0);
  }
  function bumpUnread() {
    const visible = inChatHub() ? chatDrawerOpen : panelOpen;
    if (visible || chatMuted) return;
    setUnreadCount(chatUnreadCount + 1);
  }
  function updatePublicPresence() {
    const active = publicVoiceActive(),
      roomBtn = $('roomSocialBtn'),
      topBtn = $('socialBtn');
    if (roomBtn)
      roomBtn.innerHTML = active
        ? '💬 Comunicação <span class="call-presence">🎙 Em call</span>'
        : '💬 Comunicação';
    if (topBtn) {
      const unread = chatUnreadCount;
      topBtn.innerHTML = `💬 Chat${active ? ' <span class="call-presence">🎙 Em call</span>' : ''} <span id="chatUnread" class="chat-unread ${unread ? '' : 'hidden'}">${esc(unread)}</span>`;
    }
  }

  function onChatActivity(activity) {
    if (activity.type === 'read') {
      markRead();
      return;
    }
    const message = activity.message;
    const mine = message.accountId
      ? message.accountId === window.TronoAuth?.user?.id
      : message.senderId === meId();
    if (!mine) {
      bumpUnread();
      if (!chatMuted) playCallSound('message', 'text');
    }
  }
  function toggleTextMute() {
    chatMuted = !chatMuted;
    storage.setItem('tronoChatMuted', chatMuted ? '1' : '0');
    const b = $('muteTextBtn');
    if (b) {
      b.textContent = chatMuted ? 'Ativar chat' : 'Silenciar chat';
      b.classList.toggle('danger-active', chatMuted);
    }
    if (chatMuted) markRead();
  }
  const toggleWatchCamera = (id) => mediaInterest.toggleCamera(id);

  function enumerateDevices() {
    return voiceSettings.enumerate();
  }

  function acquireMic(options) {
    return microphone.acquire(options);
  }
  function refreshMicPipeline() {
    updateNoiseButton();
    return voiceCall.getSnapshot().joined ? microphone.refresh() : Promise.resolve();
  }

  function acquireCamera() {
    return cameraCapture.acquire();
  }
  function renderCameraState() {
    updateButtons();
    renderVideoGrid();
    renderSeatMedia();
    renderVoiceRoster();
  }
  function startScreenShare(options) {
    return screenSharingControls.start(options);
  }
  function switchScreenShare() {
    return screenSharingControls.switchSource();
  }
  function stopScreenShare(sendState = true) {
    return screenSharingControls.stop(sendState);
  }
  function openScreenOptions() {
    screenSharingBindings.open();
  }

  function closePeer(id) {
    if (!p2pPeers.close(id)) clearPeerMedia(id);
  }
  function clearPeerMedia(id, pc) {
    for (const r of pc?.getReceivers?.() || []) voiceTelemetry.removeReceiver(r);
    speakingIndicators.remove(id);
    removeRemoteAudio(id);
    removeRemoteAudio(streamAudioKey(id));
    remoteMedia.clear(id);
    renderVideoGrid();
    renderScreenGrid();
    renderSeatMedia();
  }
  function closeAllPeers() {
    [...peers.keys()].forEach(closePeer);
  }
  function sfuKey(ownerId, kind) {
    return `${ownerId}:${kind}`;
  }
  function attachSfuRemoteTrack(pub, track, sub, receiver, isCurrent) {
    remoteMedia.attachSubscription({
      id: pub.ownerId,
      kind: pub.kind,
      track,
      owner: sub,
      receiver,
      isCurrent,
    });
  }
  function detachSfuRemoteMedia(sub) {
    for (const receiver of sub.pc.getReceivers()) voiceTelemetry.removeReceiver(receiver);
    remoteMedia.detachSubscription(sub);
    if (sub.kind === 'audio') {
      removeRemoteAudio(sub.publisherId);
      speakingIndicators.remove(sub.publisherId);
    }
    if (sub.kind === 'screen-audio') removeRemoteAudio(streamAudioKey(sub.publisherId));
  }
  function reportSfuRetry({ publication: pub, code, stale, attempt }) {
    const label = pub.kind === 'screen' ? 'Tela' : pub.kind === 'camera' ? 'Câmera' : 'Áudio';
    lastSfuError = `${label}: ${code}`;
    if (pub.kind !== 'audio' && attempt >= 4) {
      setStatus(`${label} não conectou. A voz continua pelo SFU.`, 'warn');
      renderTelemetry();
      return;
    }
    let message = stale
      ? `${label} SFU foi atualizado enquanto conectava. Ressincronizando a publicação…`
      : `${label} SFU reconectando… (${code}).`;
    if (
      !stale &&
      !realtime.getSnapshot().turn &&
      ['SFU_CONNECT_TIMEOUT', 'NETWORK_CLOSED', 'NETWORK_OFFLINE'].includes(code)
    )
      message += ' A rota ICE falhou; TURN pode ajudar em redes móveis/CGNAT.';
    setStatus(message, 'warn');
    renderTelemetry();
  }
  function updateAllSfuSubscriptionLayers() {
    return callQuality.applyLayers();
  }
  async function applyRealtimeStatus(status, isCurrent) {
    const call = voiceCall.getSnapshot().generation;
    const current = () => isCurrent() && call === voiceCall.getSnapshot().generation;
    if (!current()) return;
    if (transportIsSfu() && (!status.enabled || status.hardBlocked)) {
      await fallbackToP2p(
        status.hardBlocked
          ? 'Limite de segurança atingido; mídia voltou ao P2P.'
          : 'Cloudflare Realtime foi desligado; mídia voltou ao P2P.',
      );
      return;
    }
    if (transportIsSfu() && !status.screenAllowed && screenSharing()) await stopScreenShare(true);
    if (!current()) return;
    if (
      transportIsSfu() &&
      status.maxQuality &&
      QUALITY_ORDER.indexOf(qualityPreferences().transmissionQuality) >
        QUALITY_ORDER.indexOf(status.maxQuality)
    ) {
      callQuality.selectQuality(status.maxQuality);
      updateQualityUI();
      await applyQualityToLiveMedia();
      if (!current()) return;
      setStatus(`Freio de consumo reduziu a transmissão para ${qualityProfile().label}.`, 'warn');
    }
  }

  async function recoverRemoteMedia(id, missing, isCurrent) {
    if (!isCurrent()) return false;
    if (transportIsSfu()) {
      const generation = sfuSession.getGeneration(),
        keys = [];
      if (missing.camera) keys.push(sfuKey(id, 'camera'));
      if (missing.screen) keys.push(sfuKey(id, 'screen'));
      let retry = false;
      for (const key of keys) {
        const sub = sfuSubscriptions.get(key);
        // Give pending negotiations and initial frames their existing grace period.
        if (!sub || sub.negotiating || !sub.readyAt || Date.now() - sub.readyAt < 8000) {
          retry = true;
          continue;
        }
        void closeSfuSubscription(key);
      }
      if (!keys.every((key) => sfuSubscriptions.has(key))) await refreshSfuPublicationList();
      if (!isCurrent() || !transportIsSfu() || generation !== sfuSession.getGeneration())
        return false;
      void syncSfuSubscriptions();
      return retry;
    }
    if (peers.has(id)) {
      p2pPeers.negotiate(id, true, true);
      setStatus('Ressincronizando mídia da chamada...', 'warn');
    }
    return false;
  }

  function peerStatus(status) {
    if (status === 'connected') setStatus('Voz conectada. Malha P2P sincronizada.', 'ok');
    if (status === 'reconnecting') setStatus('Reconectando mídia da chamada...', 'warn');
    if (status === 'offer-timeout')
      setStatus(
        'A outra ponta ainda não respondeu à conexão de áudio. Tentando restabelecer a chamada…',
        'warn',
      );
    if (status === 'connection-timeout')
      setStatus(
        realtime.getSnapshot().turn
          ? 'Não foi possível conectar o áudio com este participante. Saia e entre na voz para tentar novamente.'
          : 'P2P sem rota de áudio. Verifique TURN em Configurações → Conexão.',
        'error',
      );
  }

  function syncPeers() {
    voiceRoster.sync();
  }
  function renderCallMedia() {
    renderVoiceRoster();
    renderVideoGrid();
    renderScreenGrid();
    renderSeatMedia();
  }

  function voiceStatusIcons(muted, silenced) {
    const icon = (label, path) =>
      `<span class="participant-status-icon" role="img" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}<path d="M3 3l18 18"/></svg></span>`;
    return (
      (muted
        ? icon(
            'Microfone mutado',
            '<path d="M9 9v3a3 3 0 005 2M15 9V5a3 3 0 00-6 0M5 10v2a7 7 0 0012 5M19 12v-2M12 19v3M8 22h8"/>',
          )
        : '') +
      (silenced
        ? icon(
            'Áudio da chamada silenciado',
            '<path d="M4 13v-1a8 8 0 0113-6M20 12v5M4 13H2v7h5v-7H4M20 13h2v7h-5v-3"/>',
          )
        : '')
    );
  }
  function renderVoiceStatus(host, muted, silenced) {
    if (!host) return;
    const html = voiceStatusIcons(muted, silenced);
    if (host.innerHTML !== html) host.innerHTML = html;
    host.hidden = !html;
  }
  function personVoiceSummary(p) {
    const self = p.id === meId(),
      muted = self ? controlState().micMuted : !!p.muted,
      cam = self ? cameraOn() : !!p.camera,
      screen = self ? screenSharing() : !!p.screen,
      transport = self ? announcedTransport() : p.transport || 'p2p';
    return (
      (muted ? 'microfone mutado' : speakingIndicators.isSpeaking(p.id) ? 'falando…' : 'na voz') +
      ((self ? controlState().deafened : p.deafened) ? ' • áudio silenciado' : '') +
      (cam ? (mediaInterest.isCameraHidden(p.id) ? ' • câmera oculta' : ' • 📷 câmera') : '') +
      (screen ? ' • 🖥 tela' : '') +
      (transport === 'sfu' ? ' • ☁ SFU' : transport === 'sfu-pending' ? ' • conectando…' : '')
    );
  }
  function cameraInProfile(id) {
    const mode = profileMedia.get(id) || 'auto';
    return mode === 'camera' || mode === 'auto';
  }
  function screenInProfile(id) {
    return profileMedia.get(id) === 'screen';
  }
  function setProfileMedia(id, value) {
    if (!['auto', 'camera', 'screen', 'stage'].includes(value)) return;
    profileMedia.set(id, value);
    renderVoiceRoster();
    renderScreenGrid();
  }
  function camerasInProfiles() {
    return (
      inChatHub() &&
      voiceCall.getSnapshot().joined &&
      detailedPlayers().some((p) => (p.id === meId() ? screenSharing() : p.screen))
    );
  }
  function renderVoiceRoster() {
    const host = $('voiceRoster');
    if (!host) return;
    const stage = host.closest('.mn-media-stage');
    stage?.classList.toggle(
      'has-screen',
      voiceCall.getSnapshot().joined &&
        detailedPlayers().some(
          (p) =>
            !screenInProfile(p.id) &&
            (p.id === meId() ? screenSharing() : p.screen && mediaInterest.isWatching(p.id)),
        ),
    );
    stage?.classList.toggle(
      'has-camera',
      voiceCall.getSnapshot().joined &&
        detailedPlayers().some((p) =>
          p.id === meId() ? cameraOn() : p.camera && !mediaInterest.isCameraHidden(p.id),
        ),
    );
    stage?.classList.toggle('screens-layout', camerasInProfiles());
    stage?.classList.toggle(
      'room-idle',
      voiceCall.getSnapshot().joined &&
        !detailedPlayers().some((p) =>
          p.id === meId()
            ? cameraOn() || screenSharing()
            : (p.camera && !mediaInterest.isCameraHidden(p.id)) || p.screen,
        ),
    );
    const title = stage?.querySelector('.mosaic-toolbar strong');
    if (title)
      title.textContent = stage.classList.contains('room-idle') ? 'Na chamada' : 'Câmeras & telas';
    const roomName = roomState?.name || (inChatHub() ? 'Geral' : 'Voz da mesa');
    if ($('mnStageRoomName')) $('mnStageRoomName').textContent = roomName;
    if ($('textVoiceRoomName')) $('textVoiceRoomName').textContent = 'Voz conectada · ' + roomName;
    if (!voiceCall.getSnapshot().joined) {
      const active = publicVoiceActive();
      host.classList.add('voice-roster-private');
      for (const video of host.querySelectorAll('video')) video.srcObject = null;
      host.innerHTML = active
        ? '<div class="voice-privacy-note"><span>🎙️</span><strong>Há alguém na chamada</strong><small>Entre na voz para ver participantes, câmeras e microfones.</small></div>'
        : '<div class="voice-privacy-note"><span>○</span><strong>Ninguém na chamada</strong><small>Entre na voz quando quiser conversar.</small></div>';
      return;
    }
    host.classList.remove('voice-roster-private');
    host.querySelector('.voice-privacy-note')?.remove();
    const me = meId(),
      players = detailedPlayers(),
      desired = new Set(players.map((p) => p.id));
    for (const old of [...host.querySelectorAll('.voice-person')])
      if (!desired.has(old.dataset.peer)) {
        for (const video of old.querySelectorAll('video')) video.srcObject = null;
        old.remove();
      }
    for (const p of players) {
      const self = p.id === me,
        muted = self ? controlState().micMuted : !!p.muted,
        silenced = self ? controlState().deafened : !!p.deafened,
        cam = self ? cameraOn() : !!p.camera,
        screen = self ? screenSharing() : !!p.screen,
        speaking = !muted && speakingIndicators.isSpeaking(p.id),
        transport = self ? announcedTransport() : p.transport || 'p2p',
        hidden = mediaInterest.isCameraHidden(p.id);
      let card = findPeerTile(host, p.id, '.voice-person');
      if (!card) {
        card = document.createElement('div');
        card.className = 'voice-person joined';
        card.dataset.peer = p.id;
        card.innerHTML =
          '<div class="participant-camera-slot" hidden></div><div class="participant-screen-slot" hidden></div><span class="mn-person-avatar"></span><strong></strong><div class="participant-meta"><small class="participant-caption"></small><small class="participant-activity" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 8h10a3 3 0 013 2l2 8a2 2 0 01-3 2l-4-3H9l-4 3a2 2 0 01-3-2l2-8a3 3 0 013-2Z"/><path d="M6 12h4m-2-2v4M16 11h.01M18 14h.01"/></svg><span></span></small><span class="participant-voice-status" hidden></span></div><small class="participant-summary"></small><button class="participant-camera-toggle" type="button" hidden></button><label class="participant-media-layout" hidden><span>Exibição</span><select aria-label="Exibição da mídia"><option value="auto">Automática</option><option value="camera">Câmera no perfil</option><option value="screen">Tela no perfil</option><option value="stage">Mídia ampliada</option></select></label>';
        const details = document.createElement('div');
        details.className = 'participant-details';
        details.hidden = true;
        details.id = 'participant-details-' + p.id;
        if (typeof details.showPopover === 'function') details.setAttribute('popover', 'auto');
        const heading = document.createElement('strong');
        heading.className = 'participant-popup-name';
        heading.textContent = p.name;
        details.append(heading);
        for (const selector of [
          '.participant-summary',
          '.participant-camera-toggle',
          '.participant-media-layout',
        ])
          details.append(card.querySelector(selector));
        card.append(details);
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'participant-expand';
        expand.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
        expand.setAttribute('aria-expanded', 'false');
        expand.setAttribute('aria-controls', details.id);
        expand.onclick = () => {
          const on = !card.classList.contains('participant-expanded');
          card.classList.toggle('participant-expanded', on);
          expand.setAttribute('aria-expanded', String(on));
          if (on) {
            details.hidden = false;
            if (details.showPopover) {
              details.showPopover();
              positionProfileControls(card, details);
            }
          } else if (details.hidePopover) details.hidePopover();
          else details.hidden = true;
        };
        details.addEventListener('toggle', (event) => {
          if (event.newState === 'closed') {
            details.hidden = true;
            card.classList.remove('participant-expanded');
            expand.setAttribute('aria-expanded', 'false');
          }
        });
        card.append(expand);
        card.querySelector('.participant-media-layout select').onchange = (event) =>
          setProfileMedia(p.id, event.target.value);
        if (!self) {
          const label = document.createElement('label');
          label.className = 'mn-peer-gain';
          label.innerHTML =
            '<span>Volume</span><input type="range" min="0" max="300" step="5"><output></output>';
          label.querySelector('input').dataset.peerVolume = p.id;
          label.querySelector('input').setAttribute('aria-label', 'Volume de ' + p.name);
          details.appendChild(label);
        }
        host.appendChild(card);
      }
      card.classList.toggle('speaking', speaking);
      const dock = cameraInProfile(p.id) && cam && !hidden,
        screenDock = screenInProfile(p.id) && screen && (self || mediaInterest.isWatching(p.id));
      card.classList.toggle('camera-in-profile', dock);
      card.querySelector('.participant-camera-slot').hidden = !dock;
      card.querySelector('.participant-screen-slot').hidden = !screenDock;
      card.classList.toggle('media-in-profile', dock || screenDock);
      const layout = card.querySelector('.participant-media-layout');
      layout.hidden = !cam && !screen;
      const select = layout.querySelector('select');
      select.value = profileMedia.get(p.id) || 'auto';
      select.setAttribute('aria-label', 'Exibição da mídia de ' + p.name);
      select.querySelector('[value=camera]').disabled = !cam;
      select.querySelector('[value=screen]').disabled = !screen;
      card.dataset.accountId =
        p.accountId || (p.id === meId() ? window.TronoAuth.user?.id : '') || '';
      const avatar = card.querySelector('.mn-person-avatar'),
        signature = JSON.stringify([p.name, p.avatar_preset, p.avatar_file_id]);
      if (avatar.dataset.signature !== signature) {
        avatar.dataset.signature = signature;
        avatar.dataset.color = String(
          [...String(p.id)].reduce((v, c) => v + c.charCodeAt(0), 0) % 4,
        );
        avatar.innerHTML =
          (window.TronoProfile?.avatarHtml(p) ||
            esc(
              String(p.name || 'M')
                .slice(0, 2)
                .toUpperCase(),
            )) + '<i class="participant-online-dot" aria-label="Online" title="Online"></i>';
      }
      card.querySelector('.participant-popup-name').textContent = p.name;
      const expand = card.querySelector('.participant-expand');
      expand.title =
        (card.classList.contains('participant-expanded') ? 'Recolher' : 'Expandir') +
        ' perfil de ' +
        p.name;
      expand.setAttribute('aria-label', expand.title);
      renderVoiceStatus(card.querySelector('.participant-voice-status'), muted, silenced);
      card.querySelector(':scope > strong').textContent = p.name;
      card.querySelector(':scope > strong').title = p.name + (self ? ' (você)' : '');
      card.querySelector('.participant-caption').textContent =
        (self ? 'Você · ' : '') + (silenced ? 'Áudio silenciado' : muted ? 'Mic mutado' : 'Na voz');
      card.querySelector('.participant-summary').textContent = personVoiceSummary(p);
      const toggle = card.querySelector('.participant-camera-toggle');
      toggle.hidden = self || !cam;
      toggle.textContent = hidden ? 'Mostrar câmera' : 'Ocultar câmera';
      toggle.setAttribute('aria-label', (hidden ? 'Mostrar' : 'Ocultar') + ' câmera de ' + p.name);
      toggle.setAttribute('aria-pressed', String(hidden));
      toggle.title = 'Esta preferência muda apenas o que você vê.';
      if (!self) {
        card.querySelector('[data-peer-volume]').value = String(audioPlayback.getGain(p.id));
        card.querySelector('output').textContent = audioPlayback.getGain(p.id) + '%';
      }
    }
    renderProfileActivities();
    window.TronoProfile?.hydrate(host);
    window.TronoProfile?.callBackgrounds(host);
    renderVideoGrid();
  }

  function positionProfileControls(card, details) {
    const anchor = card.querySelector('.participant-expand').getBoundingClientRect(),
      top = window.TronoDesktop
        ? ($('desktopTopBar')?.getBoundingClientRect().bottom || 0) + 12
        : 12,
      bottom = window.TronoDesktop
        ? ($('desktopCallDock')?.getBoundingClientRect().top || innerHeight) - 12
        : innerHeight - 12;
    details.style.maxHeight = Math.max(100, bottom - top) + 'px';
    const popup = details.getBoundingClientRect();
    details.style.left =
      Math.max(12, Math.min(anchor.right - popup.width, innerWidth - popup.width - 12)) + 'px';
    details.style.top =
      Math.max(top, Math.min(anchor.top - popup.height - 8, bottom - popup.height)) + 'px';
  }
  function repositionProfileControls() {
    for (const details of $('voiceRoster')?.querySelectorAll(
      '.voice-person.participant-expanded .participant-details[popover]',
    ) || [])
      positionProfileControls(details.closest('.voice-person'), details);
  }
  function renderProfileActivities() {
    for (const card of $('voiceRoster')?.querySelectorAll('.voice-person') || []) {
      const p = privateVoiceRoster.get(card.dataset.peer),
        accountId = p?.accountId || (p?.id === meId() ? window.TronoAuth?.user?.id : null),
        activity = profileActivities.get(accountId),
        row = card.querySelector('.participant-activity');
      row.hidden = !activity;
      row.querySelector('span').textContent = activity?.name || '';
      row.title = activity ? 'Atividade: ' + activity.name : '';
      card.querySelector('.participant-caption').hidden = !!activity;
      card.classList.toggle('has-activity', !!activity);
    }
  }
  function cameraStreamForPerson(p) {
    return p.id === meId() ? localStream : remoteMedia.recover(p.id).av;
  }
  function screenStreamForPerson(p) {
    return p.id === meId()
      ? screenCapture.getCapture()?.outgoing
      : remoteMedia.recover(p.id).screen;
  }
  function personHasLiveCamera(p) {
    const stream = cameraStreamForPerson(p);
    if (p.id !== meId() && mediaInterest.isCameraHidden(p.id)) return false;
    return p.id === meId()
      ? cameraOn() && !!stream?.getVideoTracks?.().length
      : remoteMedia.videoUsable(p.id, stream, 'camera');
  }
  function personHasLiveScreen(p) {
    const stream = screenStreamForPerson(p);
    return p.id === meId()
      ? screenSharing() && !!stream?.getVideoTracks?.().length
      : remoteMedia.videoUsable(p.id, stream, 'screen');
  }

  function findPeerTile(host, id, selector) {
    return [...host.querySelectorAll(selector)].find((el) => el.dataset.peer === id) || null;
  }
  function updateVideoElement(video, stream) {
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream || null;
    if (stream) video.play().catch(() => {});
  }
  function mediaSizeKey(kind) {
    return `tronoMediaTileSize:${kind}`;
  }
  function bindMediaResize(tile, kind) {
    if (!tile || tile.dataset.mediaResizeBound) return;
    if (inChatHub()) return;
    tile.dataset.mediaResizeBound = '1';
    let grip = tile.querySelector('.media-resize-grip');
    if (!grip) {
      grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'media-resize-grip';
      grip.title = 'Redimensionar';
      grip.setAttribute('aria-label', 'Redimensionar janela');
      grip.textContent = '↘';
      tile.appendChild(grip);
    }
    try {
      const saved = JSON.parse(storage.getItem(mediaSizeKey(kind)) || 'null');
      if (saved?.w && saved?.h && innerWidth > 760) {
        tile.style.width = `${Math.min(saved.w, innerWidth - 80)}px`;
        tile.style.height = `${Math.min(saved.h, innerHeight - 130)}px`;
        tile.style.aspectRatio = 'auto';
        tile.style.justifySelf = 'start';
      }
    } catch {}
    let resize = null;
    grip.addEventListener('pointerdown', (e) => {
      if (!inChatHub() || innerWidth <= 760) return;
      e.stopPropagation();
      const r = tile.getBoundingClientRect();
      resize = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
      grip.setPointerCapture?.(e.pointerId);
      tile.classList.add('media-resizing');
      e.preventDefault();
    });
    grip.addEventListener('pointermove', (e) => {
      if (!resize) return;
      const maxW = Math.max(280, Math.min(innerWidth - 80, 1000)),
        maxH = Math.max(170, Math.min(innerHeight - 130, 680));
      const w = Math.max(240, Math.min(maxW, resize.w + (e.clientX - resize.x))),
        h = Math.max(135, Math.min(maxH, resize.h + (e.clientY - resize.y)));
      tile.style.width = `${w}px`;
      tile.style.height = `${h}px`;
      tile.style.aspectRatio = 'auto';
      tile.style.justifySelf = 'start';
    });
    const stop = () => {
      if (!resize) return;
      resize = null;
      tile.classList.remove('media-resizing');
      const r = tile.getBoundingClientRect();
      storage.setItem(
        mediaSizeKey(kind),
        JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) }),
      );
    };
    grip.addEventListener('pointerup', stop);
    grip.addEventListener('pointercancel', stop);
    grip.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      storage.removeItem(mediaSizeKey(kind));
      tile.style.width = '';
      tile.style.height = '';
      tile.style.aspectRatio = '';
      tile.style.justifySelf = '';
    });
  }

  function renderVideoGrid() {
    const host = $('cameraGrid');
    if (!host) return;
    if (!voiceCall.getSnapshot().joined) {
      host.className = 'camera-grid camera-grid-empty camera-grid-private';
      host.innerHTML =
        '<div class="camera-grid-note">Entre na voz para acessar as câmeras da chamada.</div>';
      return;
    }
    const me = meId(),
      players = detailedPlayers(),
      visible = players.filter((p) =>
        p.id === me ? cameraOn() : p.camera && !mediaInterest.isCameraHidden(p.id),
      ),
      desired = new Set(visible.map((p) => p.id)),
      dock = visible.length ? visible.every((p) => cameraInProfile(p.id)) : camerasInProfiles();
    host.className = `camera-grid ${dock ? 'camera-grid-docked' : visible.length ? '' : 'camera-grid-empty'} ${visible.length === 1 ? 'one-camera' : ''}`;
    host.querySelector('.camera-grid-note')?.remove();
    for (const old of [...$('socialPanel').querySelectorAll('.camera-tile')])
      if (!desired.has(old.dataset.peer)) {
        old.querySelector('video').srcObject = null;
        old.remove();
      }
    for (const p of visible) {
      let tile = findPeerTile($('socialPanel'), p.id, '.camera-tile');
      const card = findPeerTile($('voiceRoster'), p.id, '.voice-person'),
        target =
          cameraInProfile(p.id) && card ? card.querySelector('.participant-camera-slot') : host;
      if (!tile) {
        tile = document.createElement('div');
        tile.className = 'camera-tile camera-live';
        tile.dataset.peer = p.id;
        tile.innerHTML =
          '<video autoplay playsinline muted></video><div class="camera-placeholder">Conectando vídeo…</div><button type="button" class="media-dock-btn" aria-label="Minimizar câmera no perfil">↙</button><button class="media-fullscreen-btn" title="Maximizar câmera" aria-label="Maximizar câmera">⛶</button><span></span>';
        target.appendChild(tile);
        bindMediaFullscreen(tile);
        bindMediaResize(tile, 'camera');
        tile.querySelector('.media-dock-btn').onclick = () =>
          setProfileMedia(p.id, cameraInProfile(p.id) ? 'stage' : 'camera');
      }
      // Keep the same video/track when a screen starts or the roster updates.
      if (
        tile.parentElement !== target &&
        document.fullscreenElement !== tile &&
        !tile.classList.contains('media-maximized')
      )
        target.appendChild(tile);
      const minimize = tile.querySelector('.media-dock-btn');
      minimize.textContent = cameraInProfile(p.id) ? '↗' : '↙';
      minimize.title = cameraInProfile(p.id) ? 'Ampliar câmera' : 'Minimizar câmera no perfil';
      minimize.setAttribute('aria-label', minimize.title);
      bindMediaFullscreen(tile);
      bindMediaResize(tile, 'camera');
      tile.querySelector('span').textContent = p.name + (p.id === me ? ' • você' : '');
      const stream = cameraStreamForPerson(p),
        live = personHasLiveCamera(p),
        video = tile.querySelector('video');
      tile.classList.toggle('has-video', live);
      tile.classList.toggle('speaking', speakingIndicators.isSpeaking(p.id));
      if (live) {
        remoteMedia.cancelRecovery(p.id);
        updateVideoElement(video, stream);
      } else if (p.id !== me) remoteMedia.scheduleRecovery(p.id);
    }
    if (!visible.length && !dock)
      host.innerHTML = '<div class="camera-grid-note">Nenhuma câmera visível nesta chamada.</div>';
  }

  function renderScreenGrid() {
    const host = $('screenShareGrid');
    if (!host) return;
    mediaInterest.prune();
    if (!voiceCall.getSnapshot().joined || !communityVoice()) {
      for (const tile of host.querySelectorAll('.screen-share-tile'))
        window.TronoStreamControls?.dispose(tile);
      host.className = 'screen-share-grid hidden';
      host.innerHTML = '';
      return;
    }
    const me = meId(),
      visible = detailedPlayers().filter((p) => (p.id === me ? screenSharing() : !!p.screen)),
      desired = new Set(visible.map((p) => p.id));
    host.className = `screen-share-grid ${visible.length ? '' : 'screen-share-empty'}`;
    host.querySelector('.screen-share-note')?.remove();
    for (const old of [...$('socialPanel').querySelectorAll('.screen-share-tile')])
      if (!desired.has(old.dataset.peer)) {
        window.TronoStreamControls?.dispose(old);
        const video = old.querySelector('video');
        if (video) video.srcObject = null;
        old.remove();
      }
    for (const p of visible) {
      const self = p.id === me,
        watching = self || mediaInterest.isWatching(p.id);
      const card = findPeerTile($('voiceRoster'), p.id, '.voice-person'),
        target =
          screenInProfile(p.id) && watching && card
            ? card.querySelector('.participant-screen-slot')
            : host;
      let tile = findPeerTile($('socialPanel'), p.id, '.screen-share-tile');
      if (!tile) {
        tile = document.createElement('div');
        tile.className = 'screen-share-tile';
        tile.dataset.peer = p.id;
        tile.innerHTML =
          '<video autoplay playsinline muted></video><div class="screen-share-placeholder">Conectando compartilhamento…</div><div class="mn-stream-invite"><strong></strong><small>Escolha quando abrir a transmissão.</small></div><button class="mn-watch-stream" type="button">Assistir stream</button><button class="media-fullscreen-btn" title="Maximizar compartilhamento" aria-label="Maximizar compartilhamento">⛶</button><button class="screen-collapse-btn" title="Minimizar prévia" aria-label="Minimizar prévia">—</button><button class="screen-resource-btn hidden" title="Ocultar apenas a prévia local sem interromper a transmissão">⚡ Economizar recursos</button><button class="screen-switch-btn" type="button" hidden title="Escolher outra tela ou janela sem encerrar o compartilhamento">⇄ Trocar tela</button><label class="mn-stream-volume"><span>Áudio da stream</span><input type="range" min="0" max="300" step="5" value="100"><output>100%</output></label><small class="mn-stream-audio-state"></small><span class="mn-stream-name"></span>';
        host.appendChild(tile);
        bindMediaFullscreen(tile);
        bindMediaResize(tile, 'screen');
        tile
          .querySelector('.mn-stream-volume input')
          .addEventListener('input', (e) => setStreamGain(p.id, e.target.value));
      }
      if (
        tile.parentElement !== target &&
        document.fullscreenElement !== tile &&
        !tile.classList.contains('media-maximized')
      )
        target.appendChild(tile);
      tile.classList.toggle('stream-invitation', !watching);
      tile.querySelector('.mn-stream-invite strong').textContent = `${p.name} está transmitindo`;
      const watch = tile.querySelector('.mn-watch-stream');
      watch.hidden = self;
      watch.textContent = watching ? 'Parar de assistir' : 'Assistir stream';
      tile.querySelector('.screen-switch-btn').hidden = !self;
      tile.querySelector('.mn-stream-name').textContent =
        `🖥 ${p.name}${self ? ' • você • transmitindo' : ''}`;
      for (const selector of ['.media-fullscreen-btn', '.screen-collapse-btn'])
        tile.querySelector(selector).hidden = !watching;
      const resource = tile.querySelector('.screen-resource-btn');
      resource.classList.toggle('hidden', !self);
      resource.textContent = screenSharingControls.getSnapshot().previewPaused
        ? '👁 Mostrar prévia'
        : '⚡ Economizar recursos';
      const stream = screenStreamForPerson(p),
        live = watching && personHasLiveScreen(p),
        video = tile.querySelector('video');
      const hasAudio =
        stream?.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted) ||
        (!self &&
          sfuSession
            .getPublications()
            .some((pub) => pub.ownerId === p.id && pub.kind === 'screen-audio'));
      const volume = tile.querySelector('.mn-stream-volume');
      volume.hidden = self || !watching;
      volume.querySelector('input').value = String(audioPlayback.getGain(streamAudioKey(p.id)));
      volume.querySelector('input').disabled = !hasAudio;
      volume.querySelector('output').textContent =
        `${audioPlayback.getGain(streamAudioKey(p.id))}%`;
      const soundState = tile.querySelector('.mn-stream-audio-state');
      soundState.hidden = !watching;
      soundState.textContent = hasAudio
        ? 'Áudio da stream disponível'
        : 'Transmissão sem áudio compartilhado';
      tile.classList.toggle('has-video', live);
      tile.classList.toggle(
        'local-preview-paused',
        self && screenSharingControls.getSnapshot().previewPaused,
      );
      const collapsed =
        watching &&
        (self ? screenSharingControls.getSnapshot().collapsed : tile.dataset.collapsed === '1');
      tile.classList.toggle('share-collapsed', collapsed);
      const collapse = tile.querySelector('.screen-collapse-btn');
      collapse.textContent = collapsed ? '▣' : '—';
      collapse.title = collapsed ? 'Restaurar compartilhamento' : 'Minimizar compartilhamento';
      const placeholder = tile.querySelector('.screen-share-placeholder');
      if (!watching) {
        video.pause();
        video.srcObject = null;
      } else if (self && screenSharingControls.getSnapshot().previewPaused) {
        video.pause();
        video.srcObject = null;
        placeholder.innerHTML =
          '<strong>⚡ Economia local ativa</strong><small>Sua tela continua sendo transmitida.</small>';
        tile.classList.add('has-video');
      } else if (live) {
        placeholder.textContent = 'Conectando compartilhamento…';
        updateVideoElement(video, stream);
      } else if (!self) remoteMedia.scheduleRecovery(p.id);
      tile.setAttribute('aria-label', 'Transmissão de ' + p.name);
      window.TronoStreamControls?.update(
        tile,
        live && !collapsed && !(self && screenSharingControls.getSnapshot().previewPaused),
      );
    }
    if (!host.querySelector('.screen-share-tile'))
      host.innerHTML =
        '<div class="screen-share-note">' +
        (visible.length ? 'Transmissões exibidas nos perfis.' : 'Nenhuma tela compartilhada.') +
        '</div>';
  }

  function renderSeatMedia() {
    const host = $('seatMediaLayer');
    if (!host) return;
    for (const video of host.querySelectorAll('video')) video.srcObject = null;
    host.classList.remove('active');
    host.replaceChildren();
  }
  function updateMediaIndicators() {
    const me = meId();
    for (const card of document.querySelectorAll('#voiceRoster .voice-person')) {
      const p = privateVoiceRoster.get(card.dataset.peer);
      if (!p) continue;
      const speaking =
        !(p.id === me ? controlState().micMuted : p.muted) && speakingIndicators.isSpeaking(p.id);
      card.classList.toggle('speaking', speaking);
      const summary = card.querySelector('.participant-summary');
      if (summary) summary.textContent = personVoiceSummary(p);
    }
    for (const tile of document.querySelectorAll('.seat-camera-tile,.camera-tile')) {
      const p = privateVoiceRoster.get(tile.dataset.peer);
      if (!p) continue;
      const muted = p.id === me ? controlState().micMuted : !!p.muted,
        speaking = !muted && speakingIndicators.isSpeaking(p.id);
      tile.classList.toggle('speaking', speaking);
      renderVoiceStatus(
        tile.querySelector('.seat-camera-mic'),
        muted,
        p.id === me ? controlState().deafened : !!p.deafened,
      );
    }
  }

  function prepareCallUi() {
    unlockCallAudio();
    callControls.resetParticipation();
    mediaInterest.reset();
    profileMedia.clear();
  }
  async function showJoinedCall() {
    updateVoiceBackgroundClass();
    void voiceTelemetry.syncPriority();
    voiceTelemetry.start();
    voiceRoster.reset();
    voiceTransport.begin();
    window.TronoNetwork?.setVoiceState(
      true,
      false,
      cameraOn(),
      screenSharing(),
      qualityPreferences().transmissionQuality,
      announcedTransport(),
    );
    playCallSound('join', 'local');
    callNotice({ kind: 'joined', name: 'Você' });
    $('muteMicBtn').disabled = false;
    $('deafenVoiceBtn').disabled = false;
    $('cameraBtn').disabled = false;
    if ($('screenShareBtn')) $('screenShareBtn').disabled = !communityVoice();
    updateButtons();
    updateRealtimeUI();
    setStatus('Conectando o áudio da chamada…', 'warn');
    renderVoiceRoster();
    renderVideoGrid();
    renderScreenGrid();
    renderSeatMedia();
    await speakingIndicators.watch(meId(), localStream);
  }
  function prepareLeaveUi() {
    callQuality.reset();
    if ($('screenOptionsDialog')?.open) $('screenOptionsDialog').close();
    window.TronoMosaic?.close();
    window.TronoNetwork?.setVoiceState(
      false,
      false,
      false,
      false,
      qualityPreferences().transmissionQuality,
      'p2p',
    );
  }
  function showLeftCall(reason, wasInVoice) {
    callControls.cancelPending();
    mediaInterest.reset();
    voiceRoster.reset();
    updateVoiceBackgroundClass();
    void voiceTelemetry.syncPriority();
    updateAudioRecoveryUI();
    screenSharingControls.resetPreview();
    if (wasInVoice) {
      playCallSound(reason === 'disconnect' ? 'disconnect' : 'leave', 'local');
      callNotice({
        kind: reason === 'disconnect' ? 'disconnected' : 'left',
        name: 'Você',
        text:
          reason === 'disconnect' ? 'Você foi desconectado da chamada.' : 'Você saiu da chamada.',
      });
    }
    $('muteMicBtn').disabled = true;
    $('deafenVoiceBtn').disabled = true;
    $('cameraBtn').disabled = false;
    if ($('screenShareBtn')) $('screenShareBtn').disabled = true;
    callControls.resetParticipation();
    updateButtons();
    updateRealtimeUI();
    setStatus('Fora do chat de voz.');
    renderVoiceRoster();
    renderVideoGrid();
    renderScreenGrid();
    renderSeatMedia();
  }
  function noiseState() {
    return callControls.noiseState();
  }
  function updateNoiseButton() {
    updateVoiceLightMode();
    voiceSettings.refresh();
  }
  function updateVoiceLightMode() {
    speakingIndicators.refresh();
    document.body.classList.toggle('voice-light-mode', controlState().voiceLightMode);
  }

  function updateButtons() {
    const m = $('muteMicBtn'),
      d = $('deafenVoiceBtn'),
      c = $('cameraBtn'),
      s = $('screenShareBtn');
    if (m)
      m.innerHTML = `<span class="call-icon">${controlState().micMuted ? '🔇' : '🎙'}</span><span>${controlState().micMuted ? 'Ativar microfone' : 'Mutar microfone'}</span>`;
    if (d)
      d.innerHTML = `<span class="call-icon">${controlState().deafened ? '🔈' : '🔊'}</span><span>${controlState().deafened ? 'Ouvir voz' : 'Silenciar voz'}</span>`;
    if (c)
      c.innerHTML = `<span class="call-icon">${cameraOn() ? '▧' : '▣'}</span><span>${cameraOn() ? 'Desligar câmera' : 'Ligar câmera'}</span>`;
    if (s) {
      s.innerHTML = `<span class="call-icon">${screenSharing() ? '■' : '▤'}</span><span>${screenSharing() ? (window.TronoDesktop ? 'Parar tela' : 'Parar compartilhamento') : 'Compartilhar tela'}</span>`;
      s.title = screenSharing() ? 'Parar compartilhamento' : 'Compartilhar tela';
      s.setAttribute('aria-label', s.title);
      s.disabled = !voiceCall.getSnapshot().joined || !communityVoice();
    }
    $('joinVoiceBtn')?.classList.toggle('call-active', voiceCall.getSnapshot().joined);
    if (m) {
      m.disabled = !voiceCall.getSnapshot().joined || controlState().deafened;
      m.title = controlState().deafened ? 'Ative o áudio da chamada para liberar o microfone.' : '';
    }
    m?.classList.toggle('danger-active', controlState().micMuted);
    d?.classList.toggle('danger-active', controlState().deafened);
    c?.classList.toggle('camera-active', cameraOn());
    s?.classList.toggle('screen-active', screenSharing());
    updateNoiseButton();
    document.body.classList.toggle('call-connected', voiceCall.getSnapshot().joined);
    const eligible = !!roomState && roomState.channelType !== 'text',
      joining = !!voiceCall.getSnapshot().joining && !voiceCall.getSnapshot().joined,
      textOnly =
        inChatHub() &&
        chatRoomState?.channelType === 'text' &&
        !voiceCall.getSnapshot().joined &&
        !eligible,
      j = $('joinVoiceBtn');
    if (j) {
      j.disabled = !eligible || joining;
      const label = joining
        ? 'Conectando…'
        : voiceCall.getSnapshot().joined
          ? 'Sair da voz'
          : 'Entrar na voz';
      if (j.lastElementChild?.textContent !== label)
        j.innerHTML = '<span class="call-icon">☎</span><span>' + label + '</span>';
      j.classList.toggle('call-joining', joining);
    }
    if (d) d.disabled = !voiceCall.getSnapshot().joined;
    if (c)
      c.disabled =
        textOnly ||
        joining ||
        (!cameraOn() &&
          (controlState().cameraTogglePending || !!cameraCapture.getSnapshot().loading)) ||
        (document.body.dataset.appLayout === 'discord' && !voiceCall.getSnapshot().joined);
    for (const [button, on] of [
      [m, controlState().micMuted],
      [d, controlState().deafened],
      [c, cameraOn()],
      [s, screenSharing()],
    ])
      button?.setAttribute('aria-pressed', String(on));
    window.dispatchEvent(
      new CustomEvent('trono-call-change', {
        detail: {
          joined: voiceCall.getSnapshot().joined,
          joining,
          deafened: controlState().deafened,
          roomId: roomState?.id,
        },
      }),
    );
  }
  function consumeChatRoom(room) {
    if (room?.id !== chatRoomState?.id) chatDrawerOpen = room?.channelType === 'text';
    chatRoomState = room || null;
    document.body.classList.toggle(
      'channel-text-active',
      inChatHub() && room?.channelType === 'text',
    );
    document.body.classList.toggle(
      'channel-voice-active',
      inChatHub() && room?.channelType === 'voice',
    );
    if (room || voiceCall.getSnapshot().joined) showForRoom(true);
    if (inChatHub() && room?.channelType === 'text') toggleTextChat(true);
    updateChatDrawerUI();
    updateButtons();
  }
  function consumeRoom(room) {
    roomState = room || null;
    voiceTransport.setRoom(roomState?.id ?? null);
    voiceRoster.setRoom(roomState?.id ?? null);
    if (roomState) showForRoom(true);
    else if (!voiceCall.getSnapshot().joined) {
      voiceRoster.reset();
      closeAllPeers();
      if (transportIsSfu() || transportPending()) voiceTransport.reset();
    }
    if (!room || room.id === window.TronoNetwork.currentRoom) consumeChatRoom(room);
    updateButtons();
    updatePublicPresence();
    renderVoiceRoster();
    renderVideoGrid();
    renderScreenGrid();
    renderSeatMedia();
  }

  function allTelemetryPeerConnections() {
    const list = [];
    for (const [id, pc] of peers)
      if (pc && pc.connectionState !== 'closed') list.push([`p2p:${id}`, pc]);
    for (const [kind, pub] of sfuLocalPublications)
      if (pub?.pc && pub.pc.connectionState !== 'closed') list.push([`sfu-pub:${kind}`, pub.pc]);
    for (const [key, sub] of sfuSubscriptions)
      if (sub?.pc && sub.pc.connectionState !== 'closed') list.push([`sfu-sub:${key}`, sub.pc]);
    return list;
  }
  function formatRate(v) {
    if (!Number.isFinite(v) || v <= 0) return '—';
    if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)} Mbps`;
    return `${Math.round(v / 1000)} Kbps`;
  }
  function formatResolution(w, h) {
    return w && h ? `${w}×${h}` : '—';
  }
  function limiterLabel(reason) {
    return (
      {
        cpu: 'CPU / codificação',
        bandwidth: 'Banda / congestionamento',
        other: 'Outro fator',
        none: 'Nenhum',
      }[reason] || 'Não informado'
    );
  }
  function audioPlaybackInfo() {
    const snapshot = audioPlayback.getSnapshot();
    const received = snapshot.entries.filter(({ key }) => !key.startsWith('stream:'));
    const expected = detailedPlayers().filter((p) => p.id !== meId() && p.joined).length;
    if (!voiceCall.getSnapshot().joined) return { label: 'Fora da chamada', expected, count: 0 };
    if (controlState().deafened)
      return {
        label: 'Voz silenciada neste aparelho',
        expected,
        count: received.length,
        problem: true,
      };
    if (snapshot.volume === 0)
      return { label: 'Volume de saída em 0%', expected, count: received.length, problem: true };
    if (received.some((entry) => entry.blocked))
      return {
        label: 'Reprodução bloqueada pelo navegador',
        expected,
        count: received.length,
        problem: true,
      };
    if (received.some((entry) => entry.route !== 'gain' && entry.paused))
      return { label: 'Reprodução pausada', expected, count: received.length, problem: true };
    if (received.length && received.every((entry) => entry.gain === 0))
      return {
        label: 'Volume dos participantes em 0%',
        expected,
        count: received.length,
        problem: true,
      };
    if (!received.length)
      return {
        label: expected ? 'Aguardando áudio dos participantes' : 'Aguardando outro participante',
        expected,
        count: 0,
      };
    const boosted = received.some((entry) => entry.route === 'gain');
    return {
      label: boosted ? 'Reproduzindo com amplificação' : 'Reproduzindo áudio direto',
      expected,
      count: received.length,
    };
  }
  function assessTelemetry(t) {
    const playback = audioPlaybackInfo();
    if (playback.problem || audioPlayback.getSnapshot().outputError)
      return {
        level: 'warn',
        label: 'Confira a reprodução de áudio',
        detail: 'saída local',
        recommendation: audioPlayback.getSnapshot().outputError
          ? `Saída de áudio: ${audioPlayback.getSnapshot().outputError}. Confira o dispositivo em Configurações → Áudio.`
          : `${playback.label}. Confira o volume e use Liberar áudio se o navegador bloqueou a reprodução.`,
      };
    if (voiceCall.getSnapshot().joined && announcedTransport() === 'sfu-pending')
      return {
        level: 'neutral',
        label: 'Conectando áudio',
        detail: 'negociando',
        recommendation:
          'Aguardando a conexão de voz. O microfone já foi aberto, mas a rota de mídia ainda está sendo negociada.',
      };
    if (
      voiceCall.getSnapshot().joined &&
      transportIsSfu() &&
      [...sfuSubscriptions.values()].some((sub) => sub.negotiating)
    )
      return {
        level: 'warn',
        label: 'Mídia conectando',
        detail: 'negociando receptor',
        recommendation:
          'A conexão de rede já pode estar pronta enquanto o receptor termina a negociação. Aguarde a reprodução iniciar.',
      };
    if (
      voiceCall.getSnapshot().joined &&
      allTelemetryPeerConnections().some(([, pc]) =>
        ['new', 'connecting'].includes(pc.connectionState),
      )
    )
      return {
        level: 'warn',
        label: 'Áudio conectando',
        detail: 'aguardando rota',
        recommendation:
          'Ainda há uma ponta conectando. Se persistir, confira o último erro SFU e a disponibilidade de TURN.',
      };
    if (!voiceCall.getSnapshot().joined || !allTelemetryPeerConnections().length)
      return {
        level: 'neutral',
        label: 'Aguardando mídia',
        detail: 'sem fluxo',
        recommendation: 'Entre na chamada e ative câmera ou compartilhamento para medir a conexão.',
      };
    if (['failed', 'disconnected'].includes(t.pcState))
      return {
        level: 'poor',
        label: 'Mídia desconectada',
        detail: t.pcState,
        recommendation: lastSfuError
          ? `Falha SFU: ${lastSfuError}. Em redes móveis/restritivas, habilite o TURN da Cloudflare.`
          : 'A rota WebRTC caiu. Tente reconectar; em redes móveis/restritivas, habilite TURN.',
      };
    if (t.eventLoopLagMs >= 180)
      return {
        level: 'warn',
        label: 'Sobrecarga local detectada',
        detail: 'processamento',
        recommendation:
          'A interface demorou a responder. Veja Recepção de voz para comparar com perda, jitter e reconstrução; atraso de interface sozinho não confirma falha na reprodução.',
      };
    if (t.audioLossPct >= 5 || t.audioJitterMs >= 70 || t.concealedPct >= 8)
      return {
        level: 'poor',
        label: 'Voz recebida instável',
        detail: 'perda ou atraso',
        recommendation:
          'O receptor precisou recuperar áudio. Confira a rede e a carga do computador de quem está falando. A leitura local não mede a CPU do outro participante.',
      };
    const desired = screenSharing() ? qualityProfile().screen.fps : qualityProfile().camera.fps;
    const lowFps = desired >= 30 && t.outFps > 0 && t.outFps < desired * 0.58;
    if (t.lossPct >= 8 || t.rttMs >= 450 || t.jitterMs >= 100 || lowFps) {
      const captureIssue = lowFps && t.limiter === 'none' && t.lossPct < 3 && t.rttMs < 180;
      return {
        level: 'poor',
        label: 'Conexão crítica',
        detail: t.rttMs ? `${Math.round(t.rttMs)} ms` : 'instável',
        recommendation: captureIssue
          ? 'A rede está saudável, mas a origem está codificando poucos quadros. Reduza resolução ou feche aplicações pesadas.'
          : t.limiter === 'cpu'
            ? 'A CPU está limitando a codificação. Reduza resolução/FPS ou feche aplicações pesadas.'
            : t.limiter === 'bandwidth' || t.lossPct >= 8
              ? 'A rede está limitando a mídia. Reduza a qualidade ou teste outra conexão.'
              : 'FPS/latência fora do ideal. Teste uma qualidade menor e confira CPU/rede.',
      };
    }
    if (lastSfuError && voiceTransport.getSnapshot().mode === 'sfu')
      return {
        level: 'warn',
        label: 'SFU reconectando',
        detail: t.rttMs ? `${Math.round(t.rttMs)} ms` : 'tentando rota',
        recommendation: `${lastSfuError}. A publicação local pode estar saudável mesmo quando um receptor ainda não conseguiu assinar a mídia.`,
      };
    if (playback.expected && playback.count < playback.expected)
      return {
        level: 'warn',
        label: 'Aguardando áudio remoto',
        detail: `${playback.count}/${playback.expected} receptores`,
        recommendation:
          'Ainda falta abrir o áudio de um participante. Uma publicação local conectada não confirma a recepção nos dois sentidos.',
      };
    if (
      t.lossPct >= 3 ||
      t.rttMs >= 220 ||
      t.jitterMs >= 50 ||
      t.limiter === 'cpu' ||
      t.limiter === 'bandwidth'
    )
      return {
        level: 'warn',
        label: 'Conexão sob atenção',
        detail: t.rttMs ? `${Math.round(t.rttMs)} ms` : 'oscilando',
        recommendation:
          t.limiter === 'cpu'
            ? 'Codificação limitada por CPU; considere baixar a qualidade.'
            : t.limiter === 'bandwidth'
              ? 'WebRTC detectou limitação de banda; a qualidade pode oscilar.'
              : 'Há perda/jitter acima do ideal; acompanhe antes de aumentar a qualidade.',
      };
    return {
      level: 'good',
      label: 'Rede saudável',
      detail: t.rttMs ? `${Math.round(t.rttMs)} ms` : 'estável',
      recommendation:
        'Sem gargalo de rede detectado. Confira também Reprodução de voz e Saída de áudio: tráfego recebido não confirma som audível no dispositivo.',
    };
  }
  function renderTelemetry() {
    audioPreferences.refresh();
    const {
      telemetry: telemetrySnapshot,
      resources: nativeResources,
      lagMs: eventLoopLagMs,
    } = voiceTelemetry.getSnapshot();
    const t = telemetrySnapshot || {
      transport: voiceTransport.getSnapshot().mode,
      rttMs: 0,
      uploadBps: 0,
      downloadBps: 0,
      outFps: 0,
      inFps: 0,
      outW: 0,
      outH: 0,
      inW: 0,
      inH: 0,
      lossPct: 0,
      jitterMs: 0,
      limiter: 'none',
    };
    const health = assessTelemetry(t),
      modeState = voiceCall.getSnapshot().joined
        ? announcedTransport()
        : voiceTransport.getSnapshot().mode;
    const set = (id, v) => {
      const el = $(id);
      if (el && el.textContent !== v) el.textContent = v;
    };
    set('telemetryHealthLabel', health.label.replace('Conexão ', ''));
    set('telemetryHealthDetail', health.detail);
    set(
      'adaptiveQualityStatus',
      callQuality.getSnapshot().adaptation.level
        ? `Vídeo reduzido temporariamente: ${callQuality.getSnapshot().adaptation.reason}. Retorno gradual após 60 segundos estáveis.`
        : 'Qualidade escolhida preservada; reduções temporárias quando necessário.',
    );
    const statusPill = $('telemetryStatusPill');
    if (statusPill) statusPill.className = `connection-health ${health.level}`;
    const modePill = $('chatOnlyTransport');
    if (modePill) {
      const label =
        modeState === 'sfu-pending' ? '⌁ Conectando…' : modeState === 'sfu' ? '☁ SFU' : '↔ P2P';
      if (modePill.textContent !== label) modePill.textContent = label;
      modePill.classList.toggle('sfu', modeState === 'sfu');
    }
    if (!telemetryOpen || !foreground()) return;
    const playback = audioPlaybackInfo(),
      output = $('voiceOutputSelect');
    renderReceptionTelemetry();
    set(
      'telemetryAppVersion',
      window.TronoDesktop?.version || window.TronoNetwork?.CLIENT_VERSION || '0.9.1-alpha',
    );
    set('telemetryAudioLoss', t.audioLossPct === undefined ? '—' : t.audioLossPct.toFixed(1) + '%');
    set(
      'telemetryAudioJitter',
      t.audioJitterMs === undefined ? '—' : Math.round(t.audioJitterMs) + ' ms',
    );
    set('telemetryConcealed', t.concealedPct === undefined ? '—' : t.concealedPct.toFixed(1) + '%');
    set('telemetryLocalLag', Math.round(eventLoopLagMs) + ' ms');
    set(
      'telemetryResources',
      nativeResources
        ? `${nativeResources.appCpuPercent}% CPU · ${nativeResources.appMemoryMB} MB · ${nativeResources.freeMemoryMB} MB livres`
        : 'Abra este painel no app Windows para medir recursos.',
    );
    set(
      'adaptiveQualityStatus',
      callQuality.getSnapshot().adaptation.level
        ? `Vídeo reduzido temporariamente: ${callQuality.getSnapshot().adaptation.reason}. Retorno gradual após 60 segundos estáveis.`
        : 'Qualidade escolhida preservada; reduções temporárias quando necessário.',
    );
    set('telemetryPlayback', playback.label);
    set('telemetryVoiceReceivers', `${playback.count} de ${playback.expected}`);
    set('telemetryAudioContext', callAudio.getSnapshot().context || 'Áudio direto');
    set(
      'telemetryOutput',
      audioPlayback.getSnapshot().outputError ||
        (output?.options &&
          [...output.options].find((o) => o.value === audioPlayback.getSnapshot().output)
            ?.textContent) ||
        (audioPlayback.getSnapshot().output ? 'Dispositivo escolhido' : 'Saída padrão'),
    );
    set(
      'telemetryTransport',
      modeState === 'sfu-pending'
        ? 'Conectando áudio…'
        : modeState === 'sfu'
          ? 'Cloudflare SFU'
          : 'WebRTC P2P',
    );
    set('telemetryRtt', t.rttMs ? `${Math.round(t.rttMs)} ms` : '—');
    set('telemetryUpload', formatRate(t.uploadBps));
    set('telemetryDownload', formatRate(t.downloadBps));
    set('telemetryOutFps', t.outFps ? `${Math.round(t.outFps)} FPS` : '—');
    set('telemetryInFps', t.inFps ? `${Math.round(t.inFps)} FPS` : '—');
    set('telemetryOutResolution', formatResolution(t.outW, t.outH));
    set('telemetryInResolution', formatResolution(t.inW, t.inH));
    set(
      'telemetryLoss',
      Number.isFinite(t.lossPct) ? `${t.lossPct.toFixed(t.lossPct >= 10 ? 1 : 2)}%` : '—',
    );
    set('telemetryJitter', t.jitterMs ? `${Math.round(t.jitterMs)} ms` : '—');
    set('telemetryLimiter', limiterLabel(t.limiter));
    set('telemetryPcState', t.pcState || '—');
    set('telemetryIceRoute', t.iceRoute || '—');
    set('telemetryTurn', realtime.getSnapshot().turn ? 'TURN disponível' : 'STUN direto');
    set('telemetrySfuError', lastSfuError || 'Nenhum');
    set('telemetryHeroLabel', health.label);
    set('telemetryRecommendation', health.recommendation);
    set('telemetryHealthLabel', health.label.replace('Conexão ', ''));
    set('telemetryHealthDetail', health.detail);
    for (const id of ['telemetryHeroDot']) {
      const el = $(id);
      if (el) el.className = `telemetry-dot ${health.level}`;
    }
    const pill = $('telemetryStatusPill');
    if (pill) pill.className = `connection-health ${health.level}`;
    const transport = $('chatOnlyTransport');
    if (transport) {
      transport.textContent =
        modeState === 'sfu-pending' ? '⌁ Conectando…' : modeState === 'sfu' ? '☁ SFU' : '↔ P2P';
      transport.classList.toggle('sfu', modeState === 'sfu');
    }
  }
  function renderReceptionTelemetry() {
    const {
      rows: receptionRows,
      playout: playoutSnapshot,
      priority: voicePriorityState,
      assessment,
      owners,
    } = voiceTelemetry.getSnapshot();
    const set = (id, text) => {
      const n = $(id);
      if (n && n.textContent !== text) n.textContent = text;
    };
    set('telemetryVoiceAssessment', assessment.text);
    set(
      'telemetryVoicePriority',
      {
        managed: 'Acima do normal · somente serviço de áudio',
        system: 'Prioridade gerenciada pelo sistema',
        waiting: 'Aguardando serviço de áudio',
        idle: 'Proteção nativa inativa',
        unavailable: 'Windows manteve a prioridade padrão',
      }[voicePriorityState?.status] || 'Gerenciada pelo sistema',
    );
    set(
      'telemetryOutputGaps',
      playoutSnapshot
        ? `${playoutSnapshot.gapEvents} eventos · ${Math.round(playoutSnapshot.gapMs)} ms`
        : 'Métrica não fornecida por este motor de áudio',
    );
    const host = $('telemetryVoiceRows');
    if (!host) return;
    const lines = receptionRows.map((r) => {
      const fmt = (n, suffix) => (Number.isFinite(n) ? n.toFixed(1) + suffix : '—');
      return `${privateVoiceRoster.get(owners[r.voice - 1])?.name || 'Participante'} · Voz ${r.voice} · perda ${fmt(r.lossPct, '%')} · jitter ${fmt(r.jitterMs, ' ms')} · reconstruída ${fmt(r.concealedPct, '%')} · buffer medido ${fmt(r.bufferMs, ' ms')} · margem solicitada ${r.targetMs === null ? 'automática' : r.targetMs + ' ms'}`;
    });
    const text = lines.length ? lines.join('\n') : 'Aguardando intervalos de voz recebida.';
    if (host.textContent !== text) host.textContent = text;
  }
  function updateTelemetryHeader() {
    renderTelemetry();
  }
  function diagnostics() {
    const {
      telemetry: telemetrySnapshot,
      resources: nativeResources,
      enabled: voiceProtection,
      rows: receptionRows,
      playout: playoutSnapshot,
      priority: voicePriorityState,
      assessment,
      history: receiveHistory,
    } = voiceTelemetry.getSnapshot();
    return window.TronoVoiceCapture.diagnosticReport({
      version: window.TronoDesktop?.version || window.TronoNetwork.CLIENT_VERSION,
      platform: window.TronoDesktop ? 'Windows' : 'Navegador',
      call: {
        joined: voiceCall.getSnapshot().joined,
        muted: controlState().micMuted,
        deafened: controlState().deafened,
        camera: cameraOn(),
        screen: screenSharing(),
        transport: announcedTransport(),
        playback: audioPlaybackInfo().label,
      },
      telemetry: telemetrySnapshot,
      reception: {
        enabled: voiceProtection,
        rows: receptionRows,
        assessment: assessment.kind,
        playout: playoutSnapshot,
        priority: voicePriorityState?.status,
        recent: receiveHistory.map((r) => ({
          ...r,
          agoMs: Math.max(0, performance.now() - r.stamp),
        })),
      },
      processing: noiseState().mode,
      adaptation: callQuality.getSnapshot().adaptation.level
        ? callQuality.getSnapshot().adaptation.reason
        : 'qualidade escolhida',
      resources: nativeResources,
    });
  }
  async function copyDiagnostics() {
    const label = $('copyDiagnosticsStatus');
    try {
      await voiceTelemetry.collect();
      const report = diagnostics();
      if (window.TronoDesktop?.copyDiagnostics) await window.TronoDesktop.copyDiagnostics(report);
      else await navigator.clipboard.writeText(report);
      label.textContent = 'Copiado. Não contém nomes, mensagens, IPs ou credenciais.';
    } catch {
      label.textContent = 'Não foi possível copiar. Permita o acesso à área de transferência.';
    }
  }

  function bindFloatingDrag() {
    const panel = $('socialPanel'),
      handle = $('socialDragHandle');
    if (!panel || !handle) return;
    let drag = null;
    handle.addEventListener('pointerdown', (e) => {
      if (panelMode !== 'floating' || inChatHub() || e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      handle.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag || panelMode !== 'floating' || inChatHub()) return;
      const maxX = Math.max(0, innerWidth - panel.offsetWidth),
        maxY = Math.max(0, innerHeight - panel.offsetHeight);
      panel.style.left = `${Math.max(0, Math.min(maxX, e.clientX - drag.dx))}px`;
      panel.style.top = `${Math.max(0, Math.min(maxY, e.clientY - drag.dy))}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    const stop = () => {
      if (!drag) return;
      drag = null;
      persistFloatingRect();
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }
  function bindFloatingResize() {
    const panel = $('socialPanel'),
      grip = $('socialResizeGrip');
    if (!panel || !grip) return;
    let resize = null;
    grip.addEventListener('pointerdown', (e) => {
      if (panelMode !== 'floating' || inChatHub() || innerWidth <= 760) return;
      const r = panel.getBoundingClientRect();
      resize = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, left: r.left, top: r.top };
      grip.setPointerCapture?.(e.pointerId);
      panel.classList.add('resizing');
      e.preventDefault();
      e.stopPropagation();
    });
    grip.addEventListener('pointermove', (e) => {
      if (!resize) return;
      const maxW = Math.max(330, innerWidth - resize.left - 4),
        maxH = Math.max(330, innerHeight - resize.top - 4);
      panel.style.width = `${Math.max(330, Math.min(maxW, resize.w + (e.clientX - resize.x)))}px`;
      panel.style.height = `${Math.max(330, Math.min(maxH, resize.h + (e.clientY - resize.y)))}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    const stop = () => {
      if (!resize) return;
      resize = null;
      panel.classList.remove('resizing');
      persistFloatingRect();
    };
    grip.addEventListener('pointerup', stop);
    grip.addEventListener('pointercancel', stop);
    grip.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      storage.removeItem(FLOATING_RECT_KEY);
      clearFloatingInlineStyles();
    });
  }

  function bind() {
    voiceCall.start();
    voiceTransport.start();
    voiceRoster.start();
    controlBindings.start();
    mediaInterestBindings.start();
    screenSharingBindings.start();
    audioPreferences.start();
    $('adaptiveQuality').checked = qualityPreferences().adaptiveEnabled;
    $('adaptiveQuality').onchange = async (e) => {
      callQuality.configure({ adaptiveEnabled: !!e.target.checked });
      await applyQualityToLiveMedia();
      renderTelemetry();
    };
    $('copyDiagnostics').onclick = copyDiagnostics;
    $('socialBtn')?.addEventListener('click', () => showPanel(!panelOpen));
    $('roomSocialBtn')?.addEventListener('click', () => showPanel(!panelOpen));
    $('chatOnlyOpenSocialBtn')?.addEventListener('click', () => showPanel(true));
    $('socialCloseBtn')?.addEventListener('click', () => showPanel(false));
    $('socialModeBtn')?.addEventListener('click', togglePanelMode);
    $('socialMiniDock')?.addEventListener('click', () => showPanel(true));
    $('chatOnlyTextBtn')?.addEventListener('click', () => toggleTextChat());
    $('mnSidebarTextBtn')?.addEventListener('click', () => toggleTextChat(true));
    $('chatDrawerCloseBtn')?.addEventListener('click', () => toggleTextChat(false));
    $('returnToVoiceRoom')?.addEventListener('click', () => {
      const id = window.TronoNetwork.primaryRoom;
      for (const button of document.querySelectorAll('[data-chat-channel]'))
        if (button.dataset.chatChannel === id) {
          button.click();
          break;
        }
    });
    $('muteTextBtn')?.addEventListener('click', toggleTextMute);
    if ($('muteTextBtn')) {
      $('muteTextBtn').textContent = chatMuted ? 'Ativar chat' : 'Silenciar chat';
      $('muteTextBtn').classList.toggle('danger-active', chatMuted);
    }

    $('joinVoiceBtn')?.addEventListener('click', joinVoice);
    $('telemetryStatusPill')?.addEventListener('click', () => toggleTelemetry());
    $('telemetryOpenBtn')?.addEventListener('click', () => toggleTelemetry());
    $('telemetryCloseBtn')?.addEventListener('click', () => toggleTelemetry(false));
    $('resumeAudioBtn')?.addEventListener('click', () => {
      unlockCallAudio();
      if (voiceCall.getSnapshot().joined && !microphone.getSnapshot().capture?.processor)
        void acquireMic()
          .then(() => speakingIndicators.watch(meId(), localStream))
          .catch((err) => setStatus(err.message, 'warn'));
    });
    window.addEventListener('resize', repositionProfileControls);
    $('voiceRoster')?.addEventListener('scroll', repositionProfileControls, { passive: true });
    $('voiceRoster')?.addEventListener('input', (e) => {
      if (e.target.matches('[data-peer-volume]'))
        setPeerGain(e.target.dataset.peerVolume, e.target.value);
    });
    window.addEventListener('trono-auth-change', () => {
      profileActivities.clear();
      if (volumeOwner !== window.TronoAuth.user?.id) {
        volumeOwner = window.TronoAuth.user?.id || null;
        audioPlayback.clearVoiceGains();
      }
      renderProfileActivities();
    });
    window.TronoNetwork?.onMessage((msg) => {
      if (msg.type === 'presence') {
        profileActivities.clear();
        if (msg.scope === 'community')
          for (const person of msg.members || [])
            if (person.online && person.activity?.name)
              profileActivities.set(person.id, person.activity);
        renderProfileActivities();
      }
      if (msg.type === 'joined-game-room') {
        gameRoomState = msg.room;
        if (msg.primaryRoomId === msg.room.id) consumeRoom(msg.room);
        renderSeatMedia();
      }
      if (msg.type === 'left-game-room') {
        gameRoomState = null;
        if (roomState?.id === msg.roomId) {
          consumeRoom(null);
        }
      }
      if (msg.type === 'left-voice-room') {
        if (roomState?.id === msg.roomId) {
          consumeRoom(null);
        }
      }
      if (msg.type === 'voice-room-attached') consumeRoom(msg.room);
      if (msg.type === 'joined-room') {
        if (msg.room?.kind === 'game') gameRoomState = msg.room;
        consumeRoom(msg.room);
      }
      if (msg.type === 'joined-text-channel') consumeChatRoom(msg.room);
      if (msg.type === 'room-state') {
        if (msg.room?.id === window.TronoNetwork.gameRoom) gameRoomState = msg.room;
        if (msg.room?.id === window.TronoNetwork.primaryRoom) consumeRoom(msg.room);
        else if (msg.room?.id === window.TronoNetwork.currentRoom) consumeChatRoom(msg.room);
      }
      if (msg.type === 'channel-deleted' && msg.roomId === roomState?.id) {
        roomState = null;
        voiceRoster.setRoom(null);
        updateButtons();
      }
      if (msg.type === 'connection' && !msg.connected) {
        profileActivities.clear();
        renderProfileActivities();
        setStatus(
          'Servidor desconectado. Recarregue a página para entrar na voz novamente.',
          'error',
        );
      }
      if (msg.type === 'game-started' || msg.type === 'game-state') setTimeout(renderSeatMedia, 0);
    });
    window.addEventListener('resize', () => {
      restoreFloatingRect();
      renderSeatMedia();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const maximized = document.querySelector('.media-maximized');
        if (maximized) {
          maximized.classList.remove('media-maximized');
          document.body.classList.remove('media-focus-open');
          void setSfuTileLayer(maximized, false);
        } else if (telemetryOpen) toggleTelemetry(false);
        else if (inChatHub() && chatDrawerOpen) toggleTextChat(false);
        else if (window.TronoCallSettings.getSnapshot().open) toggleVoiceSettings(false);
      }
    });
    document.addEventListener('fullscreenchange', () => {
      document.body.classList.toggle('native-fullscreen-media', !!document.fullscreenElement);
      if (!document.fullscreenElement) {
        renderVideoGrid();
        renderScreenGrid();
      }
      if (transportIsSfu() && !document.fullscreenElement) void updateAllSfuSubscriptionLayers();
    });
    bindFloatingDrag();
    bindFloatingResize();
    applyPanelMode();
    voiceSettings.refresh();
    updateChatDrawerUI();
    voiceSettings.start();
    updateQualityUI();
    updateButtons();
    updatePublicPresence();
    renderVoiceRoster();
    renderVideoGrid();
    renderScreenGrid();
    renderSeatMedia();
    realtime.start();
    voiceTelemetry.start();
    callAudio.start();
    for (const event of ['focus', 'blur'])
      window.addEventListener(event, () => {
        updateVoiceBackgroundClass();
        renderTelemetry();
      });
    document.addEventListener('visibilitychange', () => {
      updateVoiceBackgroundClass();
    });
    let previousWide = innerWidth > 1000;
    window.addEventListener('resize', () => {
      const wide = innerWidth > 1000;
      if (inChatHub() && previousWide && !wide && chatRoomState?.channelType !== 'text')
        toggleTextChat(false);
      previousWide = wide;
    });
  }
  const voiceSettings = window.TronoVoiceCapture.createVoiceSettings({
    controls: callControls,
    microphone,
    camera: cameraCapture,
    playback: audioPlayback,
    quality: callQuality,
    sharing: screenSharingControls,
    storage,
    mediaDevices: navigator.mediaDevices,
    outputSupported: 'setSinkId' in HTMLMediaElement.prototype,
    call: () => voiceCall.getSnapshot(),
    policy: () => ({
      sfu: transportIsSfu(),
      highAllowed: realtime.getSnapshot().status?.highAllowed,
    }),
    unlockAudio: unlockCallAudio,
    announce: () =>
      window.TronoNetwork?.setVoiceState(
        voiceCall.getSnapshot().joined,
        controlState().micMuted,
        cameraOn(),
        screenSharing(),
        qualityPreferences().transmissionQuality,
        announcedTransport(),
      ),
    onOutputChanged: renderTelemetry,
    setScreenBitrate: (screenBitrate) =>
      window.TronoNetwork.requestSfu('set-screen-bitrate', { screenBitrate }),
    onStatus: setStatus,
  });
  window.TronoVoiceSettings = voiceSettings;
  const audioPreferences = window.TronoVoiceCapture.createAudioPreferences({
    audio: () => window.TronoAudio,
    tracks: () => window.TRONO_MUSIC_TRACKS,
    alerts: callAlerts,
    protection: voiceTelemetry,
    events: window,
    storage,
  });
  window.TronoAudioPreferences = audioPreferences;

  window.addEventListener('trono-layout-change', updateButtons);
  window.addEventListener('trono:ready', bind);

  return {
    onChatActivity,
    diagnostics,
    showPanel,
    showForRoom,
    consumeRoom,
    consumeChatRoom,
    get chatRoomState() {
      return chatRoomState;
    },
    joinVoice,
    leaveVoice,
    renderVideoGrid,
    renderScreenGrid,
    renderSeatMedia,
    setChatHubMode,
    clearChannelChat,
    toggleTextChat,
    toggleTelemetry,
    toggleVoiceSettings,
    setSettingsTab,
    startScreenShare,
    stopScreenShare,
    switchScreenShare,
    openScreenOptions,
    get voiceJoined() {
      return voiceCall.getSnapshot().joined;
    },
    get voiceJoining() {
      return !!voiceCall.getSnapshot().joining;
    },
    get voiceRoom() {
      return roomState
        ? {
            id: roomState.id,
            name: roomState.name,
            kind: roomState.kind,
            channelType: roomState.channelType,
          }
        : null;
    },
    get cameraOn() {
      return cameraOn();
    },
    get screenSharing() {
      return screenSharing();
    },
    get voiceLightMode() {
      return controlState().voiceLightMode;
    },
    get noiseSuppression() {
      return controlState().noiseSuppression;
    },
    get noiseMode() {
      return controlState().noiseSuppression ? controlState().noiseEngine : 'off';
    },
    get noiseState() {
      return noiseState();
    },
    get transmissionQuality() {
      return qualityPreferences().transmissionQuality;
    },
    get panelMode() {
      return panelMode;
    },
    get mediaTransport() {
      return voiceTransport.getSnapshot().mode;
    },
    get realtimeStatus() {
      return realtime.getSnapshot().status;
    },
    get telemetry() {
      return voiceTelemetry.getSnapshot().telemetry;
    },
    get voiceReception() {
      const { enabled, rows, priority } = voiceTelemetry.getSnapshot();
      return {
        enabled,
        rows: rows.map((r) => ({ ...r })),
        background: voiceCall.getSnapshot().joined && !foreground(),
        meterMode: speakingIndicators.getSnapshot().mode,
        metersRunning: speakingIndicators.getSnapshot().running,
        playbackContext: audioPlayback.getSnapshot().context,
        microphoneContext: callAudio.getSnapshot().context,
        priority: priority?.status,
      };
    },
    getLocalDisplayStream() {
      return screenSharing() ? screenCapture.getCapture()?.source : null;
    },
    getLocalAudioTrack() {
      return localStream?.getAudioTracks?.()[0] || null;
    },
    get screenSettings() {
      return {
        ...SCREEN_FORMATS[qualityPreferences().screenFormat],
        bitrate: effectiveScreenBitrate(),
        audio: screenSharingControls.getSnapshot().audio,
      };
    },
    get deafened() {
      return controlState().deafened;
    },
    toggleWatchStream,
    toggleWatchCamera,
    fullscreenMedia,
    getMediaSources() {
      return voiceCall.getSnapshot().joined
        ? detailedPlayers()
            .filter(
              (p) => p.camera || p.screen || (p.id === meId() && (cameraOn() || screenSharing())),
            )
            .map((p) => ({
              id: p.id,
              name: p.name,
              self: p.id === meId(),
              camera: (
                p.id === meId() ? cameraOn() : p.camera && !mediaInterest.isCameraHidden(p.id)
              )
                ? cameraStreamForPerson(p)
                : null,
              cameraOffered: p.id === meId() ? cameraOn() : !!p.camera,
              cameraHidden: mediaInterest.isCameraHidden(p.id),
              screen: (p.id === meId() ? screenSharing() : mediaInterest.isWatching(p.id))
                ? screenStreamForPerson(p)
                : null,
              screenOffered: p.screen,
              watching: p.id === meId() || mediaInterest.isWatching(p.id),
            }))
        : [];
    },
  };
})();
