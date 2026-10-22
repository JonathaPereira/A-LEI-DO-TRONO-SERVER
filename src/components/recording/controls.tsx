'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ManualRecorder } from '../../lib/recording/recorder';
import type { RecordingNotice } from '../../lib/recording/files';
const formatTime = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return (
    String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
  );
};
function RecordingToast({
  notice,
  remove,
}: {
  notice: RecordingNotice & { id: number };
  remove(id: number): void;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const fade = setTimeout(() => setVisible(false), 3600),
      close = setTimeout(() => remove(notice.id), 3850);
    return () => {
      clearTimeout(fade);
      clearTimeout(close);
    };
  }, [notice.id, remove]);
  return (
    <div className={'recorder-toast ' + (visible ? 'show ' : '') + notice.kind}>
      {notice.message}
    </div>
  );
}
export function RecordingControls({
  controller,
  buttonHost,
  noticeHost,
}: {
  controller: ManualRecorder;
  buttonHost: HTMLElement;
  noticeHost: HTMLElement;
}) {
  const state = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
      controller.getSnapshot,
    ),
    active = state.phase === 'recording',
    selecting = state.phase === 'selecting',
    finishing = state.phase === 'stopping' || state.phase === 'saving';
  const [now, setNow] = useState(Date.now),
    [notices, setNotices] = useState<(RecordingNotice & { id: number })[]>([]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (!state.notice) return;
    const notice = state.notice;
    setNotices((current) => [...current, notice]);
  }, [state.notice]);
  const remove = useCallback(
    (id: number) => setNotices((current) => current.filter((notice) => notice.id !== id)),
    [],
  );
  return (
    <>
      {createPortal(
        <button
          id="recordMatchBtn"
          className={'icon-btn record-btn' + (active || finishing ? ' recording' : '')}
          title="Gravar a partida exibida nesta aba"
          disabled={finishing}
          onClick={controller.toggle}
        >
          {finishing
            ? '… Finalizando'
            : active
              ? '■ Parar gravação'
              : selecting
                ? 'Cancelar gravação'
                : '⏺ Gravar'}
        </button>,
        buttonHost,
      )}
      {createPortal(
        <div
          id="recordingNotice"
          className={'recording-notice' + (state.phase === 'idle' || selecting ? ' hidden' : '')}
          aria-live="polite"
        >
          <span className="recording-dot" />
          <strong id="recordingNoticeLabel">
            {finishing ? 'FINALIZANDO' : selecting ? 'PREPARANDO' : 'GRAVANDO'}
          </strong>
          <b id="recordingTimer">
            {state.startedAt === null ? '00:00' : formatTime(now - state.startedAt)}
          </b>
          <small id="recordingNoticeHelp">
            {finishing
              ? 'Aguarde o arquivo ser preparado.'
              : selecting
                ? 'Escolha a tela ou cancele a gravação.'
                : 'Clique em Parar quando quiser encerrar.'}
          </small>
          <button
            id="recordingStopBtn"
            className="recording-stop-inline"
            type="button"
            disabled={finishing}
            onClick={controller.toggle}
          >
            {finishing ? '…' : selecting ? 'Cancelar' : '■ Parar'}
          </button>
        </div>,
        noticeHost,
      )}
      <div aria-live="polite">
        {notices.map((notice) => (
          <RecordingToast key={notice.id} notice={notice} remove={remove} />
        ))}
      </div>
    </>
  );
}
