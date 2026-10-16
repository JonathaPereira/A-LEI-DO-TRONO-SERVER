import type { ChatFiles } from '../../types/chat';
import { initializeNetwork } from '../socket/browser.ts';
import type { NetworkRuntime } from '../socket/browser.ts';
import { createChatComposer } from './composer.ts';
import type { ChatComposerController } from './composer.ts';

interface ChatRuntime
  extends NetworkRuntime, Partial<Pick<Window, 'addEventListener' | 'removeEventListener'>> {
  TronoFiles?: ChatFiles;
  TronoChatComposer?: ChatComposerController;
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
