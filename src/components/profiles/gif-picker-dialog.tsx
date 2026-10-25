'use client';

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { AppIcon as Icon } from '../application/icons';
import styles from './gif-picker.module.css';
import type { GifPicker } from '../../lib/profiles/gif-picker';

export function GifPickerDialog({ picker }: { picker: GifPicker }) {
  const state = useSyncExternalStore(picker.subscribe, picker.getSnapshot, picker.getSnapshot);
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (state.open && !element.open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      input.current?.focus();
    } else if (!state.open && element.open) {
      element.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      returnFocus.current = null;
    }
  }, [state.open]);
  return (
    <dialog
      closedby="any"
      ref={dialog}
      id="profileGifDialog"
      className={styles.picker + ' profile-gif-dialog'}
      aria-labelledby="profileGifTitle"
      onCancel={(event) => {
        event.preventDefault();
        if (!state.busy) picker.close();
      }}
      onClose={(event) => {
        if (!event.currentTarget.open) picker.close();
      }}
    >
      <header>
        <div>
          <h2 id="profileGifTitle">
            Buscar GIF para{' '}
            {{ avatar: 'o avatar', cover: 'a capa', background: 'o fundo' }[state.target]}
          </h2>
          <p>GIPHY · GIFs de até 10 MB</p>
        </div>
        <button
          type="button"
          className="profile-gif-close"
          aria-label="Fechar busca de GIFs"
          disabled={state.busy}
          onClick={picker.close}
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      <form
        className="profile-gif-search"
        onSubmit={(event) => {
          event.preventDefault();
          void picker.search();
        }}
      >
        <input
          ref={input}
          type="search"
          aria-label="Buscar GIFs"
          placeholder="Reações, memes, personagens…"
          maxLength={80}
          value={state.query}
          disabled={state.busy}
          onChange={(event) => picker.setQuery(event.currentTarget.value)}
        />
        <button type="submit" disabled={state.busy}>
          Buscar
        </button>
      </form>
      <details className="profile-gif-alternative">
        <summary>Usar um link do GIPHY</summary>
        <a
          className="profile-gif-external"
          href={
            state.query.trim()
              ? 'https://giphy.com/search/' + encodeURIComponent(state.query.trim())
              : 'https://giphy.com/'
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir busca no GIPHY ↗
        </a>
        <form
          className="profile-gif-link"
          onSubmit={(event) => {
            event.preventDefault();
            picker.previewLink();
          }}
        >
          <input
            type="url"
            aria-label="Link do GIF no GIPHY"
            placeholder="Cole o link do GIF no GIPHY"
            maxLength={2048}
            required
            value={state.link}
            disabled={state.busy}
            onChange={(event) => picker.setLink(event.currentTarget.value)}
          />
          <button type="submit" disabled={state.busy}>
            Pré-visualizar
          </button>
        </form>
      </details>
      <p className="profile-gif-message" role="status" aria-live="polite">
        {state.message}
      </p>
      <div className="profile-gif-results" aria-busy={state.loading || state.busy}>
        {state.open &&
          state.items.map((item) => (
            <article key={item.id}>
              <button
                type="button"
                aria-label={'Usar ' + item.credit.title}
                disabled={state.busy || state.failed.includes(item.id)}
                onClick={() => void picker.select(item.id)}
                title={item.credit.title}
              >
                <img
                  src={item.preview || item.url}
                  alt="GIF do GIPHY"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => picker.imageFailed(item.id)}
                />
              </button>
              <a
                href={item.credit.source}
                target="_blank"
                rel="noopener noreferrer"
                title={item.credit.author + ' · GIPHY'}
              >
                {item.credit.author} · GIPHY
              </a>
            </article>
          ))}
      </div>
      <footer className="profile-gif-footer">
        <button
          className="profile-gif-more"
          type="button"
          hidden={state.next === null || state.loading}
          disabled={state.busy}
          onClick={() => void picker.more()}
        >
          Carregar mais
        </button>
        <a
          className="profile-gif-attribution"
          href="https://giphy.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by GIPHY
        </a>
      </footer>
    </dialog>
  );
}
