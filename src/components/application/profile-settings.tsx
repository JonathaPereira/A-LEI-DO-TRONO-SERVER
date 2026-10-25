'use client';
import { useEffect } from 'react';
import { ProfileEditor } from '../profiles/editor-fields';
import { MemberProfileDialog } from '../profiles/member-profile-dialog';
import { GifPickerDialog } from '../profiles/gif-picker-dialog';
import { RegisteredAccountsDialog } from '../profiles/registered-accounts';
import { AppearanceFields } from '../profiles/appearance-fields';
import { FileLibraryFields } from '../files/library';
import { useModel, type ApplicationServices } from './services';
import styles from './profile-settings.module.css';
export function AccountSettings({ runtime }: { runtime: ApplicationServices }) {
  const settings = useModel(runtime.TronoCallSettings),
    state = useModel(runtime.TronoProfileEditor),
    auth = useModel(runtime.TronoAuth);
  useEffect(() => {
    if (!settings.open) {
      runtime.TronoProfileEditor.reset();
      runtime.TronoProfileGifs.close();
      return;
    }
    if (settings.topic === 'account' && auth.user && !state.loaded && !state.loading)
      void runtime.TronoProfileEditor.load();
  }, [runtime, settings.open, settings.topic, auth.user?.id]);
  return (
    <div className={styles.surface} data-account-settings data-topic={settings.topic}>
      <section
        className={styles.accountSection}
        hidden={settings.topic !== 'account'}
        aria-label="Meu perfil"
      >
        {auth.user ? (
          <>
            {runtime.TronoDesktop && (
              <div className={styles.remember}>
                <label>
                  <input
                    id="settingsRemember"
                    type="checkbox"
                    checked={auth.remembered}
                    onChange={(event) => void runtime.TronoAuth.setRemember(event.target.checked)}
                  />{' '}
                  Lembre de mim neste computador
                </label>
                <p role="status">
                  {auth.rememberError ||
                    'Sua sessão é protegida pelo Windows. Sair da conta remove a sessão lembrada.'}
                </p>
              </div>
            )}
            <ProfileEditor
              controller={runtime.TronoProfileEditor}
              accounts={runtime.TronoRegisteredAccounts}
              onDiscard={() => {
                runtime.TronoProfileGifs.close();
                void runtime.TronoProfileEditor.load();
              }}
              chooseGif={(target) =>
                runtime.TronoProfileGifs.open({
                  target,
                  onSelect: runtime.TronoProfileEditor.createMediaPicker(target),
                })
              }
            />
          </>
        ) : (
          <>
            <h2>Seu perfil na Corte</h2>
            <p>Entre para personalizar seu perfil e acessar seus arquivos.</p>
            <button type="button" onClick={() => runtime.TronoAuth.open('login')}>
              Entrar na conta
            </button>
          </>
        )}
      </section>
      <section hidden={settings.topic !== 'appearance'} aria-label="Aparência">
        <h2>Cores das mesas</h2>
        <p>
          Escolha a cor que acompanha você nas partidas. A identidade da Corte continua em dourado.
        </p>
        <AppearanceFields client={runtime.TronoAppearance} />
      </section>
      <section hidden={settings.topic !== 'files'} aria-label="Meus arquivos">
        <FileLibraryFields client={runtime.TronoFileLibrary} />
      </section>
    </div>
  );
}
export function ProfileDialogs({ runtime }: { runtime: ApplicationServices }) {
  return (
    <div className={styles.surface}>
      <MemberProfileDialog viewer={runtime.TronoProfileViewer} />
      <GifPickerDialog picker={runtime.TronoProfileGifs} />
      <RegisteredAccountsDialog controller={runtime.TronoRegisteredAccounts} />
    </div>
  );
}
