'use strict';
if (!window.TronoDesktop) {
  window.TronoClips = (() => {
    const $ = (id) => document.getElementById(id),
      library = window.TronoClipLibrary,
      storage = window.TronoStorage || localStorage;
    const qualities = {
      light: { width: 1280, height: 720, bitrate: 6000000, label: '720p' },
      balanced: { width: 1920, height: 1080, bitrate: 16000000, label: '1080p' },
      high: { width: 2560, height: 1440, bitrate: 28000000, label: '1440p' },
    };
    let owner = 'local',
      settings,
      session = null,
      sharedSource = null,
      localSource = null,
      localChoosing = false,
      starting = false,
      generation = 0,
      choosingShortcut = false,
      pip = null,
      localPrimary = false,
      autoPaused = false,
      automaticPreparing = false,
      lastCallJoined = false,
      lastCaptureError = null,
      localCaptureGeneration = 0;
    let lastLibraryMessage = 0;
    const account = () => window.TronoAuth?.user?.id || 'local';
    const defaults = () => ({
      version: 2,
      quality: 'balanced',
      fps: 60,
      seconds: 30,
      auto: true,
      desktopAuto: true,
      shortcut: { code: 'KeyX', ctrl: true, shift: true, alt: false, meta: false },
    });
    function message(text) {
      $('clipsStatus').textContent = text;
    }
    function shortcutLabel(s = settings.shortcut) {
      return [
        s.ctrl ? 'Ctrl' : '',
        s.alt ? 'Alt' : '',
        s.shift ? 'Shift' : '',
        s.meta ? 'Meta' : '',
        s.code.replace(/^Key|^Digit/, ''),
      ]
        .filter(Boolean)
        .join(' + ');
    }
    function readSettings() {
      let saved = {};
      try {
        saved = JSON.parse(storage.getItem('tronoClips:' + owner) || '{}');
      } catch {}
      if (saved.version !== 2) {
        saved.quality = saved.quality === 'high' ? 'high' : 'balanced';
        saved.fps = 60;
      }
      settings = { ...defaults(), ...saved, version: 2 };
      if (!qualities[settings.quality]) settings.quality = 'light';
      if (![30, 60].includes(settings.fps)) settings.fps = 30;
      if (![15, 30, 60, 120].includes(settings.seconds)) settings.seconds = 30;
      if (!settings.shortcut?.code) settings.shortcut = defaults().shortcut;
      settings.auto = settings.auto !== false;
    }
    function saveSettings() {
      storage.setItem('tronoClips:' + owner, JSON.stringify(settings));
    }
    function renderState() {
      const { directory, pendingCount: count } = library.getSnapshot();
      const active = !!session && !session.stopping,
        ready = !!(active && session.status?.ready);
      $('clipQuality').value = settings.quality;
      $('clipFps').value = String(settings.fps);
      $('clipSeconds').value = String(settings.seconds);
      $('clipAuto').checked = settings.auto;
      $('clipDesktopAuto').checked = settings.desktopAuto;
      $('clipDesktopAutoLabel').hidden = !window.TronoDesktop;
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
        ? 'Guardar o replay · ' + shortcutLabel()
        : window.TronoDesktop
          ? 'Ativar replay local sem transmitir para a chamada'
          : 'Compartilhe sua tela para preparar o replay';
      $('clipToolbarNow').classList.toggle('replay-ready', ready);
      $('clipShortcut').textContent = choosingShortcut ? 'Pressione o atalho…' : shortcutLabel();
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
      $('clipFolder').textContent = directory
        ? directory.name
        : 'Escolher arquivo ao salvar / Downloads';
      $('clipResetFolder').hidden = !directory;
      $('clipChooseFolder').hidden =
        !window.TronoDesktop && typeof window.showDirectoryPicker !== 'function';
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
      if (pip && !pip.closed) {
        const status = pip.document.getElementById('pipStatus');
        if (status) status.textContent = $('clipSource').textContent;
        const button = pip.document.getElementById('pipClip');
        if (button) {
          button.disabled = !ready;
          button.textContent = 'Clipar últimos ' + settings.seconds + ' s';
        }
        const count = pip.document.getElementById('pipCount');
        if (count) count.textContent = count + ' clipes pendentes';
      }
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
    function captureProfile() {
      const prefs = settings || defaults(),
        q = qualities[prefs.quality];
      return prefs.auto ? { width: q.width, height: q.height, fps: prefs.fps } : null;
    }
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
          quality: qualities[settings.quality],
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
        const q = qualities[settings.quality];
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
    async function floating() {
      if (pip && !pip.closed) {
        pip.focus();
        return;
      }
      try {
        pip = await window.documentPictureInPicture.requestWindow({ width: 290, height: 210 });
        const doc = pip.document;
        doc.title = 'Clipes M&N';
        const style = doc.createElement('style');
        style.textContent =
          'body{margin:0;padding:16px;background:#141727;color:#eef0ff;font:14px system-ui}button{padding:12px;width:100%;border:1px solid #8d7ec0;border-radius:10px;background:#453764;color:white;margin:8px 0;cursor:pointer}button:disabled{opacity:.5}small{display:block;color:#b5b8d2;margin:6px 0}';
        doc.head.appendChild(style);
        const title = doc.createElement('strong');
        title.textContent = 'Clipes · M&N';
        const status = doc.createElement('small');
        status.id = 'pipStatus';
        const button = doc.createElement('button');
        button.id = 'pipClip';
        button.onclick = clip;
        const count = doc.createElement('small');
        count.id = 'pipCount';
        const back = doc.createElement('button');
        back.textContent = 'Abrir central';
        back.onclick = () => {
          window.focus();
          open();
        };
        doc.body.append(title, status, button, count, back);
        doc.addEventListener('keydown', keydown);
        renderState();
      } catch {
        message('Não foi possível abrir a janela flutuante. Use a central de clipes nesta página.');
      }
    }
    function keydown(e) {
      if (choosingShortcut) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          choosingShortcut = false;
          renderState();
          return;
        }
        if (!/^(Key[A-Z]|Digit[0-9]|F\d{1,2})$/.test(e.code)) return;
        e.preventDefault();
        e.stopPropagation();
        const reserved =
          ['F5', 'F11', 'F12'].includes(e.code) ||
          ((e.ctrlKey || e.metaKey) &&
            ['KeyR', 'KeyW', 'KeyT', 'KeyL', 'KeyN', 'KeyP'].includes(e.code));
        if (reserved || (!e.ctrlKey && !e.altKey && !e.metaKey && !/^F\d/.test(e.code))) {
          message(
            'Use Ctrl/Alt/Meta com uma tecla ou uma tecla F livre. Evite atalhos reservados do navegador.',
          );
          return;
        }
        settings.shortcut = {
          code: e.code,
          ctrl: e.ctrlKey,
          alt: e.altKey,
          shift: e.shiftKey,
          meta: e.metaKey,
        };
        choosingShortcut = false;
        saveSettings();
        renderState();
        message(
          window.TronoDesktop
            ? 'Atalho atualizado. Confira o estado do atalho global abaixo.'
            : window.TronoClipDesktop?.connected
              ? 'Atalho enviado ao componente Windows.'
              : 'Atalho configurado para esta página. Conecte o componente Windows para usar durante o jogo.',
        );
        return;
      }
      const s = settings?.shortcut;
      if (!s || e.repeat || e.target.closest?.('input,textarea,select,[contenteditable="true"]'))
        return;
      if (
        e.code === s.code &&
        e.ctrlKey === s.ctrl &&
        e.altKey === s.alt &&
        e.shiftKey === s.shift &&
        e.metaKey === s.meta
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (!window.TronoClipDesktop?.globalActive) clip();
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
        choosingShortcut = false;
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
      $('clipChooseFolder').onclick = () => void library.chooseFolder();
      $('clipFloating').onclick = () => void floating();
      $('clipShortcut').onclick = () => {
        choosingShortcut = true;
        renderState();
        message('Pressione o novo atalho. Esc cancela.');
      };
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
      $('clipDesktopAuto').onchange = () => {
        settings.desktopAuto = $('clipDesktopAuto').checked;
        saveSettings();
        if (settings.desktopAuto) {
          autoPaused = false;
          void ensureAutomaticReplay();
        } else if (localPrimary) stopLocalReplay();
      };
      $('clipResume').onclick = () => {
        if (sharedSource) void sharedStarted(sharedSource, { local: localSource === sharedSource });
      };
      document
        .querySelectorAll('[data-clips-tab]')
        .forEach((b) => (b.onclick = () => tab(b.dataset.clipsTab)));
      $('clipResetFolder').onclick = () => void library.resetFolder();
      for (const [id, key] of [
        ['clipQuality', 'quality'],
        ['clipFps', 'fps'],
        ['clipSeconds', 'seconds'],
        ['clipAuto', 'auto'],
      ])
        $(id).addEventListener('change', () => {
          settings[key] =
            key === 'auto' ? $(id).checked : key === 'quality' ? $(id).value : Number($(id).value);
          saveSettings();
          if (sharedSource)
            void sharedStarted(sharedSource, { local: localSource === sharedSource });
          else renderState();
        });
      document.addEventListener('keydown', keydown, true);
      $('clipsDialog').addEventListener('close', () => {
        choosingShortcut = false;
      });
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
