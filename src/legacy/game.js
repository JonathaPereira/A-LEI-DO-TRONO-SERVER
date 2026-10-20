'use strict';

const LAWS = window.TronoRules.laws;
const DECREES = window.TronoRules.decrees;
const $ = (id) => document.getElementById(id);
let game = null;
let leavingGame = false;
const throneLocal = window.TronoThroneLocal;
const throneEngine = window.TronoThroneLocalEngine;
const throneControls = window.TronoThroneControls;
const throneLobby = window.TronoThroneLobby;
const throneChoices = window.TronoThroneChoices;
const throneHand = window.TronoThroneHand;
const throneMatch = window.TronoThroneMatch;
const thronePrivate = window.TronoThronePrivate;
const throneHistory = window.TronoThroneHistory;
const throneEffects = window.TronoThroneEffects;
let onlineGameMode = false;
let chatOnlyRoomState = null;
const storage = window.TronoStorage || localStorage;
const ensureAudio = (...args) => window.TronoAudio?.ensureAudio(...args) || Promise.resolve(false);
const toggleMusic = (...args) => window.TronoAudio?.toggleMusic(...args);
function toast(text, ms = 1500) {
  throneEffects.toast(text, ms, throneControls.getSnapshot().scale);
}
function showConnectionNotice(name, botName = null, reason = 'disconnect') {
  throneEffects.connection(name, botName, reason);
}

function enterOnlineBoard() {
  onlineGameMode = true;
  window.TronoPortal?.showOnly?.('gameScreen');
}
// Presentation bridge only. Network parsing and clock state belong to TronoThroneMatch.
function presentOnlineMatch(state) {
  if (!state) {
    if (game?.online) game = null;
    return;
  }
  if (leavingGame) return;
  if (!onlineGameMode) enterOnlineBoard();
  const next = {
    ...state,
    decree: state.decree ? DECREES.find((d) => d.id === state.decree) : null,
    gameOver: state.phase === 'game-over',
  };
  // Temporary public presentation adapter; the event owner reads ThroneMatch directly.
  if (game?.online) Object.assign(game, next);
  else game = next;
}

function consumeChatOnlyRoom(room) {
  chatOnlyRoomState = room;
  if (room?.id)
    try {
      sessionStorage.setItem(
        'mn-resume-chat',
        JSON.stringify({ id: room.id, userId: window.TronoAuth?.user?.id }),
      );
    } catch {}
  if ($('chatOnlyRoomName')) $('chatOnlyRoomName').textContent = room?.name || 'Comunidade';
  if ($('chatOnlyStatus'))
    $('chatOnlyStatus').textContent =
      `${room?.name || 'Comunidade'} · ${room?.channelType === 'text' ? 'Canal de texto' : room?.channelType === 'voice' ? 'Canal de voz' : 'Texto e voz'}`;
  document.querySelector('.court-chat-title strong').textContent =
    '# ' + (room?.name || 'conversa');
  $('channelFilesBtn').classList.toggle('hidden', room?.channelType === 'voice');
  window.TronoNetwork?.requestChatChannels?.();
  const count = room?.count ?? room?.players?.length ?? 0;
  if ($('chatOnlyCount'))
    $('chatOnlyCount').textContent =
      `${count} ${count === 1 ? 'pessoa conectada' : 'pessoas conectadas'}`;
  if (!window.TronoNetwork?.connected && $('chatOnlyStatus'))
    $('chatOnlyStatus').textContent = 'Reconectando ao servidor...';
}

async function enterChatOnly({
  validatedIdentity,
  channelId,
  isCurrent = () => true,
  showScreen,
} = {}) {
  if (!isCurrent()) return false;
  if (window.TronoAuth && !window.TronoAuth.user) {
    window.TronoAuth.open('login');
    return false;
  }
  if (
    !$('chatOnlyScreen') ||
    !$('socialPanel') ||
    !window.TronoSocial?.showForRoom ||
    !window.TronoNetwork?.joinChatOnly
  )
    throw new Error('O chat não terminou de carregar. Recarregue com Ctrl+F5.');
  const validation = validatedIdentity || (await window.TronoPortal?.validateIdentity?.());
  if (!isCurrent()) return false;
  if (validation && !validation.ok) {
    toast(validation.message || 'Escolha um nome disponível.', 1800);
    window.TronoPortal?.showPortal?.();
    $('portalIdentity')?.focus();
    return false;
  }
  const name = validation?.name || $('playerIdentity')?.value?.trim();
  if (!name) {
    toast('Digite um nome para entrar.', 1600);
    window.TronoPortal?.showPortal?.();
    return false;
  }
  storage.setItem('tronoPlayerName', name);
  await window.TronoCommunityAdmin?.refresh?.().catch(() => {});
  if (!isCurrent()) return false;
  const requested = window.TronoChannels.get(channelId) ? channelId : null,
    current = window.TronoNetwork.currentRoom;
  const restoreCurrent = window.TronoChannels.get(current) && (!requested || requested === current);
  const preserveVoice =
    !requested && window.TronoNetwork.independentGameVoice && window.TronoSocial.voiceJoined;
  if (!requested)
    channelId = preserveVoice
      ? window.TronoChannels.getSnapshot().channels.find((c) => c.type !== 'voice')?.id
      : (window.TronoDesktop
          ? window.TronoChannels.getSnapshot().channels.find((c) => c.type !== 'text')?.id
          : null) || window.TronoChannels.getSnapshot().channels[0]?.id;
  if (!window.TronoNetwork.gameRoom) {
    throneLobby.clear();
    onlineGameMode = false;
  }
  chatOnlyRoomState = null;
  try {
    window.TronoSocial.setChatHubMode?.(true);
    window.TronoSocial.showForRoom(true);
    if (showScreen) showScreen();
    else if (window.TronoPortal?.showOnly) window.TronoPortal.showOnly('chatOnlyScreen');
    else
      for (const id of [
        'portalScreen',
        'setupScreen',
        'roomScreen',
        'gameScreen',
        'chatOnlyScreen',
      ])
        $(id)?.classList.toggle('hidden', id !== 'chatOnlyScreen');
    document.body.classList.remove('portal-active');
    document.body.classList.add('chat-only-active');
  } catch (err) {
    window.TronoSocial.setChatHubMode(false);
    throw err;
  }
  if (restoreCurrent) {
    consumeChatOnlyRoom(window.TronoSocial.chatRoomState);
    return true;
  }
  if (!channelId) {
    $('chatOnlyStatus').textContent = preserveVoice
      ? 'Sua chamada continua conectada. Selecione uma sala de voz para trocar de chamada.'
      : 'Nenhum canal disponível. Crie um canal para começar.';
    if (!preserveVoice) {
      window.TronoNetwork.leaveVoiceRoom();
      window.TronoSocial.consumeRoom(null);
    }
    return true;
  }
  $('chatOnlyStatus').textContent = 'Abrindo a comunidade...';
  void ensureAudio().catch(() => {});
  try {
    const textSubscription = preserveVoice || window.TronoChannels.get(channelId)?.type === 'text',
      wasInVoice = window.TronoSocial.voiceJoined;
    if (!textSubscription && window.TronoNetwork.primaryRoom !== channelId && wasInVoice)
      await window.TronoSocial.leaveVoice();
    if (!isCurrent()) return false;
    const online = await (textSubscription
      ? window.TronoNetwork.joinTextChannel(channelId, name)
      : window.TronoNetwork.joinChatChannel(channelId, name));
    if (!isCurrent()) return false;
    window.TronoNetwork.requestChatChannels?.();
    if (window.TronoCallNavigation.getSnapshot().hub && !online)
      $('chatOnlyStatus').textContent =
        'Servidor indisponível. Aguarde a reconexão ou volte ao início para tentar novamente.';
  } catch (err) {
    if (!isCurrent()) return false;
    console.warn('Conexão ao chat:', err);
    if (window.TronoCallNavigation.getSnapshot().hub)
      $('chatOnlyStatus').textContent =
        'Conexão interrompida. Aguarde a reconexão ou volte ao início para tentar novamente.';
  }
  return true;
}

let chatChannelSwitching = false;
let chatChannelResumeVoice = null;
async function switchChatChannel(channelId, { connectVoice = false } = {}) {
  if (
    !window.TronoCallNavigation.getSnapshot().hub ||
    chatChannelSwitching ||
    !window.TronoChannels.get(channelId)
  )
    return;
  if (
    window.TronoNetwork?.currentRoom === channelId &&
    (window.TronoChannels.get(channelId)?.type === 'text' ||
      window.TronoNetwork.primaryRoom === channelId)
  ) {
    if (
      connectVoice &&
      window.TronoChannels.get(channelId)?.type !== 'text' &&
      !window.TronoSocial.voiceJoined
    )
      await window.TronoSocial.joinVoice();
    return;
  }
  chatChannelSwitching = true;
  try {
    const wasInVoice = Boolean(window.TronoSocial?.voiceJoined);
    const textChannel = window.TronoChannels.get(channelId)?.type === 'text';
    const keepVoice = textChannel || channelId === window.TronoNetwork.primaryRoom;
    if (!keepVoice) await window.TronoSocial?.leaveVoice?.();
    const name = (
      storage.getItem('tronoPlayerName') ||
      $('portalIdentity')?.value ||
      $('playerIdentity')?.value ||
      ''
    ).trim();
    if (!name) {
      toast('Informe seu nome no portal para entrar.', 1800);
      return;
    }
    // Only an explicit room choice starts voice. Opening/resuming the hub never does.
    chatChannelResumeVoice =
      (wasInVoice || connectVoice) && !textChannel && !window.TronoSocial.voiceJoined
        ? channelId
        : null;
    const online = await (textChannel
      ? window.TronoNetwork.joinTextChannel(channelId, name)
      : window.TronoNetwork.joinChatChannel(channelId, name));
    if (!online) throw new Error('Servidor indisponível.');
    $('chatOnlyStatus').textContent = textChannel
      ? 'Abrindo mensagens...'
      : `Entrando no canal ${window.TronoChannels.get(channelId).name}...`;
    window.TronoSocial?.clearChannelChat?.();
  } catch (err) {
    chatChannelResumeVoice = false;
    toast(err?.message || 'Não foi possível trocar de canal.', 2200);
  } finally {
    chatChannelSwitching = false;
  }
}

async function leaveChatOnly() {
  chatChannelResumeVoice = null;
  try {
    sessionStorage.removeItem('mn-resume-chat');
  } catch {}
  await window.TronoSocial?.leaveVoice?.();
  window.TronoSocial?.showForRoom?.(false);
  window.TronoSocial?.setChatHubMode?.(false);
  window.TronoNetwork?.leaveVoiceRoom();
  chatOnlyRoomState = null;
  document.body.classList.remove('chat-only-active');
  $('chatOnlyScreen').classList.add('hidden');
  if (window.TronoPortal?.showPortal) window.TronoPortal.showPortal();
  else $('setupScreen').classList.remove('hidden');
  setTimeout(() => window.TronoNetwork?.requestRooms(), 120);
}

function backToLobby() {
  throneLocal.cancel();
  window.TronoThroneEvents.clear();
  throneChoices.clear();
  throneHand.clear();
  leavingGame = true;
  throneEffects.clear();
  if (
    window.TronoNetwork?.gameRoom &&
    window.TronoNetwork?.primaryRoom === window.TronoNetwork?.gameRoom
  )
    void window.TronoSocial?.leaveVoice?.();
  window.TronoNetwork?.leaveGameRoom();
  throneLobby.clear();
  onlineGameMode = false;
  game = null;
  thronePrivate.clear();
  throneHistory.clear();
  throneMatch.clear();
  window.TronoSocial?.setChatHubMode?.(false);
  document.body.classList.remove('chat-only-active');
  window.TronoPortal?.showOnly?.('setupScreen');
  if (!window.TronoSocial?.voiceJoined) window.TronoSocial?.showForRoom?.(false);
  setTimeout(() => window.TronoNetwork?.requestRooms(), 120);
}
$('chatOnlyBtn')?.addEventListener('click', () =>
  enterChatOnly().catch((err) => {
    window.TronoPortal?.showPortal?.();
    toast(err.message || 'Não foi possível abrir o chat.', 3000);
    console.error(err);
  }),
);
$('backFromChatOnlyBtn')?.addEventListener('click', () => leaveChatOnly().catch(fatalError));
window.TronoNetwork?.onMessage((msg) => {
  if (msg.type === 'connection') {
    if (
      !msg.connected &&
      (throneLobby.getSnapshot().room ||
        onlineGameMode ||
        window.TronoCallNavigation.getSnapshot().hub)
    )
      showConnectionNotice('Você', null, 'self-disconnect');
    if (window.TronoCallNavigation.getSnapshot().hub && $('chatOnlyStatus'))
      $('chatOnlyStatus').textContent = msg.connected
        ? 'Servidor reconectado.'
        : 'Conexão interrompida; tentando reconectar...';
  }
  if (msg.type === 'version-mismatch') {
    toast('⚠ Frontend e backend estão em versões diferentes.', 3200);
  }
  if (
    msg.type === 'channel-deleted' &&
    window.TronoCallNavigation.getSnapshot().hub &&
    msg.roomId === chatOnlyRoomState?.id
  ) {
    chatOnlyRoomState = null;
    chatChannelResumeVoice = false;
    try {
      sessionStorage.removeItem('mn-resume-chat');
    } catch {}
    window.TronoSocial.consumeChatRoom(null);
    document.body.classList.remove('channel-text-active', 'channel-voice-active');
    $('chatOnlyStatus').textContent = 'Este canal foi excluído. Escolha outro canal.';
    window.TronoSocial.clearChannelChat();
    window.TronoNetwork.requestChatChannels();
  }
  if (msg.type === 'joined-text-channel' && window.TronoCallNavigation.getSnapshot().hub)
    consumeChatOnlyRoom(msg.room);
  if (msg.type === 'joined-room') {
    if (msg.room?.kind === 'chat') {
      window.TronoSocial?.setChatHubMode?.(true);
      consumeChatOnlyRoom(msg.room);
      if (chatChannelResumeVoice === msg.room.id) {
        chatChannelResumeVoice = null;
        void window.TronoSocial?.joinVoice?.();
      }
    }
  }
  if (msg.type === 'room-state') {
    if (msg.room?.kind === 'chat' && msg.room.id === window.TronoNetwork.currentRoom)
      consumeChatOnlyRoom(msg.room);
  }
  if (msg.type === 'player-left' && !onlineGameMode) {
    if (window.TronoCallNavigation.getSnapshot().hub) {
      toast(`${msg.name || 'Uma pessoa'} saiu do canal.`, 1500);
    } else if (msg.reason === 'disconnect') showConnectionNotice(msg.name, null, 'disconnect');
    else toast(`${msg.name || 'Um jogador'} deixou o salão.`, 1600);
  }
  if (msg.type === 'error') {
    if (msg.code === 'NAME_TAKEN' || msg.code === 'NAME_REQUIRED') {
      window.TronoPortal?.setNameFeedback?.({
        available: false,
        code: msg.code,
        message: msg.message || 'Nome indisponível.',
      });
      toast(msg.message || 'Escolha outro nome.', 2800);
      if (window.TronoCallNavigation.getSnapshot().hub) {
        leaveChatOnly().catch(() => window.TronoPortal?.showPortal?.());
      } else if (throneLobby.getSnapshot().selected && !onlineGameMode) {
        backToLobby();
      }
    } else toast(msg.message || 'Erro de sala', 2400);
  }
});
window.addEventListener('trono:ready', async () => {
  await window.TronoAuth?.ready;
  try {
    const saved = JSON.parse(sessionStorage.getItem('mn-resume-chat') || 'null');
    if (saved?.id && saved.userId === window.TronoAuth?.user?.id)
      await enterChatOnly({
        channelId: saved.id,
      });
  } catch (err) {
    console.warn('Retomar chat:', err);
  }
  const savedName = storage.getItem('tronoPlayerName');
  if (savedName !== null) $('playerIdentity').value = savedName;
  const online = await window.TronoNetwork?.connect();
  if (online) window.TronoNetwork.requestRooms();
});
function fatalError(err) {
  if (err.name === 'AbortError') return;
  console.error(err);
  throneHistory.appendPublic(`Erro de execução: ${err.message}`, 0, 0);
  toast('O jogo encontrou um erro. Veja o console.', 3000);
}

// Utilidades de teste expostas sem interferir na partida normal.
window.TronoChatHub = {
  enter: enterChatOnly,
  leave: leaveChatOnly,
  switchChannel: switchChatChannel,
  openChannelText(id) {
    void window.TronoMessenger.joinChannel(id, {
      showText: true,
    }).catch((e) => toast(e.message, 2200));
  },
  get channels() {
    return window.TronoChannels.getSnapshot().channels;
  },
};
window.__LeiDoTrono = {
  getState: () => throneEngine.getState() || game,
  validateLawPlan: () => {
    const current = throneEngine.getState() || game;
    return current ? window.TronoThroneLawPlanner(current, current.trick + 1) : [];
  },
  setFast: () => {
    throneControls.setFast();
  },
  toggleMusic,
  usurpacaoRule: () => ({
    rule: LAWS.usurpacao.description,
    privateReveal:
      'A identidade das duas cartas só é exibida no cliente local quando ele é a Sombra ou a Casa escolhida.',
  }),
};

// Temporary board bridge: typed owners control the lobby and lifecycle; the engine clears only its own run.
window.TronoThroneBoard = {
  presentOnlineMatch,
  enterLocal() {
    game = null;
    onlineGameMode = false;
    leavingGame = false;
  },
  notify: toast,
  get online() {
    return !!game?.online;
  },
  prepareRoom(name) {
    leavingGame = false;
    window.TronoSocial?.setChatHubMode?.(false);
    storage.setItem('tronoPlayerName', name);
    $('p0Name').value = name;
    $('p1Name').value = 'Epaminondas';
    $('p2Name').value = 'Bonifácio';
    $('p3Name').value = 'Cícero';
  },
  backToLobby,
};
