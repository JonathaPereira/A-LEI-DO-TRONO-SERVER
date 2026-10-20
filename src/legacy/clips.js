'use strict';
if (!window.TronoDesktop) {
  window.TronoClips = (() => {
    const $ = (id) => document.getElementById(id),
      library = window.TronoClipLibrary,
      preferences = window.TronoClipPreferences,
      controls = window.TronoClipControls;
    let owner = 'local',
      settings,
      session = null,
      sharedSource = null,
      localSource = null,
      localChoosing = false,
      starting = false,
      generation = 0,
      localPrimary = false,
      autoPaused = false,
      automaticPreparing = false,
      lastCallJoined = false,
      lastCaptureError = null,
      localCaptureGeneration = 0;
    let lastLibraryMessage = 0,
      lastPreferenceMessage = 0;
    const account = () => window.TronoAuth?.user?.id || 'local';
    function message(text) {
      $('clipsStatus').textContent = text;
    }
    function readSettings() {
      preferences.setOwner(owner);
      settings = preferences.getSnapshot().settings;
    }
    function renderState() {
      const { pendingCount: count } = library.getSnapshot();
      const active = !!session && !session.stopping,
        ready = !!(active && session.status?.ready);
      $('clipChooseSource').hidden = !window.TronoDesktop;
      $('clipChooseSource').disabled = localChoosing;
      const available = Math.min(
        settings.seconds,
        Math.max(1, Math.floor(session?.status?.seconds || 0)),
      );
      $('clipNow').disabled = !ready;
      $('clipNow').textContent = 'Clipar últimos ' + (ready ? available : settings.seconds) + ' s';
      $('clipToolbarNow').disabled =
        !ready && (!window.TronoDesktop || starting || localChoosing || active);
      $('clipToolbarLabel').textContent =
        starting || localChoosing
          ? 'Preparando…'
          : active
            ? 'Clipar ' + available + ' s'
            : window.TronoDesktop
              ? 'Ativar replay'
              : 'Clipar';
      $('clipToolbarNow').title = ready
        ? 'Guardar o replay · ' + preferences.shortcutLabel()
        : window.TronoDesktop
          ? 'Ativar replay local sem transmitir para a chamada'
          : 'Compartilhe sua tela para preparar o replay';
      $('clipToolbarNow').classList.toggle('replay-ready', ready);
      $('clipSource').textContent = ready
        ? (localPrimary ? 'Tela principal · ' : 'Replay pronto · ') +
          Math.floor(session.status?.seconds || 0) +
          ' s disponíveis · ' +
          (session.hasAudio ? 'áudio incluído' : 'sem áudio')
        : active || starting
          ? localSource
            ? 'Preparando replay local…'
            : 'Preparando replay da tela compartilhada…'
          : sharedSource
            ? 'Replay pausado'
            : window.TronoDesktop
              ? 'Preparar replay local'
              : 'Compartilhe sua tela para habilitar o replay';
      $('clipReplayDot').classList.toggle('is-ready', ready);
      $('clipShare').hidden = !!sharedSource;
      $('clipShare').textContent = window.TronoDesktop
        ? 'Ativar replay local'
        : 'Compartilhar tela';
      $('clipShare').disabled = localChoosing;
      $('clipStopLocal').hidden = !localSource;
      $('clipResume').hidden =
        !sharedSource || active || starting || (!settings.auto && !localSource);
      $('clipFloating').hidden = !window.documentPictureInPicture;
      $('clipPendingCount').textContent = count;
      $('clipToolbarCount').textContent = count;
      $('clipToolbarCount').hidden = !count;
      window.TronoClipDesktop?.configure({ shortcut: settings.shortcut, active: ready });
      window.dispatchEvent(
        new CustomEvent('trono-replay-change', {
          detail: {
            active,
            ready,
            primary: localPrimary,
            preparing: starting || localChoosing,
            paused: autoPaused,
          },
        }),
      );
      controls.update({
        ready,
        source: $('clipSource').textContent,
        seconds: settings.seconds,
        count,
      });
    }
    const refresh = () => library.refresh();
    async function retain(s, result) {
      const id = result.id,
        createdAt = Date.now(),
        stamp = new Date(createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const clip = {
        id,
        owner: s.owner,
        name: 'Clipe ' + new Date(createdAt).toLocaleString('pt-BR'),
        filename: 'Trono_Clipe_' + stamp + '_' + id.slice(0, 8) + '.webm',
        createdAt,
        quality: s.quality,
        fps: s.fps,
        duration: result.duration,
        bytes: result.bytes,
        blob: result.blob,
        state: 'pending',
      };
      if (window.TronoDesktop && window.ImageCapture) {
        try {
          const frame = await new ImageCapture(s.stream.getVideoTracks()[0]).grabFrame();
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            canvas.getContext('2d').drawImage(frame, 0, 0, 320, 180);
            clip.poster = canvas.toDataURL('image/jpeg', 0.7);
          } finally {
            frame.close();
          }
        } catch {
          /* A thumbnail failure must never discard a replay. */
        }
      }
      await library.retain(clip, () => {
        if (session === s) stop(s);
      });
      if (s.owner === owner) window.TronoClipDesktop?.saved(library.getSnapshot().pendingCount);
    }
    function stop(s = session) {
      const current = s === session;
      if (current || !s) {
        generation++;
        starting = false;
      }
      if (!s) {
        renderState();
        return;
      }
      if (session === s) session = null;
      s.stop();
      if (current) {
        renderState();
        message('Buffer temporário descartado. Os clipes já criados continuam na biblioteca.');
      }
    }
    const captureProfile = () => preferences.captureProfile();
    async function sharedStarted(source, { local = false, force = false } = {}) {
      if (!local && localSource && localPrimary) return; // Private primary-screen replay stays independent of the shared source.
      if (localSource && source !== localSource) {
        const previous = localSource;
        localSource = null;
        previous.getTracks().forEach((track) => track.stop());
      }
      stop();
      sharedSource = source;
      renderState();
      if (!settings.auto && !local && !force) return;
      if (library.hasUnsavedMemory(owner)) {
        message(
          'Salve ou descarte os clipes guardados somente nesta sessão antes de retomar o replay.',
        );
        return;
      }
      if (!window.MediaRecorder || !window.Worker) {
        message('Replay indisponível neste navegador. O compartilhamento continua.');
        return;
      }
      const request = ++generation,
        current = owner;
      starting = true;
      renderState();
      try {
        let s;
        s = await window.TronoCreateReplaySession({
          source,
          owner: current,
          quality: preferences.getQuality(),
          fps: settings.fps,
          seconds: settings.seconds,
          isCurrent: () => request === generation && current === owner && sharedSource === source,
          onStatus: () => {
            if (session === s) renderState();
          },
          onClip: retain,
          onError: (text) => {
            if (session === s && s.stopping) stop(s);
            message(text);
          },
          onEnded: () => stop(s),
        });
        if (!s) return;
        if (request !== generation || current !== owner || sharedSource !== source) {
          s.stop();
          return;
        }
        session = s;
        s.start();
        starting = false;
        renderState();
        message(
          s.hasAudio
            ? 'Replay automático ativo com o áudio da tela.'
            : window.TronoDesktop
              ? 'Replay ativo sem áudio: ative o áudio do computador no seletor ao iniciar a próxima transmissão. Ele pode incluir as vozes da chamada.'
              : 'Replay ativo sem áudio: o navegador não forneceu áudio da tela. Habilite-o no seletor de compartilhamento, quando disponível.',
        );
      } catch (e) {
        if (request !== generation || current !== owner) return;
        session = null;
        starting = false;
        renderState();
        message(e.message || 'Não foi possível preparar o replay. O compartilhamento continua.');
      }
    }
    async function startLocalReplay({ automatic = false, choose = false, audio = true } = {}) {
      if (!window.TronoDesktop || localChoosing) return;
      if (sharedSource && !choose) {
        await sharedStarted(sharedSource, { local: sharedSource === localSource, force: true });
        return;
      }
      const requestedOwner = owner,
        captureGeneration = ++localCaptureGeneration;
      lastCaptureError = null;
      localChoosing = true;
      renderState();
      try {
        const q = preferences.getQuality();
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: q.width },
            height: { ideal: q.height },
            frameRate: { ideal: settings.fps },
          },
          audio: audio
            ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            : false,
        });
        if (
          requestedOwner !== owner ||
          captureGeneration !== localCaptureGeneration ||
          (automatic && (!settings.desktopAuto || autoPaused))
        ) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const previous = localSource;
        localSource = stream;
        localPrimary = automatic;
        autoPaused = false;
        previous?.getTracks().forEach((track) => track.stop());
        stream.getVideoTracks()[0].addEventListener(
          'ended',
          () => {
            if (localSource === stream) stopLocalReplay();
          },
          { once: true },
        );
        await sharedStarted(stream, { local: true });
        if (!session) {
          const reason = $('clipsStatus').textContent;
          stopLocalReplay();
          message(reason);
        }
      } catch (error) {
        lastCaptureError = error.name;
        message(
          ['AbortError', 'NotAllowedError'].includes(error.name)
            ? 'Captura local cancelada.'
            : error.message || 'Não foi possível iniciar o replay local.',
        );
      } finally {
        localChoosing = false;
        renderState();
        if (requestedOwner !== owner) void ensureAutomaticReplay();
      }
    }
    async function ensureAutomaticReplay() {
      if (
        !window.TronoDesktop ||
        !settings.desktopAuto ||
        autoPaused ||
        localChoosing ||
        automaticPreparing ||
        sharedSource ||
        session
      )
        return;
      automaticPreparing = true;
      const currentOwner = owner;
      try {
        await window.TronoDesktop.prepareReplay();
      } catch {
        message(
          'Não foi possível preparar a tela principal. Use Ativar replay para tentar novamente.',
        );
      } finally {
        automaticPreparing = false;
        if (currentOwner !== owner) void ensureAutomaticReplay();
      }
    }
    async function startPrimaryReplay({ audio = true } = {}) {
      await startLocalReplay({ automatic: true, audio });
      return { active: !!session, error: lastCaptureError };
    }
    function stopLocalReplay() {
      localCaptureGeneration++;
      autoPaused = true;
      const source = localSource;
      if (!source) return;
      localSource = null;
      localPrimary = false;
      sharedStopped(source);
      source.getTracks().forEach((track) => track.stop());
      renderState();
    }
    function sharedStopped(source) {
      if (localSource && sharedSource === localSource && source !== localSource) return;
      if (source && sharedSource !== source) return;
      sharedSource = null;
      stop();
      if (window.TronoDesktop && !autoPaused) void ensureAutomaticReplay();
    }
    function clip() {
      const s = session;
      if (!s || !s.status?.ready) {
        message(
          window.TronoDesktop
            ? 'Ative o replay e aguarde ficar pronto para clipar.'
            : 'Compartilhe sua tela e aguarde o replay ficar pronto para clipar.',
        );
        return;
      }
      if (s.pendingCount >= 4) {
        message('Aguarde os clipes em preparação antes de clipar novamente.');
        return;
      }
      const id = crypto.randomUUID();
      message('Preparando clipe…');
      try {
        s.requestClip(id);
      } catch {
        message('A captura não está disponível. Os clipes anteriores continuam armazenados.');
      }
    }
    function tab(name) {
      document.querySelectorAll('[data-clips-tab]').forEach((b) => {
        const on = b.dataset.clipsTab === name;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on);
      });
      $('clipsLibrary').hidden = name !== 'library';
      $('clipsPreferences').hidden = name !== 'preferences';
    }
    function open({ inline = false } = {}) {
      tab('library');
      if (!$('clipsDialog').open) {
        if (inline) $('clipsDialog').show();
        else $('clipsDialog').showModal();
      }
      void refresh();
    }
    async function accountChanged() {
      const next = account();
      if (next === owner && settings) return;
      stopLocalReplay();
      sharedSource = null;
      stop();
      owner = next;
      autoPaused = false;
      readSettings();
      await library.setOwner(owner);
      void ensureAutomaticReplay();
    }
    function bind() {
      owner = account();
      readSettings();
      controls.bind();
      preferences.subscribe(() => {
        const state = preferences.getSnapshot(),
          previous = settings;
        settings = state.settings;
        renderState();
        if (state.messageVersion !== lastPreferenceMessage) {
          lastPreferenceMessage = state.messageVersion;
          if (state.message) message(state.message);
        }
        if (state.owner !== owner || previous === settings) return;
        if (
          sharedSource &&
          ['quality', 'fps', 'seconds', 'auto'].some((key) => previous[key] !== settings[key])
        )
          void sharedStarted(sharedSource, { local: localSource === sharedSource });
      });
      renderState();
      library.subscribe(() => {
        renderState();
        const state = library.getSnapshot();
        if (state.messageVersion !== lastLibraryMessage) {
          lastLibraryMessage = state.messageVersion;
          if (state.message) message(state.message);
        }
      });
      void library.setOwner(owner);
      document
        .querySelectorAll('[data-open-clips]')
        .forEach((b) => b.addEventListener('click', open));
      $('clipClose').onclick = () => {
        $('clipsDialog').close();
        renderState();
      };
      $('clipNow').onclick = clip;
      $('clipToolbarNow').onclick = () => {
        if (window.TronoDesktop && !session?.status?.ready)
          void (settings.desktopAuto && !sharedSource
            ? ((autoPaused = false), ensureAutomaticReplay())
            : startLocalReplay());
        else clip();
      };
      $('clipFloating').onclick = () => void controls.openFloating();
      $('clipShare').onclick = async () => {
        if (window.TronoDesktop) {
          await startLocalReplay();
          return;
        }
        $('clipsDialog').close();
        const social = window.TronoSocial;
        if (!social.voiceJoined && !(await social.joinVoice())) return;
        social.openScreenOptions();
      };
      $('clipStopLocal').onclick = stopLocalReplay;
      $('clipChooseSource').onclick = () => void startLocalReplay({ choose: true });
      $('clipResume').onclick = () => {
        if (sharedSource) void sharedStarted(sharedSource, { local: localSource === sharedSource });
      };
      document
        .querySelectorAll('[data-clips-tab]')
        .forEach((b) => (b.onclick = () => tab(b.dataset.clipsTab)));
      window.addEventListener('trono-auth-change', () => void accountChanged());
      window.addEventListener('trono-call-change', (event) => {
        const joined = event.detail.joined;
        if (joined && !lastCallJoined) void ensureAutomaticReplay();
        lastCallJoined = joined;
      });
      void ensureAutomaticReplay();
      window.addEventListener('beforeunload', (e) => {
        if (session || starting || library.hasUnsavedMemory()) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
      window.addEventListener('pagehide', () => {
        stopLocalReplay();
        stop();
      });
    }
    window.addEventListener('trono:ready', bind);
    return {
      open,
      clip,
      stop,
      startLocalReplay,
      startPrimaryReplay,
      stopLocalReplay,
      get localReplay() {
        return !!localSource;
      },
      get localReplaySource() {
        return localSource;
      },
      get primaryReplay() {
        return localPrimary;
      },
      sharedStarted,
      sharedStopped,
      captureProfile,
      get preferences() {
        return { ...settings, shortcut: { ...settings.shortcut } };
      },
      get replayStatus() {
        return session
          ? {
              ...session.status,
              quality: session.quality,
              fps: session.fps,
              maxBytes: session.maxBytes,
              hasAudio: session.hasAudio,
            }
          : null;
      },
      get active() {
        return !!session && !session.stopping;
      },
    };
  })();
}
