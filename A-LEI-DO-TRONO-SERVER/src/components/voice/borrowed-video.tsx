'use client';
import { useLayoutEffect, useRef } from 'react';

/** A preview borrows the original stream. Detaching never stops its owner's tracks. */
export function BorrowedVideo({
  stream,
  active,
  onDoubleClick,
  className,
}: {
  stream: MediaStream | null;
  active: boolean;
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
