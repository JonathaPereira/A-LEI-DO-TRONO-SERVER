'use client';
import { useSyncExternalStore } from 'react';
import { hasLiveVideo, type Mosaic, type MosaicPerson } from '../../lib/voice/mosaic';
import { BorrowedVideo } from '../voice/borrowed-video';
import { useNativeDialog } from './use-native-dialog';

export function MediaFocusDialog() {
  return (
    <dialog
      id="mediaFocusDialog"
      className="media-focus-dialog"
      aria-labelledby="mediaFocusTitle"
    />
  );
}
function FocusPerson({ person: p, client }: { person: MosaicPerson; client: Mosaic }) {
  const camera = hasLiveVideo(p.camera),
    screen = hasLiveVideo(p.screen);
  return (
    <article
      className={'focus-person' + (camera ? ' has-camera' : '') + (screen ? ' has-screen' : '')}
      data-peer={p.id}
    >
      <div className="focus-person-media">
        <BorrowedVideo
          className="focus-screen"
          stream={p.screen}
          active={screen}
          onDoubleClick={() => void client.fullscreen(p.id, 'screen')}
        />
        <BorrowedVideo
          className="focus-camera"
          stream={p.camera}
          active={camera}
          onDoubleClick={() => void client.fullscreen(p.id, 'camera')}
        />
        <span className="focus-video-placeholder" hidden={camera || screen}>
          Aguardando vídeo…
        </span>
      </div>
      <footer>
        <div>
          <strong>
            {p.name}
            {p.self ? ' · você' : ''}
          </strong>
          <small>
            {camera && screen
              ? 'Câmera + tela'
              : screen
                ? 'Tela'
                : camera
                  ? 'Câmera'
                  : 'Aguardando mídia'}
          </small>
        </div>
        <div className="focus-media-actions">
          <button
            className="focus-full-screen"
            type="button"
            hidden={!screen}
            aria-label={'Tela cheia: tela de ' + p.name}
            onClick={() => void client.fullscreen(p.id, 'screen')}
          >
            ⛶ Tela
          </button>
          <button
            className="focus-full-camera"
            type="button"
            hidden={!camera}
            aria-label={'Tela cheia: câmera de ' + p.name}
            onClick={() => void client.fullscreen(p.id, 'camera')}
          >
            ⛶ Câmera
          </button>
          <button
            className="focus-watch"
            type="button"
            hidden={!p.screenOffered || p.watching}
            onClick={() => void client.toggleScreen(p.id)}
          >
            ▶ Assistir
          </button>
          <button
            className="focus-camera-toggle"
            type="button"
            hidden={p.self || !p.cameraOffered}
            aria-label={
              (p.cameraHidden ? 'Mostrar' : 'Ocultar') + ' câmera de ' + p.name + ' na grade'
            }
            onClick={() => void client.toggleCamera(p.id)}
          >
            {p.cameraHidden ? 'Mostrar câmera' : 'Ocultar câmera'}
          </button>
        </div>
      </footer>
    </article>
  );
}
export function MediaFocusContent({
  client,
  dialog,
}: {
  client: Mosaic;
  dialog: HTMLDialogElement;
}) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useNativeDialog(dialog, state.open, client.close);
  return (
    <>
      <header>
        <div>
          <span className="section-eyebrow">VISUALIZAÇÃO EM GRUPO</span>
          <h2 id="mediaFocusTitle">Grade de até 6 pessoas</h2>
          <p>
            Marque quem quer ver. Use ⛶ na câmera ou na tela para sair da grade e abrir em tela
            cheia.
          </p>
        </div>
        <div className="dialog-actions">
          <button
            id="mediaFocusFullscreen"
            className="secondary-button"
            type="button"
            title="Abrir a primeira mídia selecionada em tela cheia"
            disabled={!state.visible.some((p) => hasLiveVideo(p.screen) || hasLiveVideo(p.camera))}
            onClick={() => void client.fullscreen()}
          >
            ⛶ Tela cheia do destaque
          </button>
          <button
            id="mediaFocusClose"
            className="dialog-close"
            type="button"
            aria-label="Fechar mosaico"
            onClick={client.close}
          >
            ×
          </button>
        </div>
      </header>
      <div className="media-focus-selection">
        <div id="mediaFocusPicker">
          {state.open &&
            state.people.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={state.selected.includes(p.id)}
                  disabled={state.selected.length >= 6 && !state.selected.includes(p.id)}
                  aria-label={'Incluir ' + p.name + ' no mosaico'}
                  onChange={(event) => client.select(p.id, event.currentTarget.checked)}
                />
                <span>{p.name}</span>
              </label>
            ))}
        </div>
        <output id="mediaFocusCount">{state.selected.length} de 6 pessoas</output>
      </div>
      <div id="mediaFocusGrid" className="media-focus-grid" data-count={state.visible.length}>
        {state.visible.map((p) => (
          <FocusPerson key={p.id} person={p} client={client} />
        ))}
        {state.open && !state.visible.length && (
          <p className="mosaic-empty">Selecione até seis pessoas para montar sua grade.</p>
        )}
      </div>
    </>
  );
}
