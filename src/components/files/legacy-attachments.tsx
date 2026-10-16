'use client';

import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { ChatAttachment } from '../../types/domain';
import type { FilesRuntime } from '../../lib/files/browser';
import { initializeFiles } from '../../lib/files/browser';
import { readFile } from '../../lib/files/protocol';
import { openFile } from '../../lib/files/open';
import { AttachmentContent } from './attachment';

const installed = new WeakSet<object>();

/** Legacy callers only provide an empty host; all attachment UI uses the same React renderer. */
export function installLegacyAttachments(runtime: FilesRuntime): void {
  const client = initializeFiles(runtime);
  if (installed.has(client)) return;
  installed.add(client);
  const roots = new Map<HTMLElement, Root>();
  let observer: MutationObserver | null = null;
  function cleanup() {
    for (const [host, root] of roots)
      if (!host.isConnected) {
        root.unmount();
        roots.delete(host);
      }
    if (!roots.size) {
      observer?.disconnect();
      observer = null;
    }
  }
  Object.assign(client, {
    openFile: (resolveURL: () => Promise<string>, notice: HTMLElement) => {
      const epoch = client.getSnapshot().epoch;
      const current = () => notice.isConnected && client.getSnapshot().epoch === epoch;
      return openFile(
        resolveURL,
        (message) => {
          if (current()) notice.textContent = message;
        },
        current,
      );
    },
    renderAttachment(
      host: HTMLElement,
      value: ChatAttachment,
      options: { private?: boolean } = {},
    ) {
      const file = readFile(value);
      let root = roots.get(host);
      if (!root) {
        root = createRoot(host);
        roots.set(host, root);
      }
      host.dataset.attachment = file.id;
      flushSync(() =>
        root.render(
          <AttachmentContent
            key={file.id}
            file={file}
            privateMessage={options.private}
            client={client}
          />,
        ),
      );
      if (!observer) {
        observer = new MutationObserver(cleanup);
        observer.observe(document.body, { childList: true, subtree: true });
      }
      queueMicrotask(cleanup);
    },
  });
}
