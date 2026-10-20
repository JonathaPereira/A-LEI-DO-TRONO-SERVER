import { createThroneNavigation, type ThroneNavigation } from '../../lib/games/throne-navigation';
import { safeThroneLawChoices } from '../../lib/games/throne-law-planner';
import { throneRules } from '../../lib/games/throne-rules';
import type { NetworkClient } from '../../lib/socket/client';
import type { CallNavigation } from '../../lib/voice/navigation';
import type { VoiceRuntime } from '../../lib/voice/runtime';
import type { Portal } from '../../lib/navigation/portal';
import type { CommunityNavigation } from '../../lib/navigation/community-navigation';
import type { ThroneLobby } from '../../lib/games/throne-lobby';
import type { ThroneMatch } from '../../lib/games/throne-match';
import type { ThroneLocalEngine } from '../../lib/games/throne-local-engine';
import type { ThroneLocalLifecycle } from '../../lib/games/throne-local-lifecycle';
import type { ThroneChoices } from '../../lib/games/throne-choices';
import type { ThroneHand } from '../../lib/games/throne-hand';
import type { ThronePrivate } from '../../lib/games/throne-private';
import type { ThroneHistory } from '../../lib/games/throne-history';
import type { ThroneEffects } from '../../lib/games/throne-effects';
import type { ThroneControls } from '../../lib/games/throne-controls';
import type { ThroneEvents } from '../../lib/games/throne-events';
interface Runtime extends Window {
  TronoNetwork: NetworkClient;
  TronoPortal: Portal;
  TronoCallNavigation: CallNavigation;
  TronoSocial: VoiceRuntime;
  TronoThroneLobby: ThroneLobby;
  TronoThroneMatch: ThroneMatch;
  TronoThroneChoices: ThroneChoices;
  TronoThroneHand: ThroneHand;
  TronoThronePrivate: ThronePrivate;
  TronoThroneHistory: ThroneHistory;
  TronoThroneEffects: ThroneEffects;
  TronoThroneControls: ThroneControls;
  TronoThroneEvents: ThroneEvents;
  TronoThroneLocal: ThroneLocalLifecycle;
  TronoThroneLocalEngine: ThroneLocalEngine;
  TronoCommunityNavigation?: CommunityNavigation;
  TronoThroneBoard?: ThroneNavigation;
  TronoStorage?: Storage;
  TronoAudio: { toggleMusic(): void };
  __LeiDoTrono?: {
    getState(): unknown;
    validateLawPlan(): unknown;
    setFast(): void;
    toggleMusic(): void;
    usurpacaoRule(): { rule: string; privateReveal: string };
  };
}
const installed = new WeakMap<Window, () => void>();
export function initializeThroneNavigation(target: Window): () => void {
  const previous = installed.get(target);
  if (previous) return previous;
  const runtime = target as Runtime,
    doc = target.document,
    storage = runtime.TronoStorage ?? target.localStorage;
  const controller = createThroneNavigation({
    network: runtime.TronoNetwork,
    hub: () => runtime.TronoCallNavigation.getSnapshot().hub,
    hasLobby: () => !!runtime.TronoThroneLobby.getSnapshot().selected,
    joined: () => runtime.TronoSocial.voiceJoined,
    leaveVoice: () => runtime.TronoSocial.leaveVoice(),
    leaveCommunity: () => runtime.TronoCommunityNavigation?.leave() ?? Promise.resolve(),
    prepareName(name) {
      try {
        storage.setItem('tronoPlayerName', name);
      } catch {
        /* Optional persistence. */
      }
      [name, 'Epaminondas', 'Bonifácio', 'Cícero'].forEach((value, index) => {
        (doc.getElementById(`p${index}Name`) as HTMLInputElement).value = value;
      });
    },
    clearGame() {
      runtime.TronoThroneLocal.cancel();
      runtime.TronoThroneEvents.clear();
      runtime.TronoThroneChoices.clear();
      runtime.TronoThroneHand.clear();
      runtime.TronoThroneEffects.clear();
      runtime.TronoThroneLobby.clear();
      runtime.TronoThronePrivate.clear();
      runtime.TronoThroneHistory.clear();
      runtime.TronoThroneMatch.clear();
    },
    setHub: (value) => runtime.TronoSocial.setChatHubMode(value),
    showPanel: (value) => runtime.TronoSocial.showForRoom(value),
    showSetup: () => runtime.TronoPortal.showOnly('setupScreen'),
    showBoard: () => runtime.TronoPortal.showOnly('gameScreen'),
    setNameFeedback: (value) => runtime.TronoPortal.setNameFeedback(value),
    notify: (text, ms = 1500) =>
      runtime.TronoThroneEffects.toast(text, ms, runtime.TronoThroneControls.getSnapshot().scale),
    connection: (name, reason) => runtime.TronoThroneEffects.connection(name, null, reason),
    schedule(fn, ms) {
      const timer = target.setTimeout(fn, ms);
      return () => target.clearTimeout(timer);
    },
    warn: (error) => console.warn('[ThroneNavigation]', error),
  });
  runtime.TronoThroneBoard = controller;
  const diagnostics = {
    getState: () => runtime.TronoThroneLocalEngine.getState() ?? controller.getState(),
    validateLawPlan: () => {
      const current = runtime.TronoThroneLocalEngine.getState() ?? controller.getState();
      return current ? safeThroneLawChoices(current, current.trick + 1) : [];
    },
    setFast: () => runtime.TronoThroneControls.setFast(),
    toggleMusic: () => runtime.TronoAudio.toggleMusic(),
    usurpacaoRule: () => ({
      rule: throneRules.laws.usurpacao.description,
      privateReveal:
        'A identidade das duas cartas só é exibida no cliente local quando ele é a Sombra ou a Casa escolhida.',
    }),
  };
  runtime.__LeiDoTrono = diagnostics;
  controller.start();
  controller.presentOnlineMatch(runtime.TronoThroneMatch.getSnapshot().match);
  const dispose = () => {
    controller.dispose();
    if (runtime.TronoThroneBoard === controller) delete runtime.TronoThroneBoard;
    if (runtime.__LeiDoTrono === diagnostics) delete runtime.__LeiDoTrono;
    installed.delete(target);
  };
  installed.set(target, dispose);
  return dispose;
}
