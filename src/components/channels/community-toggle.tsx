export function CommunityToggle() {
  return (
    <>
      <button
        id={'communityToggle'}
        className={'community-toggle hidden'}
        type={'button'}
        aria-controls={'communityPanel'}
        aria-expanded={'false'}
      >
        Pessoas
      </button>
    </>
  );
}
