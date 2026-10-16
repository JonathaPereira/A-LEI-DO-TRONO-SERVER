'use client';

import { sendChatMessage } from '@/lib/socket/chat-actions';

export function ChatComposer() {
  return (
    <div className="court-chat-compose">
      <button
        id="attachFileBtn"
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
      <input id="chatFileInput" type="file" hidden />
      <button id="emojiBtn" className="emoji-trigger" title="Escolher emoji" aria-expanded="false">
        ☺
      </button>
      <div id="emojiPicker" className="emoji-picker hidden" aria-label="Seletor de emojis" />
      <textarea
        id="courtChatInput"
        maxLength={300}
        rows={2}
        placeholder="Escreva uma mensagem..."
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void sendChatMessage();
          }
        }}
      />
      <button
        id="courtChatSend"
        type="button"
        className="chat-send-btn"
        title="Enviar mensagem"
        onClick={() => void sendChatMessage()}
      >
        ➤
      </button>
    </div>
  );
}
