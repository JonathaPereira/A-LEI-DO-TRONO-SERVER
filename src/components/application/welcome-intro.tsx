'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  WELCOME_INTRO_DURATION_MS,
  WELCOME_INTRO_EVENT,
  WELCOME_INTRO_EXIT_DELAY_MS,
  WELCOME_INTRO_REDUCED_DURATION_MS,
  WELCOME_INTRO_REDUCED_EXIT_DELAY_MS,
  buildWelcomeIdentityKey,
  getWelcomeGreeting,
  getWelcomeLoadStatus,
  getWelcomeRoleLabel,
} from '../../lib/application/welcome-intro';
import { Avatar } from '../profiles/avatar';
import { AppIcon as Icon } from './icons';
import { useModel, type ApplicationServices } from './services';
import styles from './welcome-intro.module.css';

function isReducedMotionPreferred() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true ||
    document.documentElement.dataset.reducedMotion === 'true'
  );
}

export function WelcomeIntroOverlay({ runtime }: { runtime: ApplicationServices }) {
  const auth = useModel(runtime.TronoAuth);
  const portal = useModel(runtime.TronoPortal);
  const channels = useModel(runtime.TronoChannels);
  const community = useModel(runtime.TronoCommunity);

  const account = auth.user || auth.guest;
  const isGuest = !auth.user && !!auth.guest;
  const identityKey = buildWelcomeIdentityKey(account, isGuest);

  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [lastIdentity, setLastIdentity] = useState<string | null>(null);

  const startIntro = useCallback(() => {
    setExiting(false);
    setVisible(true);
    setPlayKey((k) => k + 1);
  }, []);

  const dismissIntro = useCallback(() => {
    setExiting(true);
    window.setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, 260);
  }, []);

  useEffect(() => {
    if (!identityKey) {
      if (lastIdentity !== null) setLastIdentity(null);
      setVisible(false);
      setExiting(false);
      return;
    }
    if (lastIdentity !== identityKey) {
      setLastIdentity(identityKey);
      startIntro();
    }
  }, [identityKey, lastIdentity, startIntro]);

  useEffect(() => {
    const onReplay = () => {
      if (identityKey) startIntro();
    };
    window.addEventListener(WELCOME_INTRO_EVENT, onReplay);
    return () => window.removeEventListener(WELCOME_INTRO_EVENT, onReplay);
  }, [identityKey, startIntro]);

  useEffect(() => {
    if (!visible) return;
    const reduced = isReducedMotionPreferred();
    const exitDelay = reduced ? WELCOME_INTRO_REDUCED_EXIT_DELAY_MS : WELCOME_INTRO_EXIT_DELAY_MS;
    const unmountDelay = reduced ? WELCOME_INTRO_REDUCED_DURATION_MS : WELCOME_INTRO_DURATION_MS;

    const exitTimer = window.setTimeout(() => setExiting(true), exitDelay);
    const doneTimer = window.setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, unmountDelay);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }, [visible, playKey]);

  useEffect(() => {
    if (!visible || exiting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismissIntro();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, exiting, dismissIntro]);

  if (!visible || !account) return null;

  const greeting = getWelcomeGreeting(account);
  const roleLabel = getWelcomeRoleLabel(auth.user, isGuest);
  const loadStatus = getWelcomeLoadStatus({
    connected: portal.connected,
    channelsReady: channels.ready,
    membersReady: Boolean(community.presence),
    isGuest,
  });

  return (
    <div
      key={playKey}
      className={styles.overlay}
      data-welcome-intro
      data-exiting={exiting ? 'true' : 'false'}
      role="status"
      aria-live="polite"
      onClick={dismissIntro}
    >
      <div className={styles.backdrop} aria-hidden="true" />

      <div className={styles.stage}>
        <div className={styles.emblemStage}>
          <div className={styles.orbitalRing} aria-hidden="true" />
          <div className={styles.avatarShell}>
            <div className={styles.avatarClip}>
              <Avatar
                person={auth.user ?? { avatar_preset: 'person' }}
                className={styles.avatarCircle}
                title={account.nickname}
              />
              <div className={styles.sheen} aria-hidden="true" />
            </div>
            <span className={styles.crestBadge} aria-hidden="true">
              <img src="/assets/throne.png" alt="" />
            </span>
          </div>
        </div>

        <h1 className={styles.wordmark}>M&amp;N · A Lei do Trono</h1>
        <p className={styles.slogan}>A mesa está aberta. Puxe uma cadeira.</p>

        <div className={styles.divider} aria-hidden="true" />

        <div className={styles.welcomeBlock}>
          <p className={styles.greeting}>{greeting}</p>
          <span className={styles.rolePill}>
            <Icon name="crown" size={14} />
            <span>{roleLabel}</span>
          </span>
        </div>

        <div className={styles.progressWrap}>
          <div className={styles.progressTrack} aria-hidden="true">
            <div className={styles.progressBar} />
          </div>
          <p className={styles.loadStatus}>{loadStatus}</p>
        </div>
      </div>

      <button
        type="button"
        className={styles.skipButton}
        onClick={(e) => {
          e.stopPropagation();
          dismissIntro();
        }}
      >
        <span>Entrar agora</span>
        <Icon name="arrow" size={14} />
      </button>
    </div>
  );
}
