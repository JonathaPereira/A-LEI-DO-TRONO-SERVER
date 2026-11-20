'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';

/** A preview borrows the original stream. Detaching never stops its owner's tracks. */
export function BorrowedVideo({
  stream,
  active,
  pauseWhenUnfocused = false,
  onDoubleClick,
  className,
}: {
  stream: MediaStream | null;
  active: boolean;
  pauseWhenUnfocused?: boolean;
  onDoubleClick(): void;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useLayoutEffect(() => {
    const video = ref.current!;
    if (!active) video.pause();
    if (video.srcObject !== (active ? stream : null)) video.srcObject = active ? stream : null;
    if (active && stream) void video.play().catch(() => {});
  }, [stream, active]);
  useEffect(() => {
    if (!pauseWhenUnfocused || !active || !stream) return;
    const video = ref.current;
    if (!video) return;
    const pauseIfReady = () => {
      if (video.readyState >= 2 && typeof document !== 'undefined' && !document.hasFocus()) {
        video.pause();
      }
    };
    const resume = () => {
      if (video.paused) void video.play().catch(() => {});
    };
    pauseIfReady();
    video.addEventListener('loadeddata', pauseIfReady);
    window.addEventListener('blur', pauseIfReady);
    window.addEventListener('focus', resume);
    video.addEventListener('pointerenter', resume);
    return () => {
      video.removeEventListener('loadeddata', pauseIfReady);
      window.removeEventListener('blur', pauseIfReady);
      window.removeEventListener('focus', resume);
      video.removeEventListener('pointerenter', resume);
    };
  }, [pauseWhenUnfocused, active, stream]);
  useLayoutEffect(() => {
    const video = ref.current!;
    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, []);
  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      playsInline
      muted
      onDoubleClick={onDoubleClick}
    />
  );
}
