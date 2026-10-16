import type { ChatFiles } from '../../types/chat';
import type { ChatActivity } from '../../types/chat';
import type { ChatAttachment, ChatMessage } from '../../types/domain';
import { createChatMessages } from './messages.ts';
import type { ChatMessagesController } from './messages.ts';
import { initializeNetwork } from '../socket/browser.ts';
import type { NetworkRuntime } from '../socket/browser.ts';
import { createChatComposer } from './composer.ts';
import type { ChatComposerController } from './composer.ts';

interface ChatRuntime
  extends NetworkRuntime, Partial<Pick<Window, 'addEventListener' | 'removeEventListener'>> {
  TronoFiles?: ChatFiles & { renderAttachment?(host: HTMLElement, file: ChatAttachment): void };
  TronoChatComposer?: ChatComposerController;
  TronoChatMessages?: ChatMessagesController;
  TronoSocial?: NonNullable<NetworkRuntime['TronoSocial']> & {
    onChatActivity?(activity: ChatActivity): void;
  };
  TronoProfile?: { avatarHtml(message: ChatMessage): string; hydrate(host: HTMLElement): void };
}

export function initializeChatMessages(runtime: ChatRuntime): ChatMessagesController {
  if (runtime.TronoChatMessages) return runtime.TronoChatMessages;
  const controller = createChatMessages({
    network: initializeNetwork(runtime),
    getAccount: () => runtime.TronoAuth?.user ?? null,
    subscribeIdentity: (listener) => {
      runtime.addEventListener?.('trono-auth-change', listener);
      runtime.addEventListener?.('trono-role-change', listener);
      return () => {
        runtime.removeEventListener?.('trono-auth-change', listener);
        runtime.removeEventListener?.('trono-role-change', listener);
      };
    },
    reportStatus: (message) => initializeChatComposer(runtime).reportStatus(message),
    onActivity: (activity) => runtime.TronoSocial?.onChatActivity?.(activity),
  });
  runtime.TronoChatMessages = controller;
  return controller;
}

/** These empty React hosts belong to the shared legacy renderers until their conversion. */
export function renderMessageAvatar(host: HTMLElement, message: ChatMessage): void {
  const profile = (window as ChatRuntime).TronoProfile;
  host.innerHTML = profile?.avatarHtml(message) ?? '👤';
  profile?.hydrate(host);
}
export function renderMessageAttachment(host: HTMLElement, attachment: ChatAttachment): void {
  (window as ChatRuntime).TronoFiles?.renderAttachment?.(host, { ...attachment });
}

export function initializeChatComposer(runtime: ChatRuntime): ChatComposerController {
  if (runtime.TronoChatComposer) return runtime.TronoChatComposer;
  const composer = createChatComposer({
    network: initializeNetwork(runtime),
    getFiles: () => runtime.TronoFiles ?? null,
    getAccountId: () => runtime.TronoAuth?.user?.id ?? null,
    subscribeIdentity: (listener) => {
      runtime.addEventListener?.('trono-auth-change', listener);
      return () => runtime.removeEventListener?.('trono-auth-change', listener);
    },
  });
  runtime.TronoChatComposer = composer;
  return composer;
}
