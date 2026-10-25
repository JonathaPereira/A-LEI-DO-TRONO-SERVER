'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import type { ProfileEditor as ProfileEditorController } from '../../lib/profiles/editor';
import { AVATAR_PRESETS } from '../../lib/profiles/icons';
import type { ProfileMediaKind } from '../../types/profiles';
import { Avatar } from './avatar';
import { ProfileEditorPreview } from './editor-preview';
import type { RegisteredAccounts } from '../../lib/profiles/registered-accounts';
import { CreatorAccountsButton } from './registered-accounts';

const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif';
const STATUS_EMOJIS = [
  '😀',
  '😎',
  '🥳',
  '😴',
  '🤔',
  '❤️',
  '💜',
  '🔥',
  '✨',
  '⭐',
  '🌙',
  '☀️',
  '🌈',
  '🌸',
  '🎮',
  '🎧',
  '🎵',
  '🎸',
  '🎤',
  '💻',
  '📚',
  '☕',
  '🍕',
  '🏆',
  '👑',
  '🐱',
  '🐶',
  '🐉',
  '🚀',
  '🌍',
  '🟢',
  '🔴',
  '🏳️‍🌈',
  '👨‍👩‍👧‍👦',
  '👍',
  '💬',
  '',
] as const;

function GifButton({
  media,
  disabled,
  chooseGif,
}: {
  media: ProfileMediaKind;
  disabled: boolean;
  chooseGif: (media: ProfileMediaKind) => void;
}) {
  return (
    <button
      type="button"
      className="profile-gif-button"
      data-profile-gif={media}
      disabled={disabled}
      onClick={() => chooseGif(media)}
    >
      Buscar GIF
    </button>
  );
}

function MediaField({
  media,
  label,
  disabled,
  controller,
  chooseGif,
}: {
  media: 'cover' | 'background';
  label: string;
  disabled: boolean;
  controller: ProfileEditorController;
  chooseGif: (media: ProfileMediaKind) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void controller.pick(file, media).catch(() => {});
  };
  return (
    <div className="profile-media-field">
      <strong>{label}</strong>
      <button type="button" disabled={disabled} onClick={() => input.current?.click()}>
        Imagem ou GIF
      </button>
      <button
        type="button"
        className="profile-remove-media"
        disabled={disabled}
        onClick={() => controller.removeMedia(media)}
      >
        Remover
      </button>
      <input
        ref={input}
        id={`profile-${media}-file`}
        type="file"
        accept={IMAGE_TYPES}
        aria-label={`Selecionar ${label.toLowerCase()}`}
        hidden
        disabled={disabled}
        onChange={pick}
      />
      <GifButton media={media} disabled={disabled} chooseGif={chooseGif} />
    </div>
  );
}

function RangeField({
  name,
  label,
  min,
  max,
  value,
  disabled,
  onChange,
}: {
  name: 'cover_position' | 'cover_zoom' | 'darkness' | 'blur' | 'opacity';
  label: string;
  min: number;
  max: number;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="profile-range">
      {label}
      <input
        id={`profile-${name}`}
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output id={`profile-${name}-value`} htmlFor={`profile-${name}`}>
        {value}
        {name === 'blur' ? ' px' : '%'}
      </output>
    </label>
  );
}

/** The controller owns the draft and media; React exclusively owns the editor nodes. */
export function ProfileEditor({
  controller,
  chooseGif,
  accounts,
  onDiscard,
}: {
  controller: ProfileEditorController;
  chooseGif: (media: ProfileMediaKind) => void;
  accounts: RegisteredAccounts;
  onDiscard?: () => void;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const disabled = !state.loaded || state.busy;
  const photoInput = useRef<HTMLInputElement>(null);
  const emojiButton = useRef<HTMLButtonElement>(null);
  const emojiPicker = useRef<HTMLDivElement>(null);
  const linksHost = useRef<HTMLDivElement>(null);
  const focusLink = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (!state.loaded) setPreviewOpen(false);
  }, [state.loaded, state.accountId]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiPosition, setEmojiPosition] = useState<CSSProperties>({});
  useEffect(() => {
    if (disabled) emojiPicker.current?.hidePopover();
  }, [disabled, state.accountId]);
  useEffect(() => {
    if (!focusLink.current) return;
    focusLink.current = false;
    linksHost.current?.lastElementChild
      ?.querySelector<HTMLInputElement>('[data-link-url]')
      ?.focus();
  }, [state.links.length]);
  const toggleEmoji = () => {
    const rectangle = emojiButton.current?.getBoundingClientRect();
    if (rectangle) {
      setEmojiPosition({
        left: Math.max(8, Math.min(window.innerWidth - 288, rectangle.left)),
        top: Math.max(8, Math.min(window.innerHeight - 340, rectangle.bottom + 8)),
      });
    }
    emojiPicker.current?.togglePopover();
  };
  return (
    <form
      id="profileForm"
      className="profile-editor"
      data-preview-open={previewOpen}
      onSubmit={(event) => {
        event.preventDefault();
        void controller.save();
      }}
    >
      <div className="profile-editor-fields">
        <header className="profile-editor-heading">
          <h2 id="profileTitle">Meu perfil</h2>
          <p>Seu espaço dentro do M&amp;N.</p>
        </header>
        <section className="profile-identity">
          <h3>Identidade</h3>
          <div className="profile-identity-avatar">
            <Avatar
              id="profilePreview"
              className="profile-preview"
              title="Prévia do ícone"
              person={{ avatar_preset: state.avatarPreset, avatar_file_id: state.avatarFileId }}
              localUrl={state.urls.avatar}
            />
            <div className="profile-photo-label">
              <label htmlFor="profilePhoto">Usar uma foto</label>
              <button
                id="profilePhotoChoose"
                className="small-btn"
                type="button"
                disabled={disabled}
                onClick={() => photoInput.current?.click()}
              >
                Trocar avatar
              </button>
              <input
                ref={photoInput}
                id="profilePhoto"
                type="file"
                accept={IMAGE_TYPES}
                hidden
                disabled={disabled}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void controller.pick(file, 'avatar').catch(() => {});
                }}
              />
              <small>Imagem ou GIF até 10 MB. GIFs mantêm a animação.</small>
              <GifButton media="avatar" disabled={disabled} chooseGif={chooseGif} />
            </div>
            <details className="profile-preset-choice">
              <summary>Escolher um ícone</summary>
              <div id="avatarPresets" className="avatar-presets" aria-label="Ícones disponíveis">
                {Object.entries(AVATAR_PRESETS).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    data-preset={preset}
                    title={label}
                    aria-label={label}
                    aria-pressed={
                      !state.pending.includes('avatar') &&
                      !state.avatarFileId &&
                      state.avatarPreset === preset
                    }
                    disabled={disabled}
                    onClick={() => controller.selectPreset(preset)}
                  >
                    <Avatar person={{ avatar_preset: preset }} className="" />
                  </button>
                ))}
              </div>
            </details>
          </div>
          <div className="profile-identity-name">
            <label className="auth-field">
              Apelido
              <input
                id="profileNickname"
                type="text"
                minLength={2}
                maxLength={20}
                autoComplete="nickname"
                required
                value={state.nickname}
                disabled={disabled}
                onChange={(event) => controller.setNickname(event.currentTarget.value)}
              />
              <small>De 2 a 20 caracteres. Aparece no chat e nas partidas.</small>
            </label>
            <label className="auth-field">
              @usuário
              <input
                id="profile-handle"
                maxLength={24}
                placeholder="seu_usuario"
                pattern="[a-zA-Z0-9_]{3,24}"
                value={state.draft.handle}
                disabled={disabled}
                onChange={(event) => controller.setField('handle', event.currentTarget.value)}
              />
              <small>De 3 a 24 letras, números ou sublinhado.</small>
            </label>
            <div className="profile-status-fields">
              <div className="profile-emoji-field">
                <span>Emoji</span>
                <input
                  id="profile-emoji"
                  type="hidden"
                  value={state.draft.emoji}
                  readOnly
                  disabled={disabled}
                />
                <button
                  ref={emojiButton}
                  id="profileEmojiBtn"
                  type="button"
                  aria-label={
                    state.draft.emoji
                      ? `Alterar emoji do status: ${state.draft.emoji}`
                      : 'Escolher emoji do status'
                  }
                  aria-haspopup="dialog"
                  aria-expanded={emojiOpen}
                  disabled={disabled}
                  onClick={toggleEmoji}
                >
                  {state.draft.emoji || '☺'}
                </button>
              </div>
              <label className="auth-field">
                Status
                <input
                  id="profile-status"
                  maxLength={100}
                  placeholder="Na call com a galera"
                  value={state.draft.status}
                  disabled={disabled}
                  onChange={(event) => controller.setField('status', event.currentTarget.value)}
                />
              </label>
            </div>
          </div>
        </section>
        <section className="profile-editor-extras">
          <h3>Sobre mim</h3>
          <label className="auth-field">
            Bio
            <textarea
              id="profile-bio"
              maxLength={300}
              rows={3}
              placeholder="Conte um pouco sobre você."
              value={state.draft.bio}
              disabled={disabled}
              onChange={(event) => controller.setField('bio', event.currentTarget.value)}
            />
            <small id="profile-bio-count">{state.draft.bio.length}/300</small>
          </label>
          <label className="auth-field">
            Interesses
            <input
              id="profile-tags"
              maxLength={310}
              placeholder="Jogos, Música, Tecnologia"
              value={state.tags}
              disabled={disabled}
              onChange={(event) => controller.setTags(event.currentTarget.value)}
            />
            <small>Separe por vírgulas · até 12 interesses.</small>
          </label>
          <div className="profile-links-field">
            <strong>Links</strong>
            <div ref={linksHost} id="profileLinksRows">
              {state.links.map((link, index) => (
                <div className="profile-link-row" key={index}>
                  <input
                    data-link-name
                    aria-label="Nome do link (opcional)"
                    maxLength={32}
                    placeholder="Nome (opcional)"
                    value={link.label}
                    disabled={disabled}
                    onChange={(event) =>
                      controller.setLink(index, 'label', event.currentTarget.value)
                    }
                  />
                  <input
                    data-link-url
                    aria-label="Endereço do link"
                    inputMode="url"
                    maxLength={400}
                    placeholder="youtube.com/@seucanal"
                    value={link.url}
                    disabled={disabled}
                    onChange={(event) =>
                      controller.setLink(index, 'url', event.currentTarget.value)
                    }
                  />
                  <button
                    type="button"
                    aria-label="Remover link"
                    disabled={disabled}
                    onClick={() => controller.removeLink(index)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              id="profileAddLink"
              type="button"
              disabled={disabled || state.links.length >= 8}
              onClick={() => {
                focusLink.current = true;
                controller.addLink();
              }}
            >
              + Adicionar link
            </button>
            <small>Até 8 links. O endereço pode ser digitado sem https://.</small>
          </div>
          <h3>Personalização</h3>
          <div id="profileMediaFields">
            <MediaField
              media="cover"
              label="Capa"
              controller={controller}
              chooseGif={chooseGif}
              disabled={disabled}
            />
            <MediaField
              media="background"
              label="Fundo do perfil"
              controller={controller}
              chooseGif={chooseGif}
              disabled={disabled}
            />
          </div>
          <fieldset className="profile-cover-framing">
            <legend>Enquadramento da capa</legend>
            <RangeField
              name="cover_position"
              label="Posição vertical"
              min={0}
              max={100}
              value={state.draft.cover_position}
              disabled={disabled}
              onChange={(value) => controller.setField('cover_position', value)}
            />
            <RangeField
              name="cover_zoom"
              label="Zoom"
              min={100}
              max={250}
              value={state.draft.cover_zoom}
              disabled={disabled}
              onChange={(value) => controller.setField('cover_zoom', value)}
            />
            <small>Arraste a capa na prévia para mover a imagem para cima ou para baixo.</small>
          </fieldset>
          <label className="profile-range">
            Cor de destaque
            <input
              id="profile-accent"
              type="color"
              value={state.draft.accent}
              disabled={disabled}
              onChange={(event) => controller.setField('accent', event.currentTarget.value)}
            />
          </label>
          <RangeField
            name="darkness"
            label="Escurecer fundo"
            min={0}
            max={90}
            value={state.draft.darkness}
            disabled={disabled}
            onChange={(value) => controller.setField('darkness', value)}
          />
          <RangeField
            name="blur"
            label="Desfoque"
            min={0}
            max={20}
            value={state.draft.blur}
            disabled={disabled}
            onChange={(value) => controller.setField('blur', value)}
          />
          <RangeField
            name="opacity"
            label="Opacidade do cartão"
            min={40}
            max={100}
            value={state.draft.opacity}
            disabled={disabled}
            onChange={(value) => controller.setField('opacity', value)}
          />
          <p className="appearance-help">
            Seu fundo aparece no perfil, no miniperfil e no seu cartão da chamada.
          </p>
        </section>
        <div
          ref={emojiPicker}
          id="profileEmojiPicker"
          className="profile-emoji-picker"
          popover="auto"
          role="dialog"
          aria-label="Emoji do status"
          style={emojiPosition}
          onToggle={(event) => setEmojiOpen(event.newState === 'open')}
        >
          <strong>Emoji do status</strong>
          {STATUS_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={emoji ? `Usar ${emoji}` : 'Remover emoji'}
              disabled={disabled}
              onClick={() => {
                controller.setField('emoji', emoji);
                emojiPicker.current?.hidePopover();
                emojiButton.current?.focus();
              }}
            >
              {emoji || 'Limpar'}
            </button>
          ))}
        </div>
        <div id="profileCreatorHost">
          <CreatorAccountsButton controller={accounts} profile disabled={disabled} />
        </div>
      </div>
      <ProfileEditorPreview
        state={state}
        onCoverPositionChange={(value) => controller.setField('cover_position', value)}
      />
      <div className="profile-editor-actions">
        <p
          id="profileMessage"
          role="status"
          aria-live="polite"
          className={state.error ? 'auth-error' : undefined}
        >
          {state.message}
        </p>
        <button
          type="button"
          className="profile-preview-toggle"
          aria-pressed={previewOpen}
          onClick={() => setPreviewOpen(!previewOpen)}
        >
          {previewOpen ? 'Voltar à edição' : 'Ver prévia'}
        </button>
        {onDiscard && (
          <button type="button" className="profile-discard" disabled={disabled} onClick={onDiscard}>
            Descartar alterações
          </button>
        )}
        <button id="profileSave" className="royal-btn primary" type="submit" disabled={disabled}>
          Salvar perfil
        </button>
      </div>
    </form>
  );
}
