'use client';

import { useState } from 'react';

const SECTIONS = {
  profile: 'Meu perfil',
  appearance: 'Aparência',
  files: 'Meus arquivos',
} as const;

export function ProfileDialog() {
  const [section, setSection] = useState<keyof typeof SECTIONS>('profile');
  return (
    <>
      <dialog
        id={'profileDialog'}
        className={'auth-dialog profile-card'}
        aria-labelledby={'profileTitle'}
      >
        <button
          id={'profileClose'}
          className={'auth-close'}
          type={'button'}
          aria-label={'Fechar perfil'}
        >
          ×
        </button>
        <nav className="profile-settings-nav" aria-label="Configurações do perfil">
          <strong>M&amp;N</strong>
          <small>CONFIGURAÇÕES</small>
          {(Object.entries(SECTIONS) as [keyof typeof SECTIONS, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-profile-section={key}
              className={section === key ? 'active' : undefined}
              aria-pressed={section === key}
              onClick={() => setSection(key)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="profile-back"
            onClick={() => document.getElementById('profileClose')?.click()}
          >
            ← Voltar à call
          </button>
        </nav>
        <div className="profile-settings-body">
          <div className="profile-settings-pane" hidden={section !== 'profile'}>
            <div id="profileEditorHost" className="profile-editor-host" />
          </div>
          <div className="profile-settings-pane" hidden={section !== 'appearance'}>
            <section className={'profile-appearance'} aria-labelledby={'profileAppearanceTitle'}>
              <h3 id={'profileAppearanceTitle'}>Aparência</h3>
              <div id="appLayoutPickerHost" style={{ display: 'contents' }} />
              <p className={'appearance-help'}>
                A disposição fica salva apenas para você neste aparelho. Você pode trocar durante a
                chamada.
              </p>
              <div id="appearanceFieldsHost" style={{ display: 'contents' }} />
            </section>
          </div>
          <section className="profile-settings-files" hidden={section !== 'files'}>
            <div id="profileFilesHost" />
          </section>
        </div>
      </dialog>
    </>
  );
}
