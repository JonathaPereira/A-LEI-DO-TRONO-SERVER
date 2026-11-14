'use client';

import { useSyncExternalStore } from 'react';
import type { ApplicationServices } from './services';
import styles from './christmas-promo.module.css';

const LIGHT_BULBS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export function ChristmasPromo({
  runtime,
  visible,
}: {
  runtime: ApplicationServices;
  visible: boolean;
}) {
  const shouldShow = useSyncExternalStore(
    runtime.TronoAppearance.subscribe,
    () => runtime.TronoAppearance.shouldShowChristmasPromo(),
    () => false,
  );

  if (!visible || !shouldShow) return null;

  return (
    <div className={styles.promoWrap}>
      <aside
        className={styles.promoCard}
        role="dialog"
        aria-modal="false"
        aria-labelledby="christmasPromoTitle"
        aria-describedby="christmasPromoDescription"
        data-christmas-promo
      >
        <div className={styles.lightsBar} aria-hidden="true">
          {LIGHT_BULBS.map((index) => (
            <span key={index} className={styles.bulb} />
          ))}
        </div>

        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Fechar apresentação de Natal"
          onClick={() => runtime.TronoAppearance.dismissChristmasPromo()}
        >
          ×
        </button>

        <div className={styles.headerRow}>
          <span className={styles.emblem} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path
                d="M16 3L18.1 7.6L23 8.1L19.3 11.4L20.4 16.2L16 13.7L11.6 16.2L12.7 11.4L9 8.1L13.9 7.6L16 3Z"
                fill="#f0d48f"
                stroke="#b87344"
                strokeWidth="1.1"
              />
              <path
                d="M7 22C9.8 18.8 12.8 17.5 16 17.5C19.2 17.5 22.2 18.8 25 22"
                stroke="#58b982"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <circle cx="11.5" cy="24" r="2.6" fill="#d93846" stroke="#f0d48f" strokeWidth="1" />
              <circle cx="20.5" cy="24" r="2.6" fill="#d93846" stroke="#f0d48f" strokeWidth="1" />
              <circle cx="16" cy="25.5" r="2.8" fill="#d6b779" stroke="#fff2cf" strokeWidth="0.9" />
            </svg>
          </span>
          <div>
            <span className={styles.subtitleTag}>Especial do Reino</span>
            <h2 id="christmasPromoTitle" className={styles.title}>
              O Natal chegou à Corte! 🎄
            </h2>
          </div>
        </div>

        <p id="christmasPromoDescription" className={styles.body}>
          Experimente nosso novo tema natalino e transforme sua experiência na Corte. Entre no clima
          das festividades!
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            data-christmas-accept
            onClick={() => runtime.TronoAppearance.acceptChristmasPromo()}
          >
            Experimentar tema natalino
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            data-christmas-dismiss
            onClick={() => runtime.TronoAppearance.dismissChristmasPromo()}
          >
            Agora não
          </button>
        </div>
      </aside>
    </div>
  );
}
