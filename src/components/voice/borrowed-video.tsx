'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createViewerFpsMeter, type ViewerFpsSnapshot } from '../../lib/voice/viewer-fps-meter';

/** A preview borrows the original stream. Detaching never stops its owner's tracks. */
export function BorrowedVideo({
  stream,
  active,
  pauseWhenUnfocused = false,
  onStats,
  onDoubleClick,
  className,
}: {
  stream: MediaStream | null;
  active: boolean;
  pauseWhenUnfocused?: boolean;
  onStats?: (stats: ViewerFpsSnapshot | null) => void;
  onDoubleClick(): void;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useLayoutEffect(() => {
    const video = ref.current!;
    if (!active) video.pause();
    if (video.srcObject !== (active ? stream : null)) video.srcObject = active ? stream : null;
    if (
      active &&
      stream &&
      !(pauseWhenUnfocused && typeof document !== 'undefined' && !document.hasFocus())
    )
      void video.play().catch(() => {});
  }, [stream, active, pauseWhenUnfocused]);
  useEffect(() => {
    if (!onStats) return;
    if (!active || !stream || !ref.current) {
      onStats(null);
      return;
    }
    const meter = createViewerFpsMeter({
      video: ref.current,
      onUpdate: onStats,
    });
    return () => {
      meter.dispose();
      onStats(null);
    };
  }, [active, stream, onStats]);
  useEffect(() => {
    if (!active || !stream) return;
    const video = ref.current;
    if (!video) return;
    const canResume = () =>
      !(pauseWhenUnfocused && typeof document !== 'undefined' && !document.hasFocus()) &&
      !(typeof document !== 'undefined' && document.hidden);
    const resume = () => {
      if (canResume() && video.paused) void video.play().catch(() => {});
    };
    const tracked = new Set<MediaStreamTrack>();
    const bindTrack = (track: MediaStreamTrack) => {
      if (track.kind !== 'video' || tracked.has(track)) return;
      tracked.add(track);
      track.addEventListener('unmute', resume);
    };
    const onAddTrack = (event: MediaStreamTrackEvent) => {
      if (event.track) bindTrack(event.track);
      resume();
    };
    const onVisibility = () => {
      if (!document.hidden) resume();
    };
    for (const track of stream.getVideoTracks()) bindTrack(track);
    stream.addEventListener?.('addtrack', onAddTrack);
    video.addEventListener('canplay', resume);
    document.addEventListener('visibilitychange', onVisibility);

    const pauseIfReady = () => {
      if (
        pauseWhenUnfocused &&
        video.readyState >= 2 &&
        typeof document !== 'undefined' &&
        !document.hasFocus()
      ) {
        video.pause();
      }
    };
    if (pauseWhenUnfocused) {
      pauseIfReady();
      video.addEventListener('loadeddata', pauseIfReady);
      window.addEventListener('blur', pauseIfReady);
      window.addEventListener('focus', resume);
      video.addEventListener('pointerenter', resume);
    } else {
      resume();
    }
    return () => {
      for (const track of tracked) track.removeEventListener('unmute', resume);
      tracked.clear();
      stream.removeEventListener?.('addtrack', onAddTrack);
      video.removeEventListener('canplay', resume);
      document.removeEventListener('visibilitychange', onVisibility);
      if (pauseWhenUnfocused) {
        video.removeEventListener('loadeddata', pauseIfReady);
        window.removeEventListener('blur', pauseIfReady);
        window.removeEventListener('focus', resume);
        video.removeEventListener('pointerenter', resume);
      }
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
