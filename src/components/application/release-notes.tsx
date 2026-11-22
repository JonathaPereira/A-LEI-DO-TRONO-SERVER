'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  APP_RELEASE_VERSION,
  CURRENT_RELEASE_NOTES,
  RELEASE_NOTES_OPEN_EVENT,
  markReleaseNotesSeen,
  shouldShowReleaseNotes,
} from '../../lib/application/release-notes';
import { AppIcon as Icon } from './icons';
import { useModel, type ApplicationServices } from './services';
import styles from './release-notes.module.css';

/** Discreet floating changelog shown automatically once per new version and reopenable anytime. */
export function ReleaseNotesCard({ runtime }: { runtime: ApplicationServices }) {
  const auth = useModel(runtime.TronoAuth);
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => {
    markReleaseNotesSeen(window.localStorage, APP_RELEASE_VERSION);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!auth.user) {
      setOpen(false);
      return;
    }
    if (!shouldShowReleaseNotes(window.localStorage, APP_RELEASE_VERSION)) return;
    // Mark seen as soon as it is scheduled/shown for this update so reopening the app won't repeat it.
    const timer = window.setTimeout(() => {
      if (shouldShowReleaseNotes(window.localStorage, APP_RELEASE_VERSION)) {
        markReleaseNotesSeen(window.localStorage, APP_RELEASE_VERSION);
        setOpen(true);
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [auth.user]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(RELEASE_NOTES_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(RELEASE_NOTES_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <aside
      className={styles.card}
      role="region"
      aria-label="Notas de atualização"
      data-release-notes={CURRENT_RELEASE_NOTES.version}
    >
      <header className={styles.header}>
        <div>
          <span className={styles.badge}>v{CURRENT_RELEASE_NOTES.version}</span>
          <h2>{CURRENT_RELEASE_NOTES.heading}</h2>
          <p className={styles.subtitle}>{CURRENT_RELEASE_NOTES.subtitle}</p>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Fechar notas de atualização"
          onClick={dismiss}
        >
          <Icon name="close" size={16} />
        </button>
      </header>
      <ul className={styles.list}>
        {CURRENT_RELEASE_NOTES.items.map((item) => (
          <li key={item.id} className={styles.item}>
            <span className={styles.tag}>{item.tag}</span>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </li>
        ))}
      </ul>
      <footer className={styles.footer}>
        <small>Você pode rever estas notas no menu do seu perfil.</small>
        <button type="button" className={styles.ackBtn} onClick={dismiss}>
          Entendi
        </button>
      </footer>
    </aside>
  );
}
