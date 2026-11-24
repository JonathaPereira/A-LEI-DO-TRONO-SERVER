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

/**
 * Discreet in-flow release notes banner shown automatically only on the first
 * open of a new version (never covering interactive controls) and reopenable
 * anytime in expanded mode from the user menu or desktop settings.
 */
export function ReleaseNotesCard({
  runtime,
  visible = true,
}: {
  runtime: ApplicationServices;
  visible?: boolean;
}) {
  const auth = useModel(runtime.TronoAuth);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const dismiss = useCallback(() => {
    markReleaseNotesSeen(window.localStorage, APP_RELEASE_VERSION);
    setOpen(false);
    setExpanded(false);
  }, []);

  useEffect(() => {
    if (!auth.user) {
      setOpen(false);
      setExpanded(false);
      return;
    }
    if (!shouldShowReleaseNotes(window.localStorage, APP_RELEASE_VERSION)) return;
    markReleaseNotesSeen(window.localStorage, APP_RELEASE_VERSION);
    setExpanded(false);
    setOpen(true);
  }, [auth.user]);

  useEffect(() => {
    const onOpen = () => {
      setExpanded(true);
      setOpen(true);
    };
    window.addEventListener(RELEASE_NOTES_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(RELEASE_NOTES_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog:modal')) dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, dismiss]);

  if (!open || !visible) return null;

  return (
    <div className={styles.wrap}>
      <aside
        className={styles.card}
        role="region"
        aria-label="Notas de atualização"
        data-release-notes={CURRENT_RELEASE_NOTES.version}
        data-expanded={expanded ? 'true' : 'false'}
      >
        <div className={styles.summaryRow}>
          <span className={styles.badge}>v{CURRENT_RELEASE_NOTES.version}</span>
          <div className={styles.summaryText}>
            <strong>{CURRENT_RELEASE_NOTES.heading}</strong>
            <span>{CURRENT_RELEASE_NOTES.subtitle}</span>
          </div>
          <div className={styles.summaryActions}>
            <button
              type="button"
              className={styles.toggleBtn}
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Ocultar detalhes' : 'Ver novidades'}
            </button>
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="Fechar notas de atualização"
              onClick={dismiss}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        </div>
        {expanded && (
          <>
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
              <small>Você pode rever estas notas quando quiser no menu do seu perfil.</small>
              <button type="button" className={styles.ackBtn} onClick={dismiss}>
                Entendi
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
