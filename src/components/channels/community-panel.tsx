export function CommunityPanel() {
  return (
    <>
      <aside
        id={'communityPanel'}
        className={'community-panel hidden'}
        aria-label={'Presença na comunidade'}
      >
        <header>
          <div>
            <strong>Pessoas</strong>
            <small id={'communitySummary'}>Conectando…</small>
          </div>
          <button
            id={'communityClose'}
            className={'community-close'}
            type={'button'}
            aria-label={'Fechar painel de pessoas'}
          >
            ×
          </button>
        </header>
        <p id={'communityScope'} className={'community-scope'}></p>
        <div id={'communityMembers'} className={'community-members'}></div>
        <section className={'community-activity'}>
          <strong>Atividade da voz</strong>
          <ul id={'communityActivity'}></ul>
        </section>
      </aside>
    </>
  );
}
