import type { ChatFiles } from '../../types/chat';
import type { ChatActivity } from '../../types/chat';
import { createChatMessages } from './messages.ts';
import type { ChatMessagesController } from './messages.ts';
import { initializeNetwork } from '../socket/browser.ts';
import type { NetworkRuntime } from '../socket/browser.ts';
import { createChatComposer } from './composer.ts';
import type { ChatComposerController } from './composer.ts';

interface ChatRuntime
  extends NetworkRuntime, Partial<Pick<Window, 'addEventListener' | 'removeEventListener'>> {
  TronoFiles?: ChatFiles;
  TronoChatComposer?: ChatComposerController;
  TronoChatMessages?: ChatMessagesController;
  TronoSocial?: NonNullable<NetworkRuntime['TronoSocial']> & {
    onChatActivity?(activity: ChatActivity): void;
  };
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
