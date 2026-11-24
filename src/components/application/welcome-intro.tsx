'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WELCOME_INTRO_DURATION_MS,
  WELCOME_INTRO_EVENT,
  WELCOME_INTRO_EXIT_DELAY_MS,
  WELCOME_INTRO_MIN_READY_DURATION_MS,
  WELCOME_INTRO_MIN_READY_EXIT_MS,
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
  const [replaying, setReplaying] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  const [lastIdentity, setLastIdentity] = useState<string | null>(null);
  const dismissTimerRef = useRef<number | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const startIntro = useCallback(
    (isReplay: boolean) => {
      clearDismissTimer();
      setReplaying(isReplay);
      setExiting(false);
      setVisible(true);
      setStartedAt(Date.now());
      setPlayKey((k) => k + 1);
    },
    [clearDismissTimer],
  );

  const dismissIntro = useCallback(() => {
    clearDismissTimer();
    setExiting(true);
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      setVisible(false);
      setExiting(false);
    }, 260);
  }, [clearDismissTimer]);

  useEffect(() => clearDismissTimer, [clearDismissTimer]);

  const appReady = isGuest
    ? true
    : portal.connected && channels.ready && Boolean(community.presence);

  useEffect(() => {
    if (!identityKey) {
      if (lastIdentity !== null) setLastIdentity(null);
      clearDismissTimer();
      setVisible(false);
      setExiting(false);
      return;
    }
    if (lastIdentity !== identityKey) {
      setLastIdentity(identityKey);
      startIntro(false);
    }
  }, [identityKey, lastIdentity, startIntro, clearDismissTimer]);

  useEffect(() => {
    const onReplay = () => {
      if (identityKey) startIntro(true);
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
    if (!visible || replaying || !appReady || isReducedMotionPreferred()) return;
    const elapsed = Math.max(0, Date.now() - startedAt);
    const earlyExitDelay = Math.max(0, WELCOME_INTRO_MIN_READY_EXIT_MS - elapsed);
    const fadeDuration = WELCOME_INTRO_MIN_READY_DURATION_MS - WELCOME_INTRO_MIN_READY_EXIT_MS;

    const earlyExitTimer = window.setTimeout(() => setExiting(true), earlyExitDelay);
    const earlyDoneTimer = window.setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, earlyExitDelay + fadeDuration);

    return () => {
      window.clearTimeout(earlyExitTimer);
      window.clearTimeout(earlyDoneTimer);
    };
  }, [visible, playKey, replaying, appReady, startedAt]);

  useEffect(() => {
    if (!visible || exiting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog:modal')) {
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
