'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  bindHoverTooltip,
  tooltipPosition,
  type TooltipContent,
} from '../../lib/layout/hover-tooltip';
import './hover-tooltip.css';

export function HoverTooltip() {
  const [view, setView] = useState<TooltipContent | null>(null);
  const [position, setPosition] = useState({ x: 14, y: 14 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => bindHoverTooltip(window, setView), []);
  useLayoutEffect(() => {
    if (!view || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPosition(
      tooltipPosition(view, rect, { width: window.innerWidth, height: window.innerHeight }),
    );
  }, [view]);
  return (
    <div
      id="hoverTooltip"
      ref={ref}
      role="tooltip"
      hidden={!view}
      className={`hover-tooltip${view ? ' visible' : ''}`}
      style={{ left: position.x, top: position.y }}
    >
      {view?.text}
    </div>
  );
}
