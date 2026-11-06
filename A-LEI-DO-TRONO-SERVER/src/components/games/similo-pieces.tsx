import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getCard, THEMES, THEME_IDS, type ThemeId } from '../../lib/games/similo/catalog';
import { cardInfo } from '../../lib/games/similo/info';
import styles from './similo.module.css';
import { createPortal } from 'react-dom';
const ROWS: Record<ThemeId, number[]> = {
  animals: [0, 243, 484, 725, 965, 1214, 1536],
  history: [0, 233, 469, 717, 956, 1210, 1536],
  tales: [0, 246, 486, 733, 983, 1227, 1536],
  monsters: [0, 240, 479, 720, 958, 1204, 1536],
  myths: [0, 247, 485, 706, 947, 1202, 1536],
};
export function Portrait({ id }: { id: string }) {
  const c = getCard(id),
    r = Math.floor(c.position / 4),
    top = ROWS[c.theme][r];
  return (
    <div className={styles.art} style={{ '--accent': THEMES[c.theme].color } as CSSProperties}>
      <svg
        viewBox={`${(c.position % 4) * 256} ${top} 256 ${ROWS[c.theme][r + 1] - top}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <image href={`https://similo-mn.surge.sh/v1/${c.theme}.webp`} width="1024" height="1536" />
      </svg>
      <span className={styles.caption}>
        <small>{THEMES[c.theme].name}</small>
        <strong>{c.name}</strong>
      </span>
    </div>
  );
}
export function InfoText({ id }: { id: string }) {
  const info = cardInfo(id);
  return (
    <>
      <p className={styles.context}>{info.context}</p>
      <p>{info.summary}</p>
      <div className={styles.tags}>
        {info.traits.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </>
  );
}
export function CardSlot({
  id,
  children,
  inspect,
  className = '',
  style,
}: {
  id: string;
  children: ReactNode;
  inspect: (id: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const [hint, setHint] = useState<{ left: number; top: number } | null>(null),
    [anchor, setAnchor] = useState<DOMRect | null>(null),
    hintId = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!anchor) return;
    const timer = setTimeout(
      () =>
        setHint({
          left: Math.max(10, Math.min(innerWidth - 290, anchor.right + 10)),
          top: Math.max(12, Math.min(innerHeight - 220, anchor.top)),
        }),
      450,
    );
    return () => clearTimeout(timer);
  }, [anchor]);
  function hide() {
    setAnchor(null);
    setHint(null);
  }
  useEffect(() => {
    if (!hint) return;
    const dismiss = () => hide();
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', key);
    };
  }, [hint]);
  return (
    <article
      ref={ref}
      data-card-id={id}
      className={`${styles.slot} ${className}`}
      style={style}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setAnchor(e.currentTarget.getBoundingClientRect());
      }}
      onPointerLeave={hide}
    >
      {children}
      <button
        type="button"
        className={styles.infoButton}
        aria-label={`Sobre ${getCard(id).name}`}
        aria-describedby={hint ? hintId : undefined}
        onFocus={() => setAnchor(ref.current!.getBoundingClientRect())}
        onBlur={hide}
        onClick={() => {
          hide();
          inspect(id);
        }}
      >
        i
      </button>
      {hint &&
        createPortal(
          <aside id={hintId} role="tooltip" className={styles.tooltip} style={hint}>
            <strong>{getCard(id).name}</strong>
            <InfoText id={id} />
          </aside>,
          ref.current!.closest('#similoScreen')!,
        )}
    </article>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => {
      if (d.open) d.close();
    };
  }, []);
  return (
    <dialog
      className={styles.modal}
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <button className={styles.close} onClick={close} aria-label="Fechar">
        ×
      </button>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
export function DeckPicker({
  label,
  description,
  selected,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  selected: ThemeId[];
  onChange: (v: ThemeId[]) => void;
  disabled?: boolean;
}) {
  const primary = selected[0] || 'animals';
  const secondary = selected[1] || '';
  return (
    <fieldset className={styles.deckPicker} disabled={disabled}>
      <legend>{label}</legend>
      <p>{description}</p>
      <div className={styles.deckFields}>
        <label>
          Tema principal
          <select
            value={primary}
            onChange={(event) => {
              const next = event.target.value as ThemeId;
              onChange(secondary && secondary !== next ? [next, secondary] : [next]);
            }}
          >
            {THEME_IDS.map((theme) => (
              <option key={theme} value={theme}>
                {THEMES[theme].name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Misturar com (opcional)
          <select
            value={secondary}
            onChange={(event) =>
              onChange(event.target.value ? [primary, event.target.value as ThemeId] : [primary])
            }
          >
            <option value="">Sem mistura</option>
            {THEME_IDS.filter((theme) => theme !== primary).map((theme) => (
              <option key={theme} value={theme}>
                {THEMES[theme].name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <output className={styles.deckSummary}>
        {selected.map((theme) => THEMES[theme].name).join(' + ')}
      </output>
    </fieldset>
  );
}
