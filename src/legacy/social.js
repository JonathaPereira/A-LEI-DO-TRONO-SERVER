'use strict';
window.TronoSocial = (() => {
  const $ = (id) => document.getElementById(id);
  const storage = window.TronoStorage || localStorage;
  const privateVoiceRoster = new Map();
  const profileActivities = new Map();
  let realtimeStatus = null;
  let realtimeSyncError = '';
  let realtimeSyncTimer = null;
  let mediaTransport = 'p2p';
  let lastSfuError = '';
  let roomVoiceMode = null;
  let voiceGeneration = 0,
    voiceJoinPromise = null;
  const senderQualityQueues = new WeakMap(),
    profileMedia = new Map();
  let mutedBeforeDeafen = false;

  const clampGain = (v) => Math.min(300, Math.max(0, Math.round((Number(v) || 0) / 5) * 5));
  let microphoneVolume = clampGain(storage.getItem('mnMicrophoneGain') ?? 100);
  let volumeOwner = null;
  const watchingStreams = new Set();
  const hiddenCameras = new Set();
  const streamWatchVersions = new Map();
  let mediaAudioContext = null;
  const foreground = () => !document.hidden && document.hasFocus();
  function updateVoiceBackgroundClass() {
    document.body.classList.toggle('voice-background', voiceJoined && !foreground());
  }
  const isScreenKind = (kind) => kind === 'screen' || kind === 'screen-audio';
  const wantsSfuPublication = (pub) =>
    pub.ownerId !== meId() &&
    (pub.kind !== 'camera' || !hiddenCameras.has(pub.ownerId)) &&
    (!isScreenKind(pub.kind) || (inChatHub() && watchingStreams.has(pub.ownerId)));
  const streamAudioKey = (id) => `stream:${id}`;
  function ensureMediaAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!mediaAudioContext || mediaAudioContext.state === 'closed') {
      try {
        mediaAudioContext = new Ctx({
          latencyHint: window.TronoDesktop ? 0.04 : 'interactive',
          sampleRate: 48000,
        });
      } catch (err) {
        console.warn('[TronoSocial] Web Audio indisponível; usando áudio direto', err);
        return null;
      }
      if (audioPlayback.getSnapshot().output && mediaAudioContext.setSinkId)
        void mediaAudioContext.setSinkId(audioPlayback.getSnapshot().output).catch(() => {});
      mediaAudioContext.onstatechange = () => {
        void refreshMicPipeline().catch((err) =>
          console.warn('[TronoSocial] retomar microfone', err),
        );
        // A destination produced by a paused context is silent even with healthy RTP.
        // Switch receivers back to their original track on every context transition.
        updateAudioRecoveryUI();
      };
    }
    return mediaAudioContext;
  }
  function updateAudioRecoveryUI() {
    const blocked =
      audioPlayback.getSnapshot().entries.some((entry) => entry.blocked) ||
      (voiceJoined && mediaAudioContext && mediaAudioContext.state !== 'running');
    $('resumeAudioBtn')?.classList.toggle('hidden', !blocked);
  }
  function unlockCallAudio() {
    // Call resume/play synchronously inside the user's gesture, before permission/network awaits.
    const ctx = ensureMediaAudioContext();
    if (ctx && ctx.state !== 'running')
      void ctx
        .resume()
        .then(() => {
          audioPlayback.refresh();
          updateAudioRecoveryUI();
        })
        .catch(() => updateAudioRecoveryUI());
    audioPlayback.unlock();
    if (callSoundContext && callSoundContext.state !== 'running')
      void callSoundContext.resume().catch(() => {});
  }
  function renderGainValues() {
    for (const [prefix, value] of [
      ['mic', microphoneVolume],
      ['output', audioPlayback.getSnapshot().volume],
    ]) {
      const slider = $(`${prefix}GainSlider`),
        label = $(`${prefix}GainValue`);
      if (slider) slider.value = String(value);
      if (label) label.textContent = `${value}%`;
    }
  }
  function attachRemoteAudio(key) {
    const screen = key.startsWith('stream:'),
      peerId = screen ? key.slice(7) : key;
    if (screen && !watchingStreams.has(peerId)) return;
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
  async function toggleWatchStream(id) {
    if (!voiceJoined || !privateVoiceRoster.get(id)?.screen) return;
    streamWatchVersions.set(id, (streamWatchVersions.get(id) || 0) + 1);
    if (watchingStreams.has(id)) {
      watchingStreams.delete(id);
      removeRemoteAudio(streamAudioKey(id));
      remoteMedia.cancelRecovery(id);
      if (transportIsSfu())
        for (const kind of ['screen', 'screen-audio']) void closeSfuSubscription(sfuKey(id, kind));
      const tile = findPeerTile($('screenShareGrid'), id, '.screen-share-tile'),
        video = tile?.querySelector('video');
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      if (document.fullscreenElement === tile) await document.exitFullscreen().catch(() => {});
    } else {
      watchingStreams.add(id);
      unlockCallAudio();
    }
    if (transportIsSfu()) void syncSfuSubscriptions();
    else
      window.TronoNetwork?.sendVoiceSignal(id, 'stream-watch', {
        watching: watchingStreams.has(id),
      });
    if (watchingStreams.has(id)) attachRemoteAudio(streamAudioKey(id));
    renderVoiceRoster();
    renderScreenGrid();
  }
  function setMicrophoneGain(value) {
    microphoneVolume = clampGain(value);
    storage.setItem('mnMicrophoneGain', String(microphoneVolume));
    microphone.setGain(microphoneVolume);
    void refreshMicPipeline().catch((err) => console.warn('[TronoSocial] ganho do microfone', err));
    renderGainValues();
  }
  function setOutputGain(value) {
    unlockCallAudio();
    audioPlayback.setVolume(value);
    storage.setItem('mnOutputGain', String(audioPlayback.getSnapshot().volume));
    renderGainValues();
  }
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
  let voiceJoined = false;
  let micMuted = false;
  let deafened = false;
  let cameraTogglePending = null;
  let panelOpen = false;
  let chatHubMode = false;
  const panelMode = 'floating';
  let chatMuted = storage.getItem('tronoChatMuted') === '1';
  let noiseSuppression = storage.getItem('tronoNoiseSuppression') !== '0';
  let noiseEngine = window.TronoDesktop
    ? storage.getItem('mnDesktopNoiseMode') || (noiseSuppression ? 'native' : 'off')
    : 'rnnoise';
  if (!['native', 'rnnoise', 'off'].includes(noiseEngine)) noiseEngine = 'native';
  if (window.TronoDesktop) noiseSuppression = noiseEngine !== 'off';
  let voiceLightMode = storage.getItem('tronoVoiceLightMode') === '1';
  let selectedInput = storage.getItem('tronoVoiceInput') || '';
  let selectedCamera = storage.getItem('tronoCameraInput') || '';
  let transmissionQuality = ['economy', 'balanced', 'high'].includes(
    storage.getItem('tronoTransmissionQuality'),
  )
    ? storage.getItem('tronoTransmissionQuality')
    : 'balanced';
  const SCREEN_BITRATES = [4, 6, 8, 10, 12, 15];
  let screenBitrateMbps = SCREEN_BITRATES.includes(Number(storage.getItem('mnScreenBitrate')))
    ? Number(storage.getItem('mnScreenBitrate'))
    : 8;
  let screenContent = storage.getItem('mnScreenContent') === 'motion' ? 'motion' : 'detail';
  const SCREEN_FORMATS = {
    '720-15': { width: 1280, height: 720, fps: 15 },
    '1080-15': { width: 1920, height: 1080, fps: 15 },
    '720-30': { width: 1280, height: 720, fps: 30 },
    '720-60': { width: 1280, height: 720, fps: 60 },
    '1080-30': { width: 1920, height: 1080, fps: 30 },
    '1080-60': { width: 1920, height: 1080, fps: 60 },
  };
  let screenFormat = SCREEN_FORMATS[storage.getItem('mnScreenFormat')]
    ? storage.getItem('mnScreenFormat')
    : '720-30';
  let shareStreamAudio = storage.getItem('mnShareStreamAudio') !== '0';
  let settingsOpen = false;
  let settingsTab = storage.getItem('tronoVoiceSettingsTab') || 'audio';
  let voiceRosterInitialized = false;
  let voiceEventsSupported = false;
  let callAlertVolume = Math.max(
    0,
    Math.min(100, Number(storage.getItem('mnCallAlertVolume') ?? 85) || 0),
  );
  let callSoundContext = null;
  const callSoundCooldown = new Map();
  let chatDrawerOpen = false;
  let chatUnreadCount = 0;
  let localScreenPreviewPaused = false;
  let localScreenCollapsed = false;
  let telemetryOpen = false;
  const stability = new window.TronoCallStability.CallStability();
  let adaptiveEnabled = storage.getItem('mnAdaptiveQuality') !== '0';

  const rtcConfig = window.TRONO_RTC_CONFIG || {
    iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
  };
  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const meId = () => window.TronoNetwork?.clientId;
  const speakingIndicators = window.TronoVoiceCapture.createSpeakingIndicators({
    getSettings: () => ({
      enabled: voiceJoined,
      hidden: document.hidden,
      foreground: foreground(),
      lightMode: voiceLightMode,
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
      generation: voiceGeneration,
      enabled: noiseSuppression,
      nativeOnly: !!(voiceLightMode || (window.TronoDesktop && noiseEngine === 'native')),
      deviceId: selectedInput,
      gain: microphoneVolume,
      muted: micMuted,
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
          if (voiceJoined && microphone.getSnapshot().capture?.processor === processor)
            void acquireMic({ nativeOnly: true }).catch((err) => {
              if (err?.code !== 'VOICE_CANCELLED')
                setStatus('Microfone ativo, mas a redução nativa não iniciou.', 'warn');
            });
        },
      }),
    onTrackChanged: publishMicrophone,
  });
  microphone.subscribe(updateNoiseButton);
  const screenCapture = window.TronoVoiceCapture.createScreenCapture({
    mediaDevices: navigator.mediaDevices,
    getSettings: () => ({
      generation: voiceGeneration,
      joined: voiceJoined,
      format: qualityProfile().screen,
      replay: window.TronoClips?.captureProfile?.(),
      audio: shareStreamAudio,
      contentHint: screenContent,
    }),
    onStarted: publishScreen,
    onEnded: () => stopScreenShare(true),
    onAudioEnded: detachScreenAudio,
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
      generation: voiceGeneration,
      joined: voiceJoined,
      deviceId: selectedCamera,
      format: qualityProfile().camera,
    }),
    getStream: ensureLocalStream,
    onStarted: publishCamera,
    onStopped: cameraStopped,
    onDeviceMissing: (deviceId) => {
      if (selectedCamera !== deviceId) return;
      selectedCamera = '';
      storage.removeItem('tronoCameraInput');
    },
  });
  const cameraOn = () => cameraCapture.getSnapshot().capture !== null;
  cameraCapture.subscribe(renderCameraState);
  const p2pPeers = window.TronoVoiceCapture.createP2pPeers({
    getSettings: () => ({
      enabled: voiceJoined && !transportIsSfu() && !transportPending(),
      localId: meId(),
    }),
    createConnection: () => new RTCPeerConnection(p2pIceConfig()),
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
    getScreenWatch: (id) => watchingStreams.has(id),
    onTrack: (id, track, transceiver) => remoteMedia.attachPeer(id, track, transceiver),
    onClosed: clearPeerMedia,
    onStateChange: renderVoiceRoster,
    onStatus: peerStatus,
  });
  const peers = p2pPeers.connections;
  const remoteMedia = window.TronoVoiceCapture.createRemoteMedia({
    enabled: () => voiceJoined,
    createStream: () => new MediaStream(),
    getPeer: (id) => peers.get(id),
    isPeerCurrent: (id, pc) => p2pPeers.isCurrent(id, pc),
    getInterest: (id) => ({
      camera: !!privateVoiceRoster.get(id)?.camera && !hiddenCameras.has(id),
      screen: !!privateVoiceRoster.get(id)?.screen && watchingStreams.has(id),
    }),
    isCameraHidden: (id) => hiddenCameras.has(id),
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
      if ($('voiceOutputSelect')) $('voiceOutputSelect').value = audioPlayback.getSnapshot().output;
      setStatus(
        failed
          ? 'Não foi possível abrir a saída de áudio. Escolha outra saída em Configurações.'
          : 'Saída escolhida indisponível. Usando a saída padrão.',
        failed ? 'error' : 'warn',
      );
    },
  });

  const voiceTelemetry = window.TronoVoiceCapture.createVoiceTelemetry({
    protection: storage.getItem('mnVoiceProtection') !== '0',
    getSettings: () => ({
      joined: voiceJoined,
      transport: mediaTransport,
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
      if (!isCurrent() || !stability.sample(snapshot, performance.now(), adaptiveEnabled)) return;
      await applyQualityToLiveMedia();
      if (isCurrent())
        setStatus(
          stability.level
            ? 'Vídeo adaptado para aliviar ' + stability.reason + '.'
            : 'Qualidade de vídeo restaurada.',
          'ok',
        );
    },
    onChange: renderTelemetry,
  });

  const sfuSession = window.TronoVoiceCapture.createSfuSession({
    getSettings: () => ({
      enabled: voiceJoined && transportIsSfu(),
      screenAllowed: !!realtimeStatus?.screenAllowed,
      quality: cappedQuality(),
      screenBitrate: effectiveScreenBitrate(),
      videoBitrate: qualityProfile().videoBitrate,
      camera: qualityProfile().camera,
      screen: qualityProfile().screen,
      ice: sfuIceConfig,
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
        realtimeStatus = { ...realtimeStatus, highAllowed: false, maxQuality: 'balanced' };
        updateQualityUI();
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
    watchVersion: (id) => streamWatchVersions.get(id) || 0,
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
    publish: publishSfuTrack,
    closePublication: closeSfuPublication,
    closeSubscription: closeSfuSubscription,
    refreshPublications: refreshSfuPublicationList,
    syncSubscriptions: syncSfuSubscriptions,
    clearRetry: clearSfuRetry,
  } = sfuSession;

  const publicVoiceActive = () => !!roomState?.voiceActive;
  const detailedPlayers = () =>
    [...privateVoiceRoster.values()].sort((a, b) => (a.seat ?? 999) - (b.seat ?? 999));
  const inGame = () => !$('gameScreen')?.classList.contains('hidden');
  const communityVoice = () => roomState?.kind === 'chat';
  const inChatHub = () => chatHubMode || !$('chatOnlyScreen')?.classList.contains('hidden');
  const QUALITY_PROFILES = {
    economy: {
      label: 'Economia',
      camera: { width: 1280, height: 720, fps: 30 },
      screen: { width: 1280, height: 720, fps: 30 },
      videoBitrate: 900000,
      screenBitrate: 4000000,
      audioBitrate: 64000,
      hint: '720p/30 FPS.',
    },
    balanced: {
      label: 'Equilibrada',
      camera: { width: 1280, height: 720, fps: 30 },
      screen: { width: 1280, height: 720, fps: 30 },
      videoBitrate: 2200000,
      screenBitrate: 8000000,
      audioBitrate: 96000,
      hint: '720p/30 FPS.',
    },
    high: {
      label: 'Alta',
      camera: { width: 1280, height: 720, fps: 30 },
      screen: { width: 1280, height: 720, fps: 30 },
      videoBitrate: 3500000,
      screenBitrate: 10000000,
      audioBitrate: 128000,
      hint: '720p/30 FPS.',
    },
  };
  const QUALITY_ORDER = ['economy', 'balanced', 'high'];
  function cappedQuality() {
    const max = realtimeStatus?.maxQuality;
    if (
      mediaTransport === 'sfu' &&
      max &&
      QUALITY_ORDER.includes(max) &&
      QUALITY_ORDER.indexOf(transmissionQuality) > QUALITY_ORDER.indexOf(max)
    )
      return max;
    return transmissionQuality;
  }
  const effectiveScreenBitrate = () =>
    Math.min(
      screenBitrateMbps,
      realtimeStatus?.highAllowed === false && transportIsSfu() ? 6 : 15,
    ) * 1000000;
  const qualityProfile = () =>
    stability.profile({
      ...(QUALITY_PROFILES[cappedQuality()] || QUALITY_PROFILES.balanced),
      screen: SCREEN_FORMATS[screenFormat],
      screenBitrate: effectiveScreenBitrate(),
    });
  const transportIsSfu = () => mediaTransport === 'sfu';
  const transportPending = () => mediaTransport === 'sfu-pending' || mediaTransport === 'stopping';
  const announcedTransport = () =>
    mediaTransport === 'sfu'
      ? sfuLocalPublications.get('audio')?.ready
        ? 'sfu'
        : 'sfu-pending'
      : transportPending()
        ? 'sfu-pending'
        : 'p2p';
  const p2pIceConfig = () => ({
    ...rtcConfig,
    iceServers: [...(rtcConfig.iceServers || []), ...(sfuIceConfig.iceServers || [])],
  });
  let sfuIceConfig = {
    iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
    iceTransportPolicy: 'all',
  };
  let sfuTurnActive = false;

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
    if (
      deafened ||
      window.TronoAudio?.sfxEnabled === false ||
      storage.getItem('tronoSfxEnabled') === '0'
    )
      return;
    const key = `${kind}:${id}`,
      now = Date.now();
    if ((callSoundCooldown.get(key) || 0) > now - 750) return;
    callSoundCooldown.set(key, now);
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      if (!callSoundContext || callSoundContext.state === 'closed') callSoundContext = new Ctx();
      if (callSoundContext.state === 'suspended') callSoundContext.resume().catch(() => {});
      if (kind !== 'message' && callAlertVolume === 0) return;
      const ctx = callSoundContext,
        t = ctx.currentTime + 0.01,
        g = ctx.createGain();
      g.connect(ctx.destination);
      const level = kind === 'message' ? 0.11 : (0.52 * callAlertVolume) / 100;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), t + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'message' ? 0.36 : 0.65));
      const notes =
        kind === 'join'
          ? [784, 1047, 1568]
          : kind === 'message'
            ? [1320, 1760]
            : kind === 'disconnect'
              ? [740, 554, 370]
              : [1047, 698];
      notes.forEach((freq, i) => {
        const at = t + i * (kind === 'message' ? 0.11 : 0.17),
          o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, at);
        o.connect(g);
        o.start(at);
        o.stop(at + (kind === 'message' ? 0.18 : 0.22));
        o.onended = () => {
          o.disconnect();
          if (i === notes.length - 1) g.disconnect();
        };
      });
    } catch (err) {
      console.warn('[TronoSocial] aviso sonoro', err);
    }
  }
  function primeCallSounds() {
    if (window.TronoAudio?.sfxEnabled === false) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      if (!callSoundContext || callSoundContext.state === 'closed') callSoundContext = new Ctx();
      if (callSoundContext.state === 'suspended') void callSoundContext.resume().catch(() => {});
      if (audioPlayback.getSnapshot().output && callSoundContext.setSinkId)
        void callSoundContext.setSinkId(audioPlayback.getSnapshot().output).catch(() => {});
    } catch {}
  }
  function callNotice(event) {
    window.TronoCommunity?.voiceNotice?.(event);
  }
  function toggleVoiceSettings(force) {
    if (window.TronoDesktopSettings) return window.TronoDesktopSettings.toggle(force);
    settingsOpen = typeof force === 'boolean' ? force : !settingsOpen;
    const panel = $('voiceSettingsPanel'),
      btn = $('voiceSettingsBtn');
    panel?.classList.toggle('hidden', !settingsOpen);
    btn?.classList.toggle('settings-active', settingsOpen);
    btn?.setAttribute('aria-expanded', settingsOpen ? 'true' : 'false');
  }
  function setSettingsTab(tab = 'audio') {
    if (
      ![
        'audio',
        'video',
        'connection',
        'notifications',
        ...(window.TronoDesktop
          ? ['capture', 'account', 'appearance', 'game', 'activity', 'privacy']
          : []),
      ].includes(tab)
    )
      tab = 'audio';
    settingsTab = tab;
    storage.setItem('tronoVoiceSettingsTab', tab);
    document.querySelectorAll('[data-settings-tab]').forEach((btn) => {
      const on = btn.dataset.settingsTab === tab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
      const on = panel.dataset.settingsPanel === tab;
      panel.classList.toggle('active', on);
      panel.hidden = !on;
    });
  }
  function updateAudioPreferenceButtons() {
    const sfx = window.TronoAudio?.sfxEnabled ?? storage.getItem('tronoSfxEnabled') !== '0',
      music = window.TronoAudio?.musicEnabled ?? storage.getItem('tronoMusicEnabled') !== '0';
    const sb = $('voiceSfxBtn'),
      mb = $('voiceMusicBtn');
    if (sb) {
      sb.textContent = sfx ? '🔔 Efeitos: Ligados' : '🔕 Efeitos: Mutados';
      sb.classList.toggle('audio-muted', !sfx);
      sb.setAttribute('aria-pressed', sfx ? 'true' : 'false');
    }
    if (mb) {
      mb.textContent = music ? '♫ Música: Ligada' : '♫ Música: Mutada';
      mb.classList.toggle('audio-muted', !music);
      mb.setAttribute('aria-pressed', music ? 'true' : 'false');
    }
  }
  async function toggleVoiceSfx() {
    if (window.TronoAudio?.toggleSfx) window.TronoAudio.toggleSfx();
    else storage.setItem('tronoSfxEnabled', storage.getItem('tronoSfxEnabled') === '0' ? '1' : '0');
    updateAudioPreferenceButtons();
  }
  async function toggleVoiceMusic() {
    if (window.TronoAudio?.toggleMusic) await window.TronoAudio.toggleMusic();
    else
      storage.setItem(
        'tronoMusicEnabled',
        storage.getItem('tronoMusicEnabled') === '0' ? '1' : '0',
      );
    updateAudioPreferenceButtons();
  }
  function updateVoiceMusicUI() {
    const select = $('voiceMusicTrackSelect'),
      tracks = window.TRONO_MUSIC_TRACKS || {};
    if (select) {
      select.innerHTML = Object.entries(tracks)
        .map(([id, t]) => `<option value="${esc(id)}">${esc(t.label)} • ${esc(t.artist)}</option>`)
        .join('');
      select.value =
        window.TronoAudio?.currentTrack || storage.getItem('tronoMusicTrack') || 'lofi';
    }
    const volume = window.TronoAudio?.musicVolume ?? 32;
    if ($('voiceMusicVolume')) $('voiceMusicVolume').value = String(volume);
    if ($('voiceMusicVolumeValue')) $('voiceMusicVolumeValue').textContent = `${volume}%`;
  }
  function updateQualityUI() {
    const select = $('transmissionQualitySelect'),
      hint = $('qualityHint');
    if (select) {
      select.value = transmissionQuality;
      const p = realtimeStatus;
      for (const opt of select.options) {
        if (mediaTransport !== 'sfu' || !p) {
          opt.disabled = false;
          continue;
        }
        if (opt.value === 'high') opt.disabled = !p.highAllowed;
        else opt.disabled = false;
      }
    }
    if (hint) {
      const q = qualityProfile(),
        cap = cappedQuality();
      const why =
        cap !== transmissionQuality
          ? ' • Freio de uso ativo: qualidade reduzida automaticamente.'
          : '';
      hint.textContent = `${q.screen.height}p / ${q.screen.fps} FPS · Bitrate máximo: ${q.screenBitrate / 1000000} Mbps.${why} A taxa real depende da rede e do conteúdo.`;
    }
    if ($('screenBitrateSelect')) {
      $('screenBitrateSelect').value = String(screenBitrateMbps);
      for (const o of $('screenBitrateSelect').options)
        o.disabled =
          transportIsSfu() && realtimeStatus?.highAllowed === false && Number(o.value) > 6;
    }
    if ($('screenContentSelect')) $('screenContentSelect').value = screenContent;
    if ($('screenFormatSelect')) $('screenFormatSelect').value = screenFormat;
    if ($('shareStreamAudio')) $('shareStreamAudio').checked = shareStreamAudio;
    updateRealtimeUI();
  }
  function updateRealtimeUI() {
    const card = $('realtimeInfraCard'),
      mode = $('realtimeModeLabel'),
      usage = $('realtimeUsageLabel'),
      bar = $('realtimeUsageBar'),
      policy = $('realtimePolicyLabel');
    if (!card) return;
    const r = realtimeStatus;
    const modeState = voiceJoined ? announcedTransport() : mediaTransport;
    card.classList.toggle('realtime-live', modeState === 'sfu');
    card.classList.toggle('realtime-warning', !!r?.softWarning);
    card.classList.toggle('realtime-blocked', !!r?.hardBlocked);
    if (mode) {
      if (!inChatHub()) mode.textContent = 'WebRTC P2P (partida)';
      else if (modeState === 'sfu') mode.textContent = 'Cloudflare SFU';
      else if (modeState === 'sfu-pending') mode.textContent = 'Conectando ao SFU…';
      else if (!voiceJoined && r?.enabled && r?.configured && !r?.hardBlocked)
        mode.textContent = 'Cloudflare SFU pronto';
      else mode.textContent = 'WebRTC P2P (fallback)';
    }
    if (usage)
      usage.textContent = r
        ? `${Number(r.estimatedGb || 0).toFixed(2)} / ${Number(r.thresholds?.hard || 950).toFixed(0)} GB estimados • margem ${Number(r.estimateSafetyFactor || 1).toFixed(1)}×`
        : realtimeSyncError || 'Aguardando dados do backend';
    if (bar) {
      const hard = Number(r?.thresholds?.hard || 950),
        v = Math.min(100, Math.max(0, (Number(r?.estimatedGb || 0) / hard) * 100));
      bar.style.setProperty('--realtime-progress', `${v}%`);
      bar.setAttribute('aria-valuenow', String(Math.round(v)));
    }
    if (policy) {
      if (!r)
        policy.textContent = realtimeSyncError
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
  async function syncRealtimeStatus({ quiet = true } = {}) {
    if (!window.TronoNetwork?.connected) {
      updateRealtimeUI();
      return null;
    }
    try {
      const status = await window.TronoNetwork.getRealtimeStatus();
      realtimeSyncError = '';
      await applyRealtimeStatus(status);
      return status;
    } catch (err) {
      console.warn('[TronoSocial] status Realtime', err?.code || err);
      realtimeSyncError = 'Falha ao sincronizar com o backend';
      updateRealtimeUI();
      if (!quiet)
        setStatus(
          'Não foi possível conferir o servidor de mídia. Tentando sincronizar novamente.',
          'warn',
        );
      return null;
    }
  }
  function startRealtimeStatusSync() {
    if (realtimeSyncTimer) clearInterval(realtimeSyncTimer);
    void syncRealtimeStatus({ quiet: true });
    realtimeSyncTimer = setInterval(() => {
      if (document.visibilityState !== 'hidden' && window.TronoNetwork?.connected)
        void syncRealtimeStatus({ quiet: true });
    }, 15000);
  }

  function cameraErrorMessage(err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError')
      return 'Permita o acesso à câmera nas configurações deste site no navegador.';
    if (err?.name === 'NotReadableError' || err?.name === 'AbortError')
      return 'A câmera está ocupada ou não iniciou. Feche outros aplicativos que usam a câmera e escolha a entrada em Configurações → Vídeo.';
    if (err?.name === 'NotFoundError')
      return 'Nenhuma câmera disponível. Conecte uma câmera e escolha a entrada em Configurações → Vídeo.';
    if (err?.name === 'OverconstrainedError')
      return 'Esta câmera não aceitou a captura. Escolha outra entrada em Configurações → Vídeo.';
    return err?.message || 'Não foi possível abrir a câmera.';
  }
  async function refreshSfuIceConfig() {
    const generation = voiceGeneration;
    try {
      const r = await window.TronoNetwork?.requestSfu('ice-config', {}, 8000);
      if (generation !== voiceGeneration) return;
      if (Array.isArray(r?.iceServers) && r.iceServers.length) {
        sfuIceConfig = { iceServers: r.iceServers, iceTransportPolicy: 'all' };
        sfuTurnActive = !!r.turn;
        return;
      }
    } catch (err) {
      if (generation !== voiceGeneration) return;
      console.warn('[TronoSocial] ICE/TURN', err?.code || err);
    }
    sfuIceConfig = {
      iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
      iceTransportPolicy: 'all',
    };
    sfuTurnActive = false;
  }
  function applySenderQuality(sender, kind) {
    if (!sender) return Promise.resolve();
    const next = (senderQualityQueues.get(sender) || Promise.resolve())
      .catch(() => {})
      .then(() => applySenderQualityNow(sender, kind));
    senderQualityQueues.set(sender, next);
    return next;
  }
  async function applySenderQualityNow(sender, kind) {
    if (!sender?.track || !sender.setParameters) return;
    try {
      const p = sender.getParameters() || {};
      if (!p.encodings?.length) p.encodings = [{}];
      const q = qualityProfile();
      if (kind === 'audio' || kind === 'screen-audio') {
        p.encodings[0].maxBitrate = kind === 'screen-audio' ? 192000 : q.audioBitrate;
      } else if (kind === 'screen') {
        p.degradationPreference = 'maintain-resolution';
        sender.track.contentHint = screenContent;
        const source = sender.track.getSettings?.() || {};
        const scale = Math.max(
          1,
          (source.width || q.screen.width) / q.screen.width,
          (source.height || q.screen.height) / q.screen.height,
        );
        const byRid = {
          f: q.screenBitrate,
          h: Math.max(500000, Math.round(q.screenBitrate * 0.42)),
          q: Math.max(250000, Math.round(q.screenBitrate * 0.18)),
        };
        for (const e of p.encodings) {
          e.scaleResolutionDownBy = scale * (e.rid === 'h' ? 2 : e.rid === 'q' ? 4 : 1);
          e.maxBitrate = byRid[e.rid] || q.screenBitrate;
          e.maxFramerate =
            e.rid === 'q'
              ? Math.min(q.screen.fps, 20)
              : e.rid === 'h'
                ? Math.min(q.screen.fps, 30)
                : q.screen.fps;
        }
      } else if (p.encodings.length >= 3 && p.encodings.some((e) => e.rid)) {
        const byRid = {
          f: q.videoBitrate,
          h: Math.max(180000, Math.round(q.videoBitrate * 0.42)),
          q: Math.max(90000, Math.round(q.videoBitrate * 0.16)),
        };
        for (const e of p.encodings) {
          e.maxBitrate = byRid[e.rid] || q.videoBitrate;
          e.maxFramerate = q.camera.fps;
        }
      } else {
        p.encodings[0].maxBitrate = q.videoBitrate;
        p.encodings[0].maxFramerate = q.camera.fps;
      }
      await sender.setParameters(p);
    } catch (err) {
      console.warn('[TronoSocial] parâmetros de qualidade', kind, err);
    }
  }
  async function applyQualityToLiveMedia() {
    try {
      await cameraCapture.refreshQuality();
    } catch (err) {
      console.warn('[TronoSocial] qualidade câmera', err);
    }
    try {
      screenCapture.refreshHint();
    } catch (err) {
      console.warn('[TronoSocial] qualidade tela', err);
    }
    const jobs = [];
    for (const pc of peers.values()) {
      jobs.push(
        applySenderQuality(pc._tronoAudioSender, 'audio'),
        applySenderQuality(pc._tronoVideoSender, 'camera'),
        applySenderQuality(pc._tronoScreenSender, 'screen'),
        applySenderQuality(pc._tronoScreenAudioSender, 'screen-audio'),
      );
    }
    for (const pub of sfuLocalPublications.values())
      jobs.push(applySenderQuality(pub.sender, pub.kind));
    await Promise.allSettled(jobs);
    if (transportIsSfu()) await updateAllSfuSubscriptionLayers();
  }
  async function changeTransmissionQuality(e) {
    let requested = e?.target?.value || transmissionQuality;
    if (!QUALITY_PROFILES[requested]) requested = 'balanced';
    if (
      mediaTransport === 'sfu' &&
      realtimeStatus?.maxQuality &&
      QUALITY_ORDER.indexOf(requested) > QUALITY_ORDER.indexOf(realtimeStatus.maxQuality)
    ) {
      requested = realtimeStatus.maxQuality;
      setStatus(
        `Freio de consumo: qualidade limitada a ${QUALITY_PROFILES[requested].label}.`,
        'warn',
      );
    }
    transmissionQuality = requested;
    storage.setItem('tronoTransmissionQuality', transmissionQuality);
    updateQualityUI();
    await applyQualityToLiveMedia();
    window.TronoNetwork?.setVoiceState(
      voiceJoined,
      micMuted,
      cameraOn(),
      screenSharing(),
      transmissionQuality,
      announcedTransport(),
    );
    setStatus(`Qualidade ${qualityProfile().label.toLowerCase()} aplicada.`, 'ok');
  }
  function preferredRidForMedia(kind, maximized = false) {
    if (stability.level) return stability.level === 2 ? 'q' : 'h';
    if (maximized) return 'f';
    return kind === 'screen' && cappedQuality() !== 'economy' ? 'f' : preferredRidForQuality();
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
        localScreenCollapsed = false;
        localScreenPreviewPaused = false;
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
  async function toggleWatchCamera(id) {
    if (!voiceJoined || id === meId() || !privateVoiceRoster.get(id)?.camera) return;
    const hidden = !hiddenCameras.has(id);
    if (hidden) hiddenCameras.add(id);
    else hiddenCameras.delete(id);
    for (const track of remoteMedia.getStreams(id).av.getVideoTracks()) track.enabled = !hidden;
    const key = sfuKey(id, 'camera');
    clearSfuRetry(key);
    if (hidden) {
      const full = document.fullscreenElement;
      if (full?.classList.contains('camera-tile') && full.dataset.peer === id)
        await document.exitFullscreen().catch(() => {});
      for (const tile of document.querySelectorAll('#socialPanel .camera-tile'))
        if (tile.dataset.peer === id) {
          tile.classList.remove('media-maximized');
          const video = tile.querySelector('video');
          video.pause();
          video.srcObject = null;
        }
      if (!document.querySelector('.media-maximized'))
        document.body.classList.remove('media-focus-open');
      if (transportIsSfu()) void closeSfuSubscription(key);
    }
    if (transportIsSfu()) void syncSfuSubscriptions();
    renderVoiceRoster();
    renderVideoGrid();
    renderSeatMedia();
    window.dispatchEvent(new CustomEvent('trono-media-change'));
  }

  async function enumerateDevices() {
    const input = $('voiceInputSelect'),
      output = $('voiceOutputSelect'),
      camera = $('cameraInputSelect');
    if (!input || !output || !camera) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const ins = devices.filter((d) => d.kind === 'audioinput'),
        outs = devices.filter((d) => d.kind === 'audiooutput'),
        cams = devices.filter((d) => d.kind === 'videoinput');
      input.innerHTML =
        '<option value="">Microfone padrão</option>' +
        ins
          .filter((d) => d.deviceId)
          .map(
            (d, i) =>
              `<option value="${esc(d.deviceId)}">${esc(d.label || `Microfone ${i + 1}`)}</option>`,
          )
          .join('');
      output.innerHTML =
        '<option value="">Saída padrão</option>' +
        outs
          .filter((d) => d.deviceId)
          .map(
            (d, i) =>
              `<option value="${esc(d.deviceId)}">${esc(d.label || `Saída ${i + 1}`)}</option>`,
          )
          .join('');
      camera.innerHTML =
        '<option value="">Câmera padrão</option>' +
        cams
          .filter((d) => d.deviceId)
          .map(
            (d, i) =>
              `<option value="${esc(d.deviceId)}">${esc(d.label || `Câmera ${i + 1}`)}</option>`,
          )
          .join('');
      if (ins.some((d) => d.deviceId === selectedInput)) input.value = selectedInput;
      else selectedInput = input.value || '';
      if (outs.some((d) => d.deviceId === audioPlayback.getSnapshot().output))
        output.value = audioPlayback.getSnapshot().output;
      else if (audioPlayback.getSnapshot().output) void audioPlayback.setOutput(output.value || '');
      if (cams.some((d) => d.deviceId === selectedCamera)) camera.value = selectedCamera;
      else if (cams.some((d) => d.deviceId)) {
        selectedCamera = '';
        camera.value = '';
        storage.removeItem('tronoCameraInput');
      }
      if (!('setSinkId' in HTMLMediaElement.prototype)) {
        output.disabled = true;
        output.title = 'Este navegador não permite escolher a saída de áudio pelo site.';
      }
      updateNoiseButton();
    } catch (err) {
      console.warn('[TronoSocial] dispositivos', err);
    }
  }

  async function publishMicrophone({ stream, track, reason, isCurrent }) {
    if (!isCurrent()) return;
    if (reason === 'resume') {
      for (const pc of peers.values()) {
        if (!isCurrent()) return;
        await p2pPeers.syncTracks(pc);
      }
      if (!isCurrent()) return;
      const pub = sfuLocalPublications.get('audio');
      if (pub?.sender) await pub.sender.replaceTrack(track);
      if (isCurrent()) void speakingIndicators.watch(meId(), stream);
      return;
    }
    for (const [id, pc] of [...peers])
      if (pc._tronoAudioSender && isCurrent()) {
        try {
          await p2pPeers.syncTracks(pc);
        } catch (err) {
          if (!isCurrent()) return;
          console.warn('[TronoSocial] reconectando novo microfone', err);
          closePeer(id);
          p2pPeers.ensure(id);
        }
      }
    if (!isCurrent()) return;
    const sfuAudio = sfuLocalPublications.get('audio');
    if (sfuAudio?.sender) {
      try {
        await sfuAudio.sender.replaceTrack(track);
        if (!isCurrent()) return;
        await applySenderQuality(sfuAudio.sender, 'audio');
      } catch (err) {
        if (!isCurrent()) return;
        try {
          await publishSfuTrack('audio', track);
        } catch (error) {
          if (!isCurrent()) return;
          void sfuSession.recoverPublication('audio', error);
        }
      }
    }
    if (isCurrent()) await enumerateDevices();
  }
  function acquireMic(options) {
    return microphone.acquire(options);
  }
  function refreshMicPipeline() {
    updateNoiseButton();
    return voiceJoined ? microphone.refresh() : Promise.resolve();
  }

  function acquireCamera() {
    return cameraCapture.acquire();
  }
  async function syncCameraSender(pc) {
    const sender = pc._tronoVideoSender;
    if (!sender) return;
    // A delayed attach/detach can finish after the next camera operation.
    // Reconcile that same sender with the currently owned track before returning.
    while (voiceJoined && [...peers.values()].includes(pc)) {
      await sender.replaceTrack(cameraCapture.getSnapshot().capture?.track || null);
      if (sender.track === (cameraCapture.getSnapshot().capture?.track || null)) return;
    }
  }
  async function publishCamera({ capture, isCurrent }) {
    const track = capture.track;
    if (!isCurrent()) return;
    // Announce before publication, which may wait on a slow peer or SFU.
    announceCamera();
    if (transportIsSfu()) {
      try {
        const existing = sfuLocalPublications.get('camera');
        if (existing?.sender) {
          await existing.sender.replaceTrack(track);
          if (!isCurrent()) return;
          await applySenderQuality(existing.sender, 'camera');
        } else await publishSfuTrack('camera', track);
      } catch (err) {
        if (!isCurrent()) return;
        console.warn('[TronoSocial] recuperar câmera SFU', err?.code || err);
        void sfuSession.recoverPublication('camera', err);
      }
    }
    if (!isCurrent()) return;
    if (!transportIsSfu())
      await Promise.all(
        [...peers.values()].map(async (pc) => {
          if (!isCurrent()) return;
          if (pc._tronoVideoSender) {
            await syncCameraSender(pc).catch(() => {});
            if (!isCurrent()) return;
            await applySenderQuality(pc._tronoVideoSender, 'camera');
          }
        }),
      );
    if (!isCurrent()) return;
    announceCamera();
    await enumerateDevices();
  }
  function renderCameraState() {
    updateButtons();
    renderVideoGrid();
    renderSeatMedia();
    renderVoiceRoster();
  }
  function announceCamera() {
    window.TronoNetwork?.setVoiceState(
      voiceJoined,
      micMuted,
      cameraOn(),
      screenSharing(),
      transmissionQuality,
      announcedTransport(),
    );
    renderCameraState();
  }
  function cameraStopped() {
    if (!voiceJoined) return;
    cameraTogglePending = null;
    announceCamera();
    // Device release and state announcements cannot wait for transport detach.
    if (transportIsSfu()) void closeSfuPublication('camera');
    else
      void Promise.allSettled(
        [...peers.values()].map(async (pc) => {
          await syncCameraSender(pc);
        }),
      );
  }

  async function publishScreen({ capture, replace, isCurrent }) {
    const stream = capture.outgoing,
      track = stream.getVideoTracks()[0];
    localScreenPreviewPaused = false;
    localScreenCollapsed = false;
    window.TronoNetwork?.setVoiceState(
      true,
      micMuted,
      cameraOn(),
      true,
      transmissionQuality,
      announcedTransport(),
    );
    updateButtons();
    renderScreenGrid();
    renderVoiceRoster();
    if (transportIsSfu()) {
      try {
        // Reuse publications and subscriptions when changing an active source.
        await Promise.all(
          [
            ['screen', track],
            ['screen-audio', stream.getAudioTracks()[0]],
          ].map(async ([kind, next]) => {
            try {
              if (!isCurrent()) return;
              const publication = replace ? sfuLocalPublications.get(kind) : null;
              if (next && publication?.sender) {
                await publication.sender.replaceTrack(next);
                if (!isCurrent()) return;
                await applySenderQuality(publication.sender, kind);
              } else if (next) await publishSfuTrack(kind, next);
              else if (publication) await closeSfuPublication(kind);
            } catch (error) {
              if (isCurrent()) void sfuSession.recoverPublication(kind, error);
            }
          }),
        );
      } catch (err) {
        if (!isCurrent()) return;
        console.warn('[TronoSocial] recuperar tela SFU', err?.code || err);
        void sfuSession.recoverPublication('screen', err);
      }
    }
    if (!transportIsSfu())
      await Promise.all(
        [...peers.values()].map(async (pc) => {
          if (isCurrent()) await p2pPeers.syncTracks(pc);
        }),
      );
    if (!isCurrent()) return;
    const sound = stream.getAudioTracks()[0];
    window.TronoNetwork?.setVoiceState(
      true,
      micMuted,
      cameraOn(),
      true,
      transmissionQuality,
      announcedTransport(),
    );
    updateButtons();
    renderScreenGrid();
    renderVoiceRoster();
    setStatus(
      sound
        ? 'Compartilhando tela e áudio.'
        : shareStreamAudio
          ? 'Tela compartilhada sem áudio. Marque Compartilhar áudio no seletor do navegador quando disponível.'
          : 'Compartilhando tela sem áudio.',
      sound ? 'ok' : 'warn',
    );
  }
  async function detachScreenAudio({ isCurrent }) {
    if (!isCurrent()) return;
    if (transportIsSfu()) await closeSfuPublication('screen-audio');
    else
      for (const pc of peers.values()) {
        if (!isCurrent()) return;
        await pc._tronoScreenAudioSender?.replaceTrack(null);
      }
    if (isCurrent()) renderScreenGrid();
  }
  async function startScreenShare({ replace = false } = {}) {
    if (!communityVoice()) return false;
    if (screenSharing() && !replace) return true;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatus('Compartilhamento de tela não é suportado neste navegador.', 'error');
      return false;
    }
    if (!voiceJoined && !(await joinVoice())) return false;
    if (transportIsSfu() && realtimeStatus && !realtimeStatus.screenAllowed) {
      setStatus('Compartilhamento bloqueado pelo freio mensal de consumo.', 'warn');
      return false;
    }
    try {
      return await screenCapture.start({ replace });
    } catch (err) {
      setStatus(
        ['NotAllowedError', 'AbortError'].includes(err?.name)
          ? replace && screenSharing()
            ? 'Troca cancelada. A tela anterior continua sendo compartilhada.'
            : 'Compartilhamento de tela cancelado.'
          : err.message || 'Não foi possível compartilhar a tela.',
        'error',
      );
      return false;
    }
  }
  async function switchScreenShare() {
    if (screenSharing()) return startScreenShare({ replace: true });
    return false;
  }
  async function stopScreenShare(sendState = true) {
    if (!screenCapture.stop()) return;
    localScreenPreviewPaused = false;
    localScreenCollapsed = false;
    if (sendState)
      window.TronoNetwork?.setVoiceState(
        voiceJoined,
        micMuted,
        cameraOn(),
        false,
        transmissionQuality,
        announcedTransport(),
      );
    updateButtons();
    renderScreenGrid();
    renderVoiceRoster();
    if (transportIsSfu()) {
      void closeSfuPublication('screen-audio');
      void closeSfuPublication('screen');
    } else
      void Promise.allSettled(
        [...peers.values()].flatMap((pc) => {
          p2pPeers.stopWatching(pc);
          return [pc._tronoScreenSender, pc._tronoScreenAudioSender]
            .filter(Boolean)
            .map(async (sender) => sender.replaceTrack(null));
        }),
      );
  }
  async function toggleScreenShare() {
    if (screenSharing()) await stopScreenShare(true);
    else openScreenOptions();
  }
  function openScreenOptions() {
    if (!voiceJoined) return;
    const setting = SCREEN_FORMATS[screenFormat];
    $('shareResolution').value = String(setting.height);
    $('shareFps').value = String(setting.fps);
    $('shareAudio').checked = shareStreamAudio;
    const limited = transportIsSfu() && realtimeStatus?.highAllowed === false;
    $('shareResolution').querySelector('[value="1080"]').disabled = limited;
    $('shareFps').querySelector('[value="60"]').disabled = limited;
    if (limited) {
      $('shareResolution').value = '720';
      if (setting.fps === 60) $('shareFps').value = '30';
    }
    $('shareOptionsNote').textContent = limited
      ? 'O limite de consumo atual permite até 720p / 30 FPS.'
      : 'Escolha a qualidade; em seguida, o navegador perguntará qual tela ou aba compartilhar.';
    $('shareReplayHelp').textContent = window.TronoClips?.captureProfile?.()
      ? 'O replay será preparado automaticamente para clipar pelo botão ✂ na barra da chamada, com o áudio da tela quando disponível.'
      : 'Replay desligado. Ative em Meus clipes → Preferências para preparar clipes ao compartilhar.';
    $('screenOptionsDialog').showModal();
  }
  function confirmScreenOptions(e) {
    e.preventDefault();
    if (!voiceJoined) {
      $('screenOptionsDialog').close();
      return;
    }
    screenFormat = $('shareResolution').value + '-' + $('shareFps').value;
    if (!SCREEN_FORMATS[screenFormat]) return;
    transmissionQuality = $('shareResolution').value === '1080' ? 'high' : 'balanced';
    screenBitrateMbps =
      $('shareResolution').value === '1080'
        ? $('shareFps').value === '60'
          ? 10
          : 8
        : $('shareFps').value === '15'
          ? 4
          : 6;
    shareStreamAudio = $('shareAudio').checked;
    storage.setItem('mnScreenFormat', screenFormat);
    storage.setItem('mnScreenBitrate', String(screenBitrateMbps));
    storage.setItem('tronoTransmissionQuality', transmissionQuality);
    storage.setItem('mnShareStreamAudio', shareStreamAudio ? '1' : '0');
    updateQualityUI();
    $('screenOptionsDialog').close();
    // Call capture directly from this click, retaining the browser's user activation.
    void startScreenShare();
  }
  function toggleLocalScreenPreview() {
    if (!screenSharing()) return;
    localScreenPreviewPaused = !localScreenPreviewPaused;
    if (localScreenPreviewPaused) localScreenCollapsed = true;
    renderScreenGrid();
    setStatus(
      localScreenPreviewPaused
        ? 'Prévia local pausada. A transmissão continua normalmente.'
        : 'Prévia local restaurada.',
      'ok',
    );
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
  function preferredRidForQuality(q = cappedQuality()) {
    return q === 'economy' ? 'q' : 'f';
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
      !sfuTurnActive &&
      ['SFU_CONNECT_TIMEOUT', 'NETWORK_CLOSED', 'NETWORK_OFFLINE'].includes(code)
    )
      message += ' A rota ICE falhou; TURN pode ajudar em redes móveis/CGNAT.';
    setStatus(message, 'warn');
    renderTelemetry();
  }
  async function updateAllSfuSubscriptionLayers() {
    await Promise.allSettled(
      [...sfuSubscriptions.values()]
        .filter((sub) => ['camera', 'screen'].includes(sub.kind))
        .map((sub) => sfuSession.setLayer(sub.key, preferredRidForMedia(sub.kind, false))),
    );
  }
  async function stopSfuTransport({ toP2p = true } = {}) {
    mediaTransport = 'stopping';
    sfuSession.reset();
    for (const { key: id } of audioPlayback.getSnapshot().entries) {
      removeRemoteAudio(id);
      if (id !== meId()) speakingIndicators.remove(id);
    }
    remoteMedia.reset();
    mediaTransport = toP2p ? 'p2p' : 'none';
    updateRealtimeUI();
    renderVideoGrid();
    renderScreenGrid();
    renderSeatMedia();
  }
  async function startSfuTransport({ callGeneration = voiceGeneration } = {}) {
    if (!voiceJoined || !communityVoice()) return false;
    const generation = sfuSession.getGeneration(),
      ensureCurrent = () => {
        if (
          !voiceJoined ||
          callGeneration !== voiceGeneration ||
          generation !== sfuSession.getGeneration() ||
          roomVoiceMode === 'p2p'
        )
          throw Object.assign(new Error('Entrada SFU cancelada.'), { code: 'SFU_CANCELLED' });
      };
    mediaTransport = 'sfu-pending';
    updateRealtimeUI();
    try {
      await refreshSfuIceConfig();
      ensureCurrent();
      let status = await syncRealtimeStatus({ quiet: true });
      ensureCurrent();
      if (!status) {
        setStatus('Conferindo o servidor de mídia novamente…', 'warn');
        await new Promise((resolve) => setTimeout(resolve, 500));
        ensureCurrent();
        status = await syncRealtimeStatus({ quiet: true });
      }
      realtimeStatus = status || realtimeStatus;
      updateQualityUI();
      ensureCurrent();
      if (
        roomVoiceMode === 'p2p' ||
        !status?.enabled ||
        !status?.configured ||
        status?.hardBlocked
      ) {
        mediaTransport = 'p2p';
        updateRealtimeUI();
        return false;
      }
      mediaTransport = 'sfu';
      lastSfuError = '';
      closeAllPeers();
      updateRealtimeUI();
      const audio = localStream?.getAudioTracks?.()[0];
      if (audio) {
        try {
          await publishSfuTrack('audio', audio);
        } catch (error) {
          if (!(await sfuSession.recoverPublication('audio', error))) {
            ensureCurrent();
            return false;
          }
        }
      }
      const camera = localStream?.getVideoTracks?.()[0];
      if (cameraOn() && camera)
        void publishSfuTrack('camera', camera).catch((error) =>
          sfuSession.recoverPublication('camera', error),
        );
      const screen = screenCapture.getCapture()?.outgoing?.getVideoTracks?.()[0];
      if (screenSharing() && screen && status.screenAllowed)
        void publishSfuTrack('screen', screen).catch((error) =>
          sfuSession.recoverPublication('screen', error),
        );
      const screenAudio = screenCapture.getCapture()?.outgoing?.getAudioTracks?.()[0];
      if (screenSharing() && screenAudio && status.screenAllowed)
        void publishSfuTrack('screen-audio', screenAudio).catch((error) =>
          sfuSession.recoverPublication('screen-audio', error),
        );
      window.TronoNetwork?.setVoiceState(
        true,
        micMuted,
        cameraOn(),
        screenSharing(),
        transmissionQuality,
        'sfu',
      );
      await syncSfuSubscriptions();
      ensureCurrent();
      syncPeers();
      setStatus('Voz conectada pelo Cloudflare SFU.', 'ok');
      return true;
    } catch (err) {
      if (
        err?.code === 'SFU_CANCELLED' ||
        callGeneration !== voiceGeneration ||
        generation !== sfuSession.getGeneration()
      )
        return false;
      console.warn('[TronoSocial] inicialização SFU', err);
      lastSfuError = `Áudio: ${err.code || err.name || 'SFU_ERROR'} — ${err.message || 'falha ao conectar'}`;
      await stopSfuTransport({ toP2p: true });
      setStatus(
        `SFU não conectou (${err.code || err.name || 'SFU_ERROR'}). Tentando áudio por P2P…`,
        'warn',
      );
      return false;
    }
  }
  async function fallbackToP2p(reason = 'SFU indisponível; retornando ao P2P.') {
    if (!voiceJoined) return;
    window.TronoNetwork?.fallbackVoice?.();
    roomVoiceMode = 'p2p';
    if (mediaTransport === 'p2p') return;
    const generation = voiceGeneration;
    await stopSfuTransport({ toP2p: true });
    if (!voiceJoined || generation !== voiceGeneration) return;
    window.TronoNetwork?.setVoiceState(
      true,
      micMuted,
      cameraOn(),
      screenSharing(),
      transmissionQuality,
      'p2p',
    );
    setStatus(reason, 'warn');
    syncPeers();
  }
  async function applyRealtimeStatus(status) {
    if (!status) return;
    realtimeStatus = status;
    updateQualityUI();
    if (transportIsSfu() && (!status.enabled || status.hardBlocked)) {
      await fallbackToP2p(
        status.hardBlocked
          ? 'Limite de segurança atingido; mídia voltou ao P2P.'
          : 'Cloudflare Realtime foi desligado; mídia voltou ao P2P.',
      );
      return;
    }
    if (transportIsSfu() && !status.screenAllowed && screenSharing()) await stopScreenShare(true);
    if (
      transportIsSfu() &&
      status.maxQuality &&
      QUALITY_ORDER.indexOf(transmissionQuality) > QUALITY_ORDER.indexOf(status.maxQuality)
    ) {
      transmissionQuality = status.maxQuality;
      storage.setItem('tronoTransmissionQuality', transmissionQuality);
      updateQualityUI();
      await applyQualityToLiveMedia();
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
        sfuTurnActive
          ? 'Não foi possível conectar o áudio com este participante. Saia e entre na voz para tentar novamente.'
          : 'P2P sem rota de áudio. Verifique TURN em Configurações → Conexão.',
        'error',
      );
  }

  function syncPeers() {
    if (!voiceJoined) {
      closeAllPeers();
      renderVoiceRoster();
      renderVideoGrid();
      renderScreenGrid();
      renderSeatMedia();
      return;
    }
    if (transportPending()) {
      closeAllPeers();
      renderVoiceRoster();
      renderVideoGrid();
      renderScreenGrid();
      renderSeatMedia();
      return;
    }
    if (transportIsSfu()) {
      closeAllPeers();
      void syncSfuSubscriptions();
      renderVoiceRoster();
      renderVideoGrid();
      renderScreenGrid();
      renderSeatMedia();
      return;
    }
    // Wait until both endpoints have announced P2P readiness before sending SDP.
    const me = meId(),
      active = new Set(
        detailedPlayers()
          .filter((p) => p.id !== me && p.joined && p.transport === 'p2p')
          .map((p) => p.id),
      );
    for (const id of active) {
      const pc = p2pPeers.ensure(id);
      if (pc?.connectionState === 'failed') p2pPeers.negotiate(id, true, true);
    }
    for (const id of [...peers.keys()]) if (!active.has(id)) closePeer(id);
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
      muted = self ? micMuted : !!p.muted,
      cam = self ? cameraOn() : !!p.camera,
      screen = self ? screenSharing() : !!p.screen,
      transport = self ? announcedTransport() : p.transport || 'p2p';
    return (
      (muted ? 'microfone mutado' : speakingIndicators.isSpeaking(p.id) ? 'falando…' : 'na voz') +
      ((self ? deafened : p.deafened) ? ' • áudio silenciado' : '') +
      (cam ? (hiddenCameras.has(p.id) ? ' • câmera oculta' : ' • 📷 câmera') : '') +
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
      voiceJoined &&
      detailedPlayers().some((p) => (p.id === meId() ? screenSharing() : p.screen))
    );
  }
  function renderVoiceRoster() {
    const host = $('voiceRoster');
    if (!host) return;
    const stage = host.closest('.mn-media-stage');
    stage?.classList.toggle(
      'has-screen',
      voiceJoined &&
        detailedPlayers().some(
          (p) =>
            !screenInProfile(p.id) &&
            (p.id === meId() ? screenSharing() : p.screen && watchingStreams.has(p.id)),
        ),
    );
    stage?.classList.toggle(
      'has-camera',
      voiceJoined &&
        detailedPlayers().some((p) =>
          p.id === meId() ? cameraOn() : p.camera && !hiddenCameras.has(p.id),
        ),
    );
    stage?.classList.toggle('screens-layout', camerasInProfiles());
    stage?.classList.toggle(
      'room-idle',
      voiceJoined &&
        !detailedPlayers().some((p) =>
          p.id === meId()
            ? cameraOn() || screenSharing()
            : (p.camera && !hiddenCameras.has(p.id)) || p.screen,
        ),
    );
    const title = stage?.querySelector('.mosaic-toolbar strong');
    if (title)
      title.textContent = stage.classList.contains('room-idle') ? 'Na chamada' : 'Câmeras & telas';
    const roomName = roomState?.name || (inChatHub() ? 'Geral' : 'Voz da mesa');
    if ($('mnStageRoomName')) $('mnStageRoomName').textContent = roomName;
    if ($('textVoiceRoomName')) $('textVoiceRoomName').textContent = 'Voz conectada · ' + roomName;
    if (!voiceJoined) {
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
        muted = self ? micMuted : !!p.muted,
        silenced = self ? deafened : !!p.deafened,
        cam = self ? cameraOn() : !!p.camera,
        screen = self ? screenSharing() : !!p.screen,
        speaking = !muted && speakingIndicators.isSpeaking(p.id),
        transport = self ? announcedTransport() : p.transport || 'p2p',
        hidden = hiddenCameras.has(p.id);
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
        card.querySelector('.participant-camera-toggle').onclick = () =>
          void toggleWatchCamera(p.id);
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
        screenDock = screenInProfile(p.id) && screen && (self || watchingStreams.has(p.id));
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
    if (p.id !== meId() && hiddenCameras.has(p.id)) return false;
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
    if (!voiceJoined) {
      host.className = 'camera-grid camera-grid-empty camera-grid-private';
      host.innerHTML =
        '<div class="camera-grid-note">Entre na voz para acessar as câmeras da chamada.</div>';
      return;
    }
    const me = meId(),
      players = detailedPlayers(),
      visible = players.filter((p) =>
        p.id === me ? cameraOn() : p.camera && !hiddenCameras.has(p.id),
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
    for (const id of [...watchingStreams])
      if (!privateVoiceRoster.get(id)?.screen) {
        watchingStreams.delete(id);
        removeRemoteAudio(streamAudioKey(id));
      }
    if (!voiceJoined || !communityVoice()) {
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
        watching = self || watchingStreams.has(p.id);
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
          .querySelector('.mn-watch-stream')
          .addEventListener('click', () => toggleWatchStream(p.id));
        tile
          .querySelector('.mn-stream-volume input')
          .addEventListener('input', (e) => setStreamGain(p.id, e.target.value));
        tile.querySelector('.screen-resource-btn').addEventListener('click', (ev) => {
          ev.stopPropagation();
          toggleLocalScreenPreview();
        });
        tile.querySelector('.screen-switch-btn').addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const button = ev.currentTarget;
          button.disabled = true;
          try {
            await switchScreenShare();
          } finally {
            button.disabled = false;
          }
        });
        tile.querySelector('.screen-collapse-btn').addEventListener('click', async (ev) => {
          ev.stopPropagation();
          if (document.fullscreenElement === tile) await document.exitFullscreen().catch(() => {});
          tile.classList.remove('media-maximized');
          document.body.classList.remove('media-focus-open');
          if (self) localScreenCollapsed = !localScreenCollapsed;
          else tile.dataset.collapsed = tile.dataset.collapsed === '1' ? '0' : '1';
          renderScreenGrid();
        });
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
      resource.textContent = localScreenPreviewPaused
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
      tile.classList.toggle('local-preview-paused', self && localScreenPreviewPaused);
      const collapsed = watching && (self ? localScreenCollapsed : tile.dataset.collapsed === '1');
      tile.classList.toggle('share-collapsed', collapsed);
      const collapse = tile.querySelector('.screen-collapse-btn');
      collapse.textContent = collapsed ? '▣' : '—';
      collapse.title = collapsed ? 'Restaurar compartilhamento' : 'Minimizar compartilhamento';
      const placeholder = tile.querySelector('.screen-share-placeholder');
      if (!watching) {
        video.pause();
        video.srcObject = null;
      } else if (self && localScreenPreviewPaused) {
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
        live && !collapsed && !(self && localScreenPreviewPaused),
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
      const speaking = !(p.id === me ? micMuted : p.muted) && speakingIndicators.isSpeaking(p.id);
      card.classList.toggle('speaking', speaking);
      const summary = card.querySelector('.participant-summary');
      if (summary) summary.textContent = personVoiceSummary(p);
    }
    for (const tile of document.querySelectorAll('.seat-camera-tile,.camera-tile')) {
      const p = privateVoiceRoster.get(tile.dataset.peer);
      if (!p) continue;
      const muted = p.id === me ? micMuted : !!p.muted,
        speaking = !muted && speakingIndicators.isSpeaking(p.id);
      tile.classList.toggle('speaking', speaking);
      renderVoiceStatus(
        tile.querySelector('.seat-camera-mic'),
        muted,
        p.id === me ? deafened : !!p.deafened,
      );
    }
  }

  function joinVoice() {
    if (voiceJoined) return leaveVoice().then(() => false);
    if (voiceJoinPromise) return voiceJoinPromise;
    const generation = ++voiceGeneration;
    const ensureCurrent = () => {
      if (generation !== voiceGeneration)
        throw Object.assign(new Error('Entrada na chamada cancelada.'), {
          code: 'VOICE_CANCELLED',
        });
    };
    unlockCallAudio();
    micMuted = false;
    deafened = false;
    mutedBeforeDeafen = false;
    watchingStreams.clear();
    hiddenCameras.clear();
    profileMedia.clear();
    const joining = (async () => {
      try {
        const choice = await window.TronoNetwork.prepareVoice();
        ensureCurrent();
        roomVoiceMode = choice.mode;
        setStatus('Solicitando acesso ao microfone…');
        await acquireMic({ generation });
        ensureCurrent();
        voiceJoined = true;
        updateVoiceBackgroundClass();
        void voiceTelemetry.syncPriority();
        voiceTelemetry.start();
        privateVoiceRoster.clear();
        voiceRosterInitialized = false;
        mediaTransport = communityVoice() && roomVoiceMode === 'sfu' ? 'sfu-pending' : 'p2p';
        window.TronoNetwork?.setVoiceState(
          true,
          false,
          cameraOn(),
          screenSharing(),
          transmissionQuality,
          announcedTransport(),
        );
        playCallSound('join', 'local');
        callNotice({ kind: 'joined', name: 'Você' });
        $('joinVoiceBtn').innerHTML = '<span class="call-icon">↩</span><span>Sair da voz</span>';
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
        ensureCurrent();
        if (communityVoice() && roomVoiceMode === 'sfu') {
          const sfuOk = await startSfuTransport({ callGeneration: generation });
          ensureCurrent();
          if (!sfuOk && voiceJoined) {
            window.TronoNetwork?.fallbackVoice?.();
            roomVoiceMode = 'p2p';
            mediaTransport = 'p2p';
            window.TronoNetwork?.setVoiceState(
              true,
              micMuted,
              cameraOn(),
              screenSharing(),
              transmissionQuality,
              'p2p',
            );
            syncPeers();
          }
        } else syncPeers();
        return voiceJoined;
      } catch (err) {
        if (generation !== voiceGeneration || err?.code === 'VOICE_CANCELLED') return false;
        await leaveVoice();
        setStatus(err.message || 'Não foi possível abrir o microfone.', 'error');
        return false;
      }
    })();
    const tracked = joining.finally(() => {
      if (voiceJoinPromise === tracked) {
        voiceJoinPromise = null;
        updateButtons();
      }
    });
    voiceJoinPromise = tracked;
    updateButtons();
    return tracked;
  }
  function leaveVoice(reason = 'leave') {
    stability.reset();
    if ($('screenOptionsDialog')?.open) $('screenOptionsDialog').close();
    window.TronoMosaic?.close();
    // Cancel pending permission/SFU work before releasing the current devices.
    const wasInVoice = voiceJoined;
    voiceGeneration++;
    microphone.stop();
    voiceJoinPromise = null;
    voiceJoined = false;
    speakingIndicators.reset();
    voiceTelemetry.reset();
    cameraTogglePending = null;
    cameraCapture.stop();
    updateVoiceBackgroundClass();
    void voiceTelemetry.syncPriority();
    window.TronoNetwork?.setVoiceState(false, false, false, false, transmissionQuality, 'p2p');
    closeAllPeers();
    remoteMedia.reset();
    if (
      transportIsSfu() ||
      transportPending() ||
      sfuSubscriptions.size ||
      sfuLocalPublications.size
    )
      void stopSfuTransport({ toP2p: true });
    watchingStreams.clear();
    hiddenCameras.clear();
    privateVoiceRoster.clear();
    mediaTransport = 'p2p';
    audioPlayback.reset();
    updateAudioRecoveryUI();
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;
    screenCapture.stop();
    localScreenPreviewPaused = false;
    localScreenCollapsed = false;
    if (wasInVoice) {
      playCallSound(reason === 'disconnect' ? 'disconnect' : 'leave', 'local');
      callNotice({
        kind: reason === 'disconnect' ? 'disconnected' : 'left',
        name: 'Você',
        text:
          reason === 'disconnect' ? 'Você foi desconectado da chamada.' : 'Você saiu da chamada.',
      });
    }
    voiceRosterInitialized = false;
    $('joinVoiceBtn').innerHTML = '<span class="call-icon">☎</span><span>Entrar na voz</span>';
    $('muteMicBtn').disabled = true;
    $('deafenVoiceBtn').disabled = true;
    $('cameraBtn').disabled = false;
    if ($('screenShareBtn')) $('screenShareBtn').disabled = true;
    micMuted = false;
    deafened = false;
    updateButtons();
    updateRealtimeUI();
    setStatus('Fora do chat de voz.');
    renderVoiceRoster();
    renderVideoGrid();
    renderScreenGrid();
    renderSeatMedia();
    return Promise.resolve();
  }
  function applyMicrophoneMute() {
    microphone.setMuted(micMuted);
  }
  function toggleMute() {
    if (!voiceJoined || deafened) return;
    micMuted = !micMuted;
    applyMicrophoneMute();
    window.TronoNetwork?.setVoiceState(
      true,
      micMuted,
      cameraOn(),
      screenSharing(),
      transmissionQuality,
      announcedTransport(),
    );
    updateButtons();
    renderVoiceRoster();
    updateMediaIndicators();
  }
  function toggleDeafen() {
    if (!voiceJoined) return;
    if (!deafened) {
      mutedBeforeDeafen = micMuted;
      deafened = true;
      micMuted = true;
    } else {
      deafened = false;
      micMuted = mutedBeforeDeafen;
    }
    applyMicrophoneMute();
    audioPlayback.setDeafened(deafened);
    if (!deafened) unlockCallAudio();
    window.TronoNetwork?.setVoiceState(
      true,
      micMuted,
      cameraOn(),
      screenSharing(),
      transmissionQuality,
      announcedTransport(),
    );
    updateButtons();
    renderVoiceRoster();
    updateMediaIndicators();
  }
  async function toggleCamera() {
    if (cameraOn()) {
      cameraCapture.stop();
      setStatus('Câmera desligada.', 'ok');
      return;
    }
    if (cameraTogglePending || cameraCapture.getSnapshot().loading) return;
    const intent = {};
    cameraTogglePending = intent;
    updateButtons();
    try {
      if (!voiceJoined) {
        const ok = await joinVoice();
        if (!ok) return;
      }
      if (cameraTogglePending !== intent) return;
      setStatus('Solicitando acesso à câmera...');
      await acquireCamera();
      if (cameraTogglePending !== intent) return;
      setStatus(
        transportIsSfu()
          ? 'Câmera publicada no Cloudflare SFU.'
          : 'Câmera ligada e distribuída à malha P2P.',
        'ok',
      );
      updateButtons();
    } catch (err) {
      if (err?.code !== 'CAMERA_CANCELLED') {
        setStatus(cameraErrorMessage(err), 'error');
        renderVideoGrid();
        renderSeatMedia();
      }
    } finally {
      if (cameraTogglePending === intent) cameraTogglePending = null;
      updateButtons();
    }
  }

  function noiseState() {
    const processor = microphone.getSnapshot().capture?.processor,
      settings =
        microphone.getSnapshot().capture?.rawStream.getAudioTracks()[0]?.getSettings?.() || {};
    const activeMode = processor?.mode === 'gain-only' ? null : processor?.mode;
    const mode = microphone.getSnapshot().loading
      ? 'loading'
      : !voiceJoined
        ? 'idle'
        : processor &&
            microphone.getSnapshot().capture?.outgoingTrack === processor.track &&
            processor.ctx.state !== 'running'
          ? 'paused'
          : activeMode || (settings.noiseSuppression ? 'native' : 'unavailable');
    return {
      requested: noiseSuppression,
      mode: noiseSuppression ? mode : 'off',
      nativeSuppression: settings.noiseSuppression === true,
      sampleRate: processor?.ctx.sampleRate || settings.sampleRate || null,
    };
  }
  function updateNoiseButton() {
    updateVoiceLightMode();
    const select = $('noiseModeSelect');
    if (select) {
      select.value = noiseSuppression ? noiseEngine : 'off';
      select.disabled = microphone.getSnapshot().loading;
    }
    const b = $('noiseSuppressionBtn');
    if (!b) return;
    const { mode } = noiseState();
    const labels = {
      off: ['Desligado', 'Supressão desligada. O controle de volume continua ativo.'],
      idle: [
        'Preparado',
        voiceLightMode
          ? 'Modo leve: a redução nativa será solicitada ao entrar na voz.'
          : 'O RNNoise será ativado no seu microfone ao entrar na voz.',
      ],
      loading: ['Iniciando…', 'Carregando o processamento do microfone…'],
      rnnoise: [
        'RNNoise',
        'RNNoise ativo no seu microfone. Processamento local, antes de enviar a voz.',
      ],
      native: ['Navegador', 'Redução nativa ativa no microfone.'],
      paused: ['Pausado', 'Processamento pausado. Use Liberar áudio para retomá-lo.'],
      unavailable: [
        'Indisponível',
        'Não foi possível ativar a supressão. O microfone continua transmitindo.',
      ],
    };
    if (mode === 'idle' && (voiceLightMode || noiseEngine === 'native'))
      labels.idle = ['Preparado', 'A redução nativa será solicitada ao entrar na voz.'];
    const [label, detail] = labels[mode];
    b.disabled = microphone.getSnapshot().loading;
    b.classList.toggle('noise-active', noiseSuppression);
    b.classList.toggle('danger-active', !noiseSuppression);
    b.textContent = 'Supressor: ' + label;
    b.title = detail;
    b.dataset.engine = mode;
    b.setAttribute('aria-pressed', String(noiseSuppression));
    if ($('noiseSuppressionStatus')) $('noiseSuppressionStatus').textContent = detail;
  }
  async function toggleNoiseSuppression() {
    if (microphone.getSnapshot().loading) return;
    const previous = noiseSuppression;
    noiseSuppression = !noiseSuppression;
    storage.setItem('tronoNoiseSuppression', noiseSuppression ? '1' : '0');
    updateNoiseButton();
    if (voiceJoined) {
      try {
        await acquireMic();
        await speakingIndicators.watch(meId(), localStream);
        setStatus(
          noiseState().mode === 'rnnoise'
            ? 'RNNoise ativo no microfone.'
            : noiseSuppression
              ? 'Processamento do microfone atualizado.'
              : 'Supressor desligado.',
          'ok',
        );
      } catch (err) {
        noiseSuppression = previous;
        storage.setItem('tronoNoiseSuppression', previous ? '1' : '0');
        updateNoiseButton();
        if (err?.code !== 'VOICE_CANCELLED')
          setStatus('Não foi possível atualizar o processamento do microfone.', 'error');
      }
    }
  }
  async function setNoiseMode(value) {
    if (
      !window.TronoDesktop ||
      microphone.getSnapshot().loading ||
      !['native', 'rnnoise', 'off'].includes(value)
    )
      return;
    const previous = { noiseEngine, noiseSuppression, voiceLightMode };
    noiseEngine = value;
    noiseSuppression = value !== 'off';
    if (value === 'rnnoise') voiceLightMode = false;
    const save = () => {
      storage.setItem('mnDesktopNoiseMode', noiseEngine);
      storage.setItem('tronoNoiseSuppression', noiseSuppression ? '1' : '0');
      storage.setItem('tronoVoiceLightMode', voiceLightMode ? '1' : '0');
      updateNoiseButton();
      voiceTelemetry.start();
    };
    save();
    try {
      if (voiceJoined) {
        await acquireMic();
        await speakingIndicators.watch(meId(), localStream);
      }
      setStatus(
        value === 'native'
          ? 'Redução nativa selecionada.'
          : value === 'rnnoise'
            ? 'RNNoise selecionado.'
            : 'Redução de ruído desligada.',
        'ok',
      );
    } catch (err) {
      ({ noiseEngine, noiseSuppression, voiceLightMode } = previous);
      save();
      if (err?.code !== 'VOICE_CANCELLED')
        setStatus(
          'Não foi possível mudar a redução de ruído. A opção anterior foi mantida.',
          'error',
        );
    }
  }
  function updateVoiceLightMode() {
    speakingIndicators.refresh();
    const button = $('voiceLightModeBtn');
    if (button) {
      button.disabled = microphone.getSnapshot().loading;
      button.textContent = 'Modo leve para jogar: ' + (voiceLightMode ? 'Ligado' : 'Desligado');
      button.setAttribute('aria-pressed', String(voiceLightMode));
      button.classList.toggle('noise-active', voiceLightMode);
    }
    document.body.classList.toggle('voice-light-mode', voiceLightMode);
  }
  async function toggleVoiceLightMode() {
    if (microphone.getSnapshot().loading) return;
    const previous = voiceLightMode,
      previousEngine = noiseEngine;
    voiceLightMode = !voiceLightMode;
    if (window.TronoDesktop && voiceLightMode && noiseSuppression) {
      noiseEngine = 'native';
      storage.setItem('mnDesktopNoiseMode', noiseEngine);
    }
    storage.setItem('tronoVoiceLightMode', voiceLightMode ? '1' : '0');
    updateNoiseButton();
    voiceTelemetry.start();
    if (!voiceJoined) return;
    try {
      await acquireMic();
      await speakingIndicators.watch(meId(), localStream);
      setStatus(
        voiceLightMode
          ? 'Modo leve ativo: redução nativa e menos trabalho visual.'
          : 'Modo leve desligado. Preferências de áudio restauradas.',
        'ok',
      );
    } catch (err) {
      voiceLightMode = previous;
      noiseEngine = previousEngine;
      if (window.TronoDesktop) storage.setItem('mnDesktopNoiseMode', noiseEngine);
      storage.setItem('tronoVoiceLightMode', previous ? '1' : '0');
      updateNoiseButton();
      voiceTelemetry.start();
      if (err?.code !== 'VOICE_CANCELLED')
        setStatus('Não foi possível mudar o processamento. O modo anterior foi mantido.', 'error');
    }
  }

  function updateButtons() {
    const m = $('muteMicBtn'),
      d = $('deafenVoiceBtn'),
      c = $('cameraBtn'),
      s = $('screenShareBtn');
    if (m)
      m.innerHTML = `<span class="call-icon">${micMuted ? '🔇' : '🎙'}</span><span>${micMuted ? 'Ativar microfone' : 'Mutar microfone'}</span>`;
    if (d)
      d.innerHTML = `<span class="call-icon">${deafened ? '🔈' : '🔊'}</span><span>${deafened ? 'Ouvir voz' : 'Silenciar voz'}</span>`;
    if (c)
      c.innerHTML = `<span class="call-icon">${cameraOn() ? '▧' : '▣'}</span><span>${cameraOn() ? 'Desligar câmera' : 'Ligar câmera'}</span>`;
    if (s) {
      s.innerHTML = `<span class="call-icon">${screenSharing() ? '■' : '▤'}</span><span>${screenSharing() ? (window.TronoDesktop ? 'Parar tela' : 'Parar compartilhamento') : 'Compartilhar tela'}</span>`;
      s.title = screenSharing() ? 'Parar compartilhamento' : 'Compartilhar tela';
      s.setAttribute('aria-label', s.title);
      s.disabled = !voiceJoined || !communityVoice();
    }
    $('joinVoiceBtn')?.classList.toggle('call-active', voiceJoined);
    if (m) {
      m.disabled = !voiceJoined || deafened;
      m.title = deafened ? 'Ative o áudio da chamada para liberar o microfone.' : '';
    }
    m?.classList.toggle('danger-active', micMuted);
    d?.classList.toggle('danger-active', deafened);
    c?.classList.toggle('camera-active', cameraOn());
    s?.classList.toggle('screen-active', screenSharing());
    updateNoiseButton();
    document.body.classList.toggle('call-connected', voiceJoined);
    const eligible = !!roomState && roomState.channelType !== 'text',
      joining = !!voiceJoinPromise && !voiceJoined,
      textOnly = inChatHub() && chatRoomState?.channelType === 'text' && !voiceJoined && !eligible,
      j = $('joinVoiceBtn');
    if (j) {
      j.disabled = !eligible || joining;
      const label = joining ? 'Conectando…' : voiceJoined ? 'Sair da voz' : 'Entrar na voz';
      if (j.lastElementChild?.textContent !== label)
        j.innerHTML = '<span class="call-icon">☎</span><span>' + label + '</span>';
      j.classList.toggle('call-joining', joining);
    }
    if (d) d.disabled = !voiceJoined;
    if (c)
      c.disabled =
        textOnly ||
        joining ||
        (!cameraOn() && (cameraTogglePending || !!cameraCapture.getSnapshot().loading)) ||
        (document.body.dataset.appLayout === 'discord' && !voiceJoined);
    for (const [button, on] of [
      [m, micMuted],
      [d, deafened],
      [c, cameraOn()],
      [s, screenSharing()],
    ])
      button?.setAttribute('aria-pressed', String(on));
    if ($('cameraInputSelect'))
      $('cameraInputSelect').disabled =
        cameraTogglePending || !!cameraCapture.getSnapshot().loading;
    window.dispatchEvent(
      new CustomEvent('trono-call-change', {
        detail: { joined: voiceJoined, joining, deafened, roomId: roomState?.id },
      }),
    );
  }
  async function changeInput(e) {
    selectedInput = e.target.value || '';
    storage.setItem('tronoVoiceInput', selectedInput);
    if (voiceJoined) {
      try {
        await acquireMic();
        await speakingIndicators.watch(meId(), localStream);
        setStatus('Microfone alterado.', 'ok');
      } catch (err) {
        setStatus('Não foi possível trocar o microfone.', 'error');
      }
    }
  }
  async function changeOutput(e) {
    const request = audioPlayback.setOutput(e.target.value || '');
    storage.setItem('tronoVoiceOutput', audioPlayback.getSnapshot().output);
    if (await request) {
      setStatus(
        audioPlayback.getSnapshot().output ? 'Saída de áudio alterada.' : 'Usando saída padrão.',
        'ok',
      );
    }
    renderTelemetry();
  }
  async function changeCamera(e) {
    if (cameraCapture.getSnapshot().loading) return;
    selectedCamera = e.target.value || '';
    storage.setItem('tronoCameraInput', selectedCamera);
    if (cameraOn()) {
      try {
        await acquireCamera();
        setStatus('Câmera alterada.', 'ok');
      } catch (err) {
        if (err?.code !== 'CAMERA_CANCELLED') setStatus(cameraErrorMessage(err), 'error');
      }
    }
  }

  function consumeVoiceRoster(list = []) {
    if (!voiceJoined) return;
    const before = new Set(privateVoiceRoster.keys()),
      next = new Map();
    for (const p of list)
      if (p?.id)
        next.set(p.id, {
          id: p.id,
          accountId: p.accountId || null,
          name: p.name,
          avatar_preset: p.avatar_preset || 'crown',
          avatar_file_id: p.avatar_file_id || null,
          seat: p.seat,
          joined: true,
          muted: !!p.muted,
          deafened: !!p.deafened,
          camera: !!p.camera,
          screen: !!p.screen,
          transport: p.transport || 'p2p',
          quality: p.quality || 'balanced',
        });
    if (voiceRosterInitialized && !voiceEventsSupported) {
      for (const id of next.keys()) if (id !== meId() && !before.has(id)) playCallSound('join', id);
      for (const id of before) if (id !== meId() && !next.has(id)) playCallSound('leave', id);
    } else voiceRosterInitialized = true;
    for (const [id, p] of next) {
      if (
        p.accountId &&
        (privateVoiceRoster.get(id)?.accountId !== p.accountId || !audioPlayback.hasGain(id))
      )
        audioPlayback.setGain(
          id,
          clampGain(window.TronoPersonal?.get('volume:' + p.accountId, 100) ?? 100),
        );
    }
    privateVoiceRoster.clear();
    for (const [id, p] of next) privateVoiceRoster.set(id, p);
    syncPeers();
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
    if (room || voiceJoined) showForRoom(true);
    if (inChatHub() && room?.channelType === 'text') toggleTextChat(true);
    updateChatDrawerUI();
    updateButtons();
  }
  function consumeRoom(room) {
    if (room?.id !== roomState?.id) roomVoiceMode = null;
    roomState = room || null;
    if (roomState) showForRoom(true);
    else if (!voiceJoined) {
      privateVoiceRoster.clear();
      closeAllPeers();
      if (transportIsSfu() || transportPending()) void stopSfuTransport({ toP2p: true });
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
    if (!voiceJoined) return { label: 'Fora da chamada', expected, count: 0 };
    if (deafened)
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
    if (voiceJoined && announcedTransport() === 'sfu-pending')
      return {
        level: 'neutral',
        label: 'Conectando áudio',
        detail: 'negociando',
        recommendation:
          'Aguardando a conexão de voz. O microfone já foi aberto, mas a rota de mídia ainda está sendo negociada.',
      };
    if (
      voiceJoined &&
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
      voiceJoined &&
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
    if (!voiceJoined || !allTelemetryPeerConnections().length)
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
    if (lastSfuError && mediaTransport === 'sfu')
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
    const {
      telemetry: telemetrySnapshot,
      resources: nativeResources,
      lagMs: eventLoopLagMs,
      enabled: voiceProtection,
    } = voiceTelemetry.getSnapshot();
    const t = telemetrySnapshot || {
      transport: mediaTransport,
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
      modeState = voiceJoined ? announcedTransport() : mediaTransport;
    const set = (id, v) => {
      const el = $(id);
      if (el && el.textContent !== v) el.textContent = v;
    };
    set('telemetryHealthLabel', health.label.replace('Conexão ', ''));
    set('telemetryHealthDetail', health.detail);
    set(
      'voiceProtectionStatus',
      voiceProtection
        ? 'Ativa · margem de voz de 60 a 140 ms quando suportada.'
        : 'WebRTC gerencia a reprodução sem margem solicitada pelo app.',
    );
    set(
      'adaptiveQualityStatus',
      stability.level
        ? `Vídeo reduzido temporariamente: ${stability.reason}. Retorno gradual após 60 segundos estáveis.`
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
      stability.level
        ? `Vídeo reduzido temporariamente: ${stability.reason}. Retorno gradual após 60 segundos estáveis.`
        : 'Qualidade escolhida preservada; reduções temporárias quando necessário.',
    );
    set('telemetryPlayback', playback.label);
    set('telemetryVoiceReceivers', `${playback.count} de ${playback.expected}`);
    set('telemetryAudioContext', mediaAudioContext?.state || 'Áudio direto');
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
    set('telemetryTurn', sfuTurnActive ? 'TURN disponível' : 'STUN direto');
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
    return window.TronoCallStability.diagnosticReport({
      version: window.TronoDesktop?.version || window.TronoNetwork.CLIENT_VERSION,
      platform: window.TronoDesktop ? 'Windows' : 'Navegador',
      call: {
        joined: voiceJoined,
        muted: micMuted,
        deafened,
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
      adaptation: stability.level ? stability.reason : 'qualidade escolhida',
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
    $('voiceProtection').checked = voiceTelemetry.getSnapshot().enabled;
    $('voiceProtection').onchange = (e) => {
      const enabled = e.target.checked;
      storage.setItem('mnVoiceProtection', enabled ? '1' : '0');
      voiceTelemetry.configureProtection(enabled);
      renderTelemetry();
    };
    $('adaptiveQuality').checked = adaptiveEnabled;
    $('adaptiveQuality').onchange = async (e) => {
      adaptiveEnabled = e.target.checked;
      storage.setItem('mnAdaptiveQuality', adaptiveEnabled ? '1' : '0');
      stability.reset();
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
    $('muteMicBtn')?.addEventListener('click', toggleMute);
    $('deafenVoiceBtn')?.addEventListener('click', toggleDeafen);
    $('cameraBtn')?.addEventListener('click', toggleCamera);
    $('screenShareBtn')?.addEventListener('click', toggleScreenShare);
    $('voiceSettingsBtn')?.addEventListener('click', () => toggleVoiceSettings());
    $('voiceSettingsClose')?.addEventListener('click', () => toggleVoiceSettings(false));
    $('noiseSuppressionBtn')?.addEventListener('click', toggleNoiseSuppression);
    $('voiceSfxBtn')?.addEventListener('click', toggleVoiceSfx);
    $('voiceMusicBtn')?.addEventListener('click', toggleVoiceMusic);
    $('refreshDevicesBtn')?.addEventListener('click', enumerateDevices);
    $('telemetryStatusPill')?.addEventListener('click', () => toggleTelemetry());
    $('telemetryOpenBtn')?.addEventListener('click', () => toggleTelemetry());
    $('telemetryCloseBtn')?.addEventListener('click', () => toggleTelemetry(false));
    document
      .querySelectorAll('[data-settings-tab]')
      .forEach((btn) =>
        btn.addEventListener('click', () => setSettingsTab(btn.dataset.settingsTab)),
      );
    $('micGainSlider')?.addEventListener('input', (e) => setMicrophoneGain(e.target.value));
    $('outputGainSlider')?.addEventListener('input', (e) => setOutputGain(e.target.value));
    $('resumeAudioBtn')?.addEventListener('click', () => {
      unlockCallAudio();
      if (voiceJoined && !microphone.getSnapshot().capture?.processor)
        void acquireMic()
          .then(() => speakingIndicators.watch(meId(), localStream))
          .catch((err) => setStatus(err.message, 'warn'));
    });
    $('voiceMusicTrackSelect')?.addEventListener('change', (e) =>
      window.TronoAudio?.setMusicTrack(e.target.value),
    );
    $('voiceMusicVolume')?.addEventListener('input', (e) => {
      window.TronoAudio?.setMusicVolume(e.target.value);
      updateVoiceMusicUI();
    });
    $('screenFormatSelect')?.addEventListener('change', async (e) => {
      if (!SCREEN_FORMATS[e.target.value]) return;
      screenFormat = e.target.value;
      storage.setItem('mnScreenFormat', screenFormat);
      updateQualityUI();
      await applyQualityToLiveMedia();
    });
    $('screenOptionsForm').addEventListener('submit', confirmScreenOptions);
    $('screenOptionsCancel').onclick = () => $('screenOptionsDialog').close();
    $('shareStreamAudio')?.addEventListener('change', (e) => {
      shareStreamAudio = !!e.target.checked;
      storage.setItem('mnShareStreamAudio', shareStreamAudio ? '1' : '0');
      setStatus('Preferência de áudio aplicada ao próximo compartilhamento.', 'ok');
    });
    window.addEventListener('resize', repositionProfileControls);
    $('voiceRoster')?.addEventListener('scroll', repositionProfileControls, { passive: true });
    $('voiceRoster')?.addEventListener('input', (e) => {
      if (e.target.matches('[data-peer-volume]'))
        setPeerGain(e.target.dataset.peerVolume, e.target.value);
    });
    $('screenBitrateSelect')?.addEventListener('change', async (e) => {
      const value = Number(e.target.value);
      if (!SCREEN_BITRATES.includes(value)) return;
      screenBitrateMbps = value;
      storage.setItem('mnScreenBitrate', String(value));
      updateQualityUI();
      await applyQualityToLiveMedia();
      if (transportIsSfu())
        await window.TronoNetwork.requestSfu('set-screen-bitrate', {
          screenBitrate: effectiveScreenBitrate(),
        }).catch((err) => setStatus(err.message, 'warn'));
      setStatus(`Tela configurada para até ${value} Mbps.`, 'ok');
    });
    $('screenContentSelect')?.addEventListener('change', async (e) => {
      screenContent = e.target.value === 'motion' ? 'motion' : 'detail';
      storage.setItem('mnScreenContent', screenContent);
      await applyQualityToLiveMedia();
    });
    $('voiceInputSelect')?.addEventListener('change', changeInput);
    $('voiceOutputSelect')?.addEventListener('change', changeOutput);
    $('cameraInputSelect')?.addEventListener('change', changeCamera);
    $('transmissionQualitySelect')?.addEventListener('change', changeTransmissionQuality);
    $('noiseModeSelect')?.addEventListener('change', (e) => void setNoiseMode(e.target.value));
    $('voiceLightModeBtn')?.addEventListener('click', toggleVoiceLightMode);
    if ($('callAlertVolume')) $('callAlertVolume').value = callAlertVolume;
    if ($('callAlertVolumeValue')) $('callAlertVolumeValue').textContent = `${callAlertVolume}%`;
    $('callAlertVolume')?.addEventListener('input', (e) => {
      callAlertVolume = Math.max(0, Math.min(100, Number(e.target.value) || 0));
      storage.setItem('mnCallAlertVolume', String(callAlertVolume));
      $('callAlertVolumeValue').textContent = `${callAlertVolume}%`;
      primeCallSounds();
    });
    $('testCallAlert')?.addEventListener('click', () => {
      primeCallSounds();
      playCallSound('join', 'test');
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
      if (msg.type === 'welcome') {
        voiceEventsSupported = !!msg.features?.voiceEvents;
        void syncRealtimeStatus({ quiet: true });
      }
      if (msg.type === 'connection' && msg.connected) void syncRealtimeStatus({ quiet: true });
      if (msg.type === 'joined-game-room') {
        gameRoomState = msg.room;
        if (msg.primaryRoomId === msg.room.id) consumeRoom(msg.room);
        renderSeatMedia();
      }
      if (msg.type === 'left-game-room') {
        gameRoomState = null;
        if (roomState?.id === msg.roomId) {
          void leaveVoice();
          consumeRoom(null);
        }
      }
      if (msg.type === 'left-voice-room') {
        if (roomState?.id === msg.roomId) {
          void leaveVoice();
          consumeRoom(null);
        }
      }
      if (msg.type === 'voice-room-attached') consumeRoom(msg.room);
      if (msg.type === 'joined-room') {
        if (msg.room?.kind === 'game') gameRoomState = msg.room;
        consumeRoom(msg.room);
        void syncRealtimeStatus({ quiet: true });
      }
      if (msg.type === 'joined-text-channel') consumeChatRoom(msg.room);
      if (msg.type === 'room-state') {
        if (msg.room?.id === window.TronoNetwork.gameRoom) gameRoomState = msg.room;
        if (msg.room?.id === window.TronoNetwork.primaryRoom) consumeRoom(msg.room);
        else if (msg.room?.id === window.TronoNetwork.currentRoom) consumeChatRoom(msg.room);
      }
      if (msg.type === 'channel-deleted' && msg.roomId === roomState?.id) {
        void leaveVoice();
        roomState = null;
        updateButtons();
      }
      if (msg.type === 'voice-mode' && msg.roomId === roomState?.id) {
        roomVoiceMode = msg.mode;
        if (voiceJoined && msg.mode === 'p2p' && (transportIsSfu() || transportPending()))
          void fallbackToP2p(msg.reason || 'Chamada sincronizada em P2P.');
      }
      if (msg.type === 'voice-roster' && msg.roomId === roomState?.id)
        consumeVoiceRoster(msg.players || []);
      if (msg.type === 'voice-event' && msg.roomId === roomState?.id && msg.playerId !== meId()) {
        callNotice(msg);
        playCallSound(
          msg.kind === 'joined' ? 'join' : msg.kind === 'disconnected' ? 'disconnect' : 'leave',
          msg.playerId,
        );
      }
      if (msg.type === 'realtime-status') void applyRealtimeStatus(msg);
      if (msg.type === 'sfu-publications' && msg.roomId === roomState?.id) {
        sfuSession.setPublications(msg.publications);
        if (transportIsSfu()) void syncSfuSubscriptions();
      }
      if (msg.type === 'voice-state' && voiceJoined) {
        const was = privateVoiceRoster.has(msg.playerId),
          old = privateVoiceRoster.get(msg.playerId) || {
            id: msg.playerId,
            name: msg.name,
            seat: msg.seat,
          };
        if (msg.joined)
          privateVoiceRoster.set(msg.playerId, {
            ...old,
            joined: true,
            muted: !!msg.muted,
            deafened: !!msg.deafened,
            camera: !!msg.camera,
            screen: !!msg.screen,
            transport: msg.transport || old.transport || 'p2p',
            quality: msg.quality || old.quality || 'balanced',
          });
        else privateVoiceRoster.delete(msg.playerId);
        if (
          !voiceEventsSupported &&
          voiceRosterInitialized &&
          msg.playerId !== meId() &&
          was !== !!msg.joined
        )
          playCallSound(msg.joined ? 'join' : 'leave', msg.playerId);
        syncPeers();
      }
      if (msg.type === 'voice-signal' && !transportIsSfu() && !transportPending())
        void p2pPeers.handleSignal(msg);
      if (msg.type === 'player-left' && msg.roomId === roomState?.id) {
        const wasInCall = privateVoiceRoster.has(msg.playerId);
        privateVoiceRoster.delete(msg.playerId);
        if (
          !voiceEventsSupported &&
          voiceJoined &&
          voiceRosterInitialized &&
          wasInCall &&
          msg.playerId !== meId()
        )
          playCallSound('leave', msg.playerId);
        closePeer(msg.playerId);
        if (transportIsSfu()) {
          for (const kind of ['audio', 'camera', 'screen', 'screen-audio']) {
            const key = sfuKey(msg.playerId, kind);
            if (sfuSubscriptions.has(key)) void closeSfuSubscription(key);
          }
          sfuSession.setPublications(
            sfuSession.getPublications().filter((p) => p.ownerId !== msg.playerId),
          );
          void syncSfuSubscriptions();
        }
        renderVoiceRoster();
        renderVideoGrid();
        renderScreenGrid();
        renderSeatMedia();
      }
      if (msg.type === 'connection' && !msg.connected) {
        profileActivities.clear();
        renderProfileActivities();
        realtimeSyncError = 'Servidor desconectado';
        realtimeStatus = null;
        void leaveVoice('disconnect');
        setStatus(
          'Servidor desconectado. Recarregue a página para entrar na voz novamente.',
          'error',
        );
      }
      if (msg.type === 'game-started' || msg.type === 'game-state') setTimeout(renderSeatMedia, 0);
    });
    navigator.mediaDevices?.addEventListener?.('devicechange', enumerateDevices);
    window.addEventListener('resize', () => {
      restoreFloatingRect();
      renderSeatMedia();
    });
    window.addEventListener('trono-audio-state', updateAudioPreferenceButtons);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const maximized = document.querySelector('.media-maximized');
        if (maximized) {
          maximized.classList.remove('media-maximized');
          document.body.classList.remove('media-focus-open');
          void setSfuTileLayer(maximized, false);
        } else if (telemetryOpen) toggleTelemetry(false);
        else if (inChatHub() && chatDrawerOpen) toggleTextChat(false);
        else if (settingsOpen) toggleVoiceSettings(false);
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
    renderGainValues();
    updateChatDrawerUI();
    setSettingsTab(settingsTab);
    updateAudioPreferenceButtons();
    enumerateDevices();
    updateQualityUI();
    updateButtons();
    updatePublicPresence();
    renderVoiceRoster();
    renderVideoGrid();
    renderScreenGrid();
    renderSeatMedia();
    startRealtimeStatusSync();
    voiceTelemetry.start();
    document.addEventListener('pointerdown', () => {
      primeCallSounds();
      if (voiceJoined) unlockCallAudio();
    });
    document.addEventListener('keydown', () => {
      if (voiceJoined) unlockCallAudio();
    });
    for (const event of ['focus', 'blur'])
      window.addEventListener(event, () => {
        updateVoiceBackgroundClass();
        renderTelemetry();
      });
    document.addEventListener('visibilitychange', () => {
      updateVoiceBackgroundClass();
      if (document.visibilityState === 'visible' && voiceJoined) {
        audioPlayback.refresh();
        updateAudioRecoveryUI();
      }
    });
    window.addEventListener('trono-music-track', updateVoiceMusicUI);
    updateVoiceMusicUI();
    let previousWide = innerWidth > 1000;
    window.addEventListener('resize', () => {
      const wide = innerWidth > 1000;
      if (inChatHub() && previousWide && !wide && chatRoomState?.channelType !== 'text')
        toggleTextChat(false);
      previousWide = wide;
    });
  }
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
      return voiceJoined;
    },
    get voiceJoining() {
      return !!voiceJoinPromise;
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
      return voiceLightMode;
    },
    get noiseSuppression() {
      return noiseSuppression;
    },
    get noiseMode() {
      return noiseSuppression ? noiseEngine : 'off';
    },
    get noiseState() {
      return noiseState();
    },
    get transmissionQuality() {
      return transmissionQuality;
    },
    get panelMode() {
      return panelMode;
    },
    get mediaTransport() {
      return mediaTransport;
    },
    get realtimeStatus() {
      return realtimeStatus ? { ...realtimeStatus } : null;
    },
    get telemetry() {
      return voiceTelemetry.getSnapshot().telemetry;
    },
    get voiceReception() {
      const { enabled, rows, priority } = voiceTelemetry.getSnapshot();
      return {
        enabled,
        rows: rows.map((r) => ({ ...r })),
        background: voiceJoined && !foreground(),
        meterMode: speakingIndicators.getSnapshot().mode,
        metersRunning: speakingIndicators.getSnapshot().running,
        playbackContext: audioPlayback.getSnapshot().context,
        microphoneContext: mediaAudioContext?.state || null,
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
        ...SCREEN_FORMATS[screenFormat],
        bitrate: effectiveScreenBitrate(),
        audio: shareStreamAudio,
      };
    },
    get deafened() {
      return deafened;
    },
    toggleWatchStream,
    toggleWatchCamera,
    fullscreenMedia,
    getMediaSources() {
      return voiceJoined
        ? detailedPlayers()
            .filter(
              (p) => p.camera || p.screen || (p.id === meId() && (cameraOn() || screenSharing())),
            )
            .map((p) => ({
              id: p.id,
              name: p.name,
              self: p.id === meId(),
              camera: (p.id === meId() ? cameraOn() : p.camera && !hiddenCameras.has(p.id))
                ? cameraStreamForPerson(p)
                : null,
              cameraOffered: p.id === meId() ? cameraOn() : !!p.camera,
              cameraHidden: hiddenCameras.has(p.id),
              screen: (p.id === meId() ? screenSharing() : watchingStreams.has(p.id))
                ? screenStreamForPerson(p)
                : null,
              screenOffered: p.screen,
              watching: p.id === meId() || watchingStreams.has(p.id),
            }))
        : [];
    },
  };
})();
