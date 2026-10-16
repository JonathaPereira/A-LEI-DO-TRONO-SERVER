export function CallNoticeHost() {
  return (
    <>
      <div
        id={'callNoticeHost'}
        className={'community-call-notices'}
        role={'status'}
        aria-live={'polite'}
        aria-atomic={'false'}
      ></div>
    </>
  );
}
