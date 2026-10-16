export function SoundboardToggle() {
  return (
    <>
      <button
        id={'soundboardToggle'}
        className={'soundboard-toggle'}
        type={'button'}
        aria-controls={'soundboardDialog'}
        aria-expanded={'false'}
      >
        <span aria-hidden={'true'}>♫</span> Efeitos
      </button>
    </>
  );
}
