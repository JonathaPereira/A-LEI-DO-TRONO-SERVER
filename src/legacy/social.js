'use strict';
window.TronoSocial = (() => {
  const $ = (id) => document.getElementById(id);
  const storage = window.TronoStorage || localStorage;
  let lastSfuError = '';

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
    callToolbar.refresh();
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
    callStage.refresh();
  }
  const toggleWatchStream = (id) => mediaInterest.toggleScreen(id);
  function setPeerGain(id, value) {
    if (!privateVoiceRoster.has(id) || id === meId()) return;
    unlockCallAudio();
    audioPlayback.setGain(id, value);
    attachRemoteAudio(id);
    const account = privateVoiceRoster.get(id)?.accountId;
    if (account) window.TronoPersonal?.set('volume:' + account, audioPlayback.getGain(id));
    callStage.refresh();
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
      detailsOpen: connectionDiagnostics.getSnapshot().open,
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
    onChange: refreshDiagnostics,
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
    onChange: refreshCallControls,
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
        refreshCallControls();
        renderVoiceRoster();
        updateMediaIndicators();
      }
      if (change === 'camera') {
        refreshCallControls();
        renderVideoGrid();
        renderSeatMedia();
      }
    },
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
    hide: (id, kind) => mediaVisibility.hide(id, kind),
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
  const mediaVisibility = window.TronoVoiceCapture.createMediaVisibility({ document });

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
        if (kind === 'stopped') refreshCallControls();
        renderScreenGrid();
        renderVoiceRoster();
      }
    },
    onStatus: setStatus,
  });
  const screenOptions = window.TronoVoiceCapture.createScreenOptions({
    closeDialog: () => {
      if ($('screenOptionsDialog')?.open) $('screenOptionsDialog').close();
    },
    sharing: screenSharingControls,
    call: () => voiceCall.getSnapshot(),
    replayEnabled: () => !!window.TronoClips?.captureProfile?.(),
  });
  window.TronoScreenOptions = screenOptions;

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
      refreshCallControls();
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
    callToolbar.setStatus(text, kind);
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
    connectionDiagnostics.toggle(force);
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
    screenOptions.refresh();
    voiceSettings.refresh();
    refreshDiagnostics();
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
      } else callStage.expandScreen(tile.dataset.peer);
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
      kind === 'camera' ? '#socialPanel .camera-tile' : '#socialPanel .screen-share-tile',
    );
    const tile = [...tiles].find((t) => t.dataset.peer === peerId);
    if (tile) return callStage.fullscreen(tile);
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
    refreshCallControls();
    refreshDiagnostics();
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
    refreshCallControls();
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
    screenOptions.open();
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
      refreshDiagnostics();
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
    refreshDiagnostics();
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

  function renderVoiceRoster() {
    callStage.refresh();
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

  function renderVideoGrid() {
    callStage.refresh();
  }
  function renderScreenGrid() {
    callStage.refresh();
  }
  function renderSeatMedia() {
    const host = $('seatMediaLayer');
    if (!host) return;
    for (const video of host.querySelectorAll('video')) video.srcObject = null;
    host.classList.remove('active');
    host.replaceChildren();
  }
  function updateMediaIndicators() {
    callStage.refresh();
  }

  function prepareCallUi() {
    unlockCallAudio();
    callControls.resetParticipation();
    mediaInterest.reset();
    callStage.resetLayouts();
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
    refreshCallControls();
    refreshDiagnostics();
    setStatus('Conectando o áudio da chamada…', 'warn');
    renderVoiceRoster();
    renderVideoGrid();
    renderScreenGrid();
    renderSeatMedia();
    await speakingIndicators.watch(meId(), localStream);
  }
  function prepareLeaveUi() {
    callQuality.reset();
    screenOptions.close();
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
    callControls.resetParticipation();
    refreshCallControls();
    refreshDiagnostics();
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

  function refreshCallControls() {
    screenOptions.refresh();
    callToolbar.refresh();
    updateNoiseButton();
    document.body.classList.toggle('call-connected', voiceCall.getSnapshot().joined);
    const joining = !!voiceCall.getSnapshot().joining && !voiceCall.getSnapshot().joined;
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
    refreshCallControls();
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
    refreshCallControls();
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
  function refreshDiagnostics() {
    audioPreferences.refresh();
    connectionDiagnostics.refresh();
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
        playback: connectionDiagnostics.playback().label,
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
    audioPreferences.start();
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

    window.addEventListener('trono-auth-change', () => {
      if (volumeOwner !== window.TronoAuth.user?.id) {
        volumeOwner = window.TronoAuth.user?.id || null;
        audioPlayback.clearVoiceGains();
      }
    });
    window.TronoNetwork?.onMessage((msg) => {
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
        refreshCallControls();
      }
      if (msg.type === 'connection' && !msg.connected) {
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
          callStage.refresh();
        } else if (connectionDiagnostics.getSnapshot().open) toggleTelemetry(false);
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
    refreshCallControls();
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
        refreshDiagnostics();
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
    onOutputChanged: refreshDiagnostics,
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
  const connectionDiagnostics = window.TronoVoiceCapture.createConnectionDiagnostics({
    read: () => {
      const call = voiceCall.getSnapshot(),
        playback = audioPlayback.getSnapshot(),
        telemetry = voiceTelemetry.getSnapshot(),
        output = voiceSettings
          .getSnapshot()
          .devices.output.find((row) => row.id === playback.output);
      return {
        generation: call.generation,
        joined: call.joined,
        mode: call.joined ? announcedTransport() : voiceTransport.getSnapshot().mode,
        hub: inChatHub(),
        foreground: foreground(),
        version:
          window.TronoDesktop?.version || window.TronoNetwork?.CLIENT_VERSION || '0.9.1-alpha',
        negotiating: [...sfuSubscriptions.values()].some((sub) => sub.negotiating),
        connectionStates: allTelemetryPeerConnections().map(([, pc]) => pc.connectionState),
        expectedVoices: detailedPlayers().filter((p) => p.id !== meId() && p.joined).length,
        deafened: controlState().deafened,
        desiredFps: screenSharing() ? qualityProfile().screen.fps : qualityProfile().camera.fps,
        lastSfuError,
        outputLabel: output?.label || (playback.output ? 'Dispositivo escolhido' : 'Saída padrão'),
        audioContext: callAudio.getSnapshot().context,
        playback,
        telemetry,
        realtime: realtime.getSnapshot(),
        quality: callQuality.getSnapshot(),
        receptionNames: telemetry.owners.map(
          (id) => privateVoiceRoster.get(id)?.name || 'Participante',
        ),
      };
    },
    telemetry: voiceTelemetry,
    quality: callQuality,
    report: diagnostics,
    copy: (report) =>
      window.TronoDesktop?.copyDiagnostics
        ? window.TronoDesktop.copyDiagnostics(report)
        : navigator.clipboard.writeText(report),
    onOpen: (open) =>
      window.dispatchEvent(new CustomEvent('trono-telemetry-change', { detail: { open } })),
    onQualityChanged: () => voiceSettings.refresh(),
  });
  window.TronoConnectionDiagnostics = connectionDiagnostics;
  const callToolbar = window.TronoVoiceCapture.createCallToolbar({
    read: () => {
      const call = voiceCall.getSnapshot(),
        controls = controlState(),
        context = callAudio.getSnapshot().context;
      const eligible = !!roomState && roomState.channelType !== 'text';
      return {
        joined: call.joined,
        joining: !!call.joining,
        eligible,
        textOnly: inChatHub() && chatRoomState?.channelType === 'text' && !call.joined && !eligible,
        communityVoice: communityVoice(),
        discord: document.body.dataset.appLayout === 'discord',
        desktop: !!window.TronoDesktop,
        micMuted: controls.micMuted,
        deafened: controls.deafened,
        camera: cameraOn(),
        cameraPending: controls.cameraTogglePending,
        cameraLoading: !!cameraCapture.getSnapshot().loading,
        screen: screenSharing(),
        blocked:
          audioPlayback.getSnapshot().entries.some((entry) => entry.blocked) ||
          !!(call.joined && context && context !== 'running'),
      };
    },
    workspace: (id) =>
      document.body.classList.contains('chat-only-active') &&
      !!document.getElementById(id)?.closest('#callWorkspace'),
    settings: () => window.TronoCallSettings,
    actions: {
      joinVoiceBtn: joinVoice,
      muteMicBtn: callControls.toggleMute,
      deafenVoiceBtn: callControls.toggleDeafen,
      cameraBtn: callControls.toggleCamera,
      screenShareBtn: () =>
        screenSharingControls.isActive() ? screenSharingControls.stop() : screenOptions.open(),
    },
    resume: () => {
      unlockCallAudio();
      if (voiceCall.getSnapshot().joined && !microphone.getSnapshot().capture?.processor)
        return acquireMic()
          .then(() => speakingIndicators.watch(meId(), localStream))
          .catch((err) => setStatus(err.message, 'warn'));
    },
  });
  window.TronoCallToolbar = callToolbar;
  const callStage = window.TronoVoiceCapture.createCallStage({
    read: () => {
      const call = voiceCall.getSnapshot(),
        preview = screenSharingControls.getSnapshot();
      return {
        generation: call.generation,
        joined: call.joined,
        community: communityVoice(),
        hub: inChatHub(),
        publicActive: !!publicVoiceActive(),
        roomName: roomState?.name || (inChatHub() ? 'Geral' : 'Voz da mesa'),
        previewPaused: preview.previewPaused,
        previewCollapsed: preview.collapsed,
        participants: call.joined
          ? detailedPlayers().map((p) => {
              const self = p.id === meId(),
                cameraStream = cameraStreamForPerson(p),
                screenStream = screenStreamForPerson(p);
              return {
                ...p,
                accountId: p.accountId || (self ? window.TronoAuth?.user?.id : null),
                self,
                muted: self ? controlState().micMuted : !!p.muted,
                deafened: self ? controlState().deafened : !!p.deafened,
                camera: self ? cameraOn() : !!p.camera,
                screen: self ? screenSharing() : !!p.screen,
                transport: self ? announcedTransport() : p.transport || 'p2p',
                hiddenCamera: mediaInterest.isCameraHidden(p.id),
                watching: self || mediaInterest.isWatching(p.id),
                speaking: speakingIndicators.isSpeaking(p.id),
                volume: audioPlayback.getGain(p.id),
                screenVolume: audioPlayback.getGain(streamAudioKey(p.id)),
                cameraStream: cameraStream || null,
                screenStream: screenStream || null,
                cameraLive: personHasLiveCamera(p),
                screenLive: personHasLiveScreen(p),
                hasScreenAudio: !!(
                  screenStream?.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted) ||
                  (!self &&
                    sfuSession
                      .getPublications()
                      .some((pub) => pub.ownerId === p.id && pub.kind === 'screen-audio'))
                ),
              };
            })
          : [],
      };
    },
    onMessage: (listener) => window.TronoNetwork.onMessage(listener),
    authEvents: window,
    toggleScreen: toggleWatchStream,
    toggleCamera: toggleWatchCamera,
    setVolume: setPeerGain,
    setScreenVolume: setStreamGain,
    togglePreview: screenSharingControls.togglePreview,
    toggleCollapsed: screenSharingControls.toggleCollapsed,
    switchSource: screenSharingControls.switchSource,
    prune: mediaInterest.prune,
    recover: (id, live) =>
      live ? remoteMedia.cancelRecovery(id) : remoteMedia.scheduleRecovery(id),
    fullscreen: toggleMediaFullscreen,
    beforeCollapse: async (tile) => {
      if (document.fullscreenElement === tile) await document.exitFullscreen().catch(() => {});
      tile.classList.remove('media-maximized');
      document.body.classList.remove('media-focus-open');
    },
  });
  window.TronoCallStage = callStage;

  window.addEventListener('trono-layout-change', refreshCallControls);
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
      return window.TronoVoiceCapture.getMosaicSources(callStage.getSnapshot());
    },
  };
})();
