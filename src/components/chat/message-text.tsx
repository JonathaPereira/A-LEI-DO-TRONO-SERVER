'use client';

import { Fragment } from 'react';
import { parseChatLinks } from '../../lib/chat/links';

/** Renders plain chat text with validated HTTP/HTTPS URLs as external clickable links. */
export function MessageText({ text }: { text: string }) {
  const segments = parseChatLinks(text);
  if (segments.length === 0) return null;
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'link' && segment.href ? (
          <a
            key={`${index}:${segment.href}`}
            className="chat-message-link"
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {segment.text}
          </a>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
