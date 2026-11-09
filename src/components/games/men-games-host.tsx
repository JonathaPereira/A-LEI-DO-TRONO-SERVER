'use client';

import { useEffect, useRef, useState } from 'react';
import type { MenGameManifest } from '../../lib/men-games/types';
import styles from './men-games-host.module.css';

interface MenGamesHostProps {
  readonly game: MenGameManifest;
  readonly active: boolean;
  readonly onBack: () => void;
}

/**
 * Host sob demanda do MeN Games.
 * Isola a execução do jogo em sandbox de iframe, aloca recursos somente quando ativo
 * e destrói o frame ao sair para liberar CPU e memória para chamadas de voz.
 */
export function MenGamesHost({ game, active, onBack }: MenGamesHostProps) {
  const [loaded, setLoaded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Sincroniza visibilidade com o jogo via postMessage seguro
  useEffect(() => {
    if (!frameRef.current?.contentWindow) return;
    try {
      frameRef.current.contentWindow.postMessage(
        {
          type: 'men-game-visibility',
          visible: active,
          gameId: game.id,
        },
        '*',
      );
    } catch {
      // Ignora falhas de comunicação com origens externas
    }
  }, [active, game.id]);

  // Alterna tela cheia
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      // Falha silenciosa de fullscreen
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Se não estiver ativo, não aloca iframe nem recursos
  if (!active) {
    return null;
  }

  return (
    <div ref={containerRef} className={styles.hostContainer} data-game={game.id}>
      <header className={styles.topBar}>
        <div className={styles.leftSection}>
          <button
            type="button"
            className={styles.backButton}
            onClick={onBack}
            aria-label="Voltar ao catálogo de jogos"
          >
            ‹ Voltar ao MeN Trono
          </button>
          <div className={styles.titleArea}>
            <h2 className={styles.gameTitle}>
              {game.title}
              <span className={styles.versionBadge}>v{game.version}</span>
            </h2>
            <p className={styles.callNotice}>Sua chamada continua ativa em segundo plano</p>
          </div>
        </div>
        <div className={styles.actionsArea}>
          {game.fullscreen && (
            <button
              type="button"
              className={styles.actionButton}
              onClick={toggleFullscreen}
              aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {fullscreen ? '⤓ Sair da tela cheia' : '⤢ Tela cheia'}
            </button>
          )}
        </div>
      </header>
      <div className={styles.viewport}>
        {!loaded && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <p>Carregando {game.title}…</p>
          </div>
        )}
        <iframe
          ref={frameRef}
          src={game.entryUrl}
          className={styles.gameFrame}
          title={game.title}
          allow="fullscreen; gamepad; autoplay"
          sandbox="allow-scripts allow-same-origin allow-downloads allow-pointer-lock allow-forms"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}
