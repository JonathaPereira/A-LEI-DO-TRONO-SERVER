'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { initializeChatComposer } from '@/lib/chat/browser';
import { EMPTY_COMPOSER } from '@/lib/chat/composer';
import type { ChatComposerController } from '@/lib/chat/composer';

const EMOJIS = [
  '😀',
  '😄',
  '😂',
  '🤣',
  '😊',
  '😍',
  '🥰',
  '😎',
  '🤔',
  '😮',
  '😢',
  '😡',
  '👍',
  '👎',
  '👏',
  '🙌',
  '🙏',
  '💪',
  '🤝',
  '❤️',
  '💙',
  '💜',
  '🔥',
  '✨',
  '⚡',
  '🎉',
  '🏆',
  '🎮',
  '🎲',
  '♛',
  '⚔️',
  '🛡️',
  '👑',
  '☕',
  '🍻',
  '🫡',
  '👀',
  '✅',
  '❌',
  '💬',
  '📷',
  '🎙️',
  '🖥️',
  '🚀',
  '💯',
  '🤡',
  '😅',
  '😉',
];

const emptySubscribe = () => () => {};
const emptySnapshot = () => EMPTY_COMPOSER;

export function ChatComposer() {
  const [composer, setComposer] = useState<ChatComposerController | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const emojiPicker = useRef<HTMLDivElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const caret = useRef<number | null>(null);
  useEffect(() => {
    setComposer(initializeChatComposer(window));
  }, []);
  const state = useSyncExternalStore(
    composer?.subscribe ?? emptySubscribe,
    composer?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  useEffect(() => {
    if (state.focusVersion) input.current?.focus();
  }, [state.focusVersion]);
  useLayoutEffect(() => {
    if (caret.current === null) return;
    input.current?.focus();
    input.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [state.draft]);
  useEffect(() => {
    if (!emojiOpen) return;
    const outside = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !emojiPicker.current?.contains(event.target) &&
        !emojiButton.current?.contains(event.target)
      )
        setEmojiOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.media-maximized')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setEmojiOpen(false);
    };
    document.addEventListener('click', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('click', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [emojiOpen]);
  function insertEmoji(emoji: string) {
    if (!composer || state.uploading) return;
    const start = input.current?.selectionStart ?? state.draft.length;
    const end = input.current?.selectionEnd ?? start;
    const next = state.draft.slice(0, start) + emoji + state.draft.slice(end);
    if (next.length > 300) return;
    caret.current = start + emoji.length;
    composer.setDraft(next);
  }
  return (
    <>
      <div className="court-chat-compose">
        <button
          id="attachFileBtn"
          disabled={!composer || state.uploading}
          onClick={() => {
            if (composer?.canAttach()) fileInput.current?.click();
          }}
          className="emoji-trigger"
          type="button"
          title="Anexar arquivo: 10 MB; vídeo MP4: 100 MB"
          aria-label="Anexar arquivo"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M8 14l7-7a3 3 0 014 4L9 21a5 5 0 01-7-7L12 4a6 6 0 018 8L10 22M5 17l11-11" />
          </svg>
        </button>
        <input
          ref={fileInput}
          id="chatFileInput"
          type="file"
          hidden
          disabled={!composer || state.uploading}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) composer?.selectFile(file);
            event.currentTarget.value = '';
          }}
        />
        <button
          ref={emojiButton}
          id="emojiBtn"
          type="button"
          className={`emoji-trigger${emojiOpen ? ' active' : ''}`}
          title="Escolher emoji"
          aria-expanded={emojiOpen}
          disabled={!composer || state.uploading}
          onClick={(event) => {
            event.stopPropagation();
            setEmojiOpen((value) => !value);
          }}
        >
          ☺
        </button>
        <div
          ref={emojiPicker}
          id="emojiPicker"
          className={`emoji-picker${emojiOpen ? '' : ' hidden'}`}
          aria-label="Seletor de emojis"
        >
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="emoji-option"
              data-emoji={emoji}
              aria-label={emoji}
              disabled={!composer || state.uploading}
              onClick={() => insertEmoji(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
        <textarea
          id="courtChatInput"
          ref={input}
          value={state.draft}
          disabled={!composer || state.uploading}
          onChange={(event) => composer?.setDraft(event.currentTarget.value)}
          maxLength={300}
          rows={2}
          placeholder="Escreva uma mensagem..."
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void composer?.send();
            }
          }}
        />
        <button
          id="courtChatSend"
          type="button"
          className="chat-send-btn"
          title="Enviar mensagem"
          onClick={() => void composer?.send()}
          disabled={!composer || state.uploading}
        >
          ➤
        </button>
      </div>
      <div id="attachmentStatus" className="attachment-status" role="status" aria-live="polite">
        {state.status}
        {(state.file || state.uploading) && (
          <button type="button" onClick={() => composer?.cancel()}>
            × Cancelar
          </button>
        )}
      </div>
    </>
  );
}
