'use client';
import { useSyncExternalStore } from 'react';
import type { ScreenOptionsClient } from '../../lib/voice/screen-options';
import styles from '../application/media-dialog.module.css';
import { useNativeDialog } from './use-native-dialog';

export function ScreenOptionsDialog() {
  return (
    <dialog
      id="screenOptionsDialog"
      className={styles.dialog}
      aria-labelledby="screenOptionsTitle"
    />
  );
}
export function ScreenOptionsContent({
  client,
  dialog,
  desktop,
}: {
  client: ScreenOptionsClient;
  dialog: HTMLDialogElement;
  desktop: boolean;
}) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useNativeDialog(dialog, state.open, client.close);
  return (
    <>
      <span className={'section-eyebrow'}>TRANSMISSÃO</span>
      <h2 id={'screenOptionsTitle'}>Compartilhe do seu jeito</h2>
      <p id="shareOptionsNote">
        {state.limited
          ? 'O limite de consumo atual permite até 720p / 30 FPS.'
          : desktop
            ? 'Escolha a qualidade; em seguida, selecione a tela ou janela no aplicativo.'
            : 'Escolha a qualidade; em seguida, o navegador perguntará qual tela ou aba compartilhar.'}
      </p>
      <form
        id={'screenOptionsForm'}
        onSubmit={(event) => {
          event.preventDefault();
          void client.confirm();
        }}
      >
        <div className={'form-columns'}>
          <label>
            Qualidade
            <select
              id={'shareResolution'}
              value={state.resolution}
              onChange={(event) => client.setResolution(event.currentTarget.value)}
            >
              <option value={'720'}>720p · Equilibrada</option>
              <option value={'1080'} disabled={state.limited}>
                1080p · Alta definição
              </option>
            </select>
          </label>
          <label>
            Quadros por segundo
            <select
              id={'shareFps'}
              value={state.fps}
              onChange={(event) => client.setFps(event.currentTarget.value)}
            >
              <option value={'15'}>15 FPS · Textos e slides</option>
              <option value={'30'}>30 FPS · Recomendado</option>
              <option value={'60'} disabled={state.limited}>
                60 FPS · Movimento fluido
              </option>
            </select>
          </label>
        </div>
        <label className={'feature-checkbox'}>
          <input
            id={'shareAudio'}
            type={'checkbox'}
            checked={state.audio}
            onChange={(event) => client.setAudio(event.currentTarget.checked)}
          />{' '}
          Compartilhar áudio, quando disponível
        </label>
        <small>
          Para compartilhar só o som do jogo, escolha sua aba ou janela. O áudio do computador
          inteiro pode incluir a chamada; se houver retorno de voz, desmarque o áudio.
        </small>
        <p id={'shareReplayHelp'} className={'share-replay-help'} hidden={desktop}>
          {state.replay
            ? 'O replay será preparado automaticamente para clipar pelo botão ✂ na barra da chamada, com o áudio da tela quando disponível.'
            : 'Replay desligado. Ative em Meus clipes → Preferências para preparar clipes ao compartilhar.'}
        </p>
        <div className={'dialog-actions'}>
          <button
            id={'screenOptionsCancel'}
            onClick={client.close}
            type={'button'}
            className={'secondary-button'}
          >
            Cancelar
          </button>
          <button id={'screenOptionsConfirm'} type={'submit'} className={'primary-button'}>
            Escolher tela →
          </button>
        </div>
      </form>
    </>
  );
}
