import type { AuthCallback } from '../../types/auth';
import type { AccountSession } from './session';
import type { AuthRequest } from './api';
import { passwordChecks, validPassword } from './password.ts';

export const authModes = {
  login: {
    title: 'Bem-vindo de volta',
    intro: 'Entre na sua conta para conversar e jogar.',
    button: 'Entrar',
  },
  signup: {
    title: 'Crie sua conta',
    intro: 'Escolha seu apelido e confirme seu e-mail para participar.',
    button: 'Criar conta',
  },
  recover: {
    title: 'Recupere sua senha',
    intro: 'Enviaremos um link para você criar uma nova senha.',
    button: 'Enviar link',
  },
  reset: {
    title: 'Crie uma nova senha',
    intro: 'Escolha uma senha que cumpra os requisitos abaixo.',
    button: 'Salvar nova senha',
  },
} as const;
export type AuthMode = keyof typeof authModes;
export interface AuthFields {
  readonly email: string;
  readonly nickname: string;
  readonly password: string;
  readonly confirm: string;
}
export interface AuthFormsSnapshot {
  readonly mode: AuthMode;
  readonly open: boolean;
  readonly busy: boolean;
  readonly fields: AuthFields;
  readonly showPassword: boolean;
  readonly remembered: boolean;
  readonly message: string;
  readonly error: boolean;
  readonly guestOpen: boolean;
  readonly guestName: string;
  readonly guestBusy: boolean;
  readonly guestMessage: string;
  readonly focus: keyof AuthFields;
  readonly focusVersion: number;
}
interface Options {
  session: AccountSession;
  api: AuthRequest;
  takeCallback(): AuthCallback | undefined;
  disconnect(): void;
  enterGame(): void;
}
const empty: AuthFields = Object.freeze({ email: '', nickname: '', password: '', confirm: '' });
const text = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';
const serverMessage = (value: Record<string, unknown>) => {
  if (typeof value.message !== 'string') throw Error('Resposta de autenticação inválida.');
  return value.message;
};
/** Owns dialogs and their pending requests. Recovery credentials remain private and entered passwords are never persisted. */
export function createAuthForms(options: Options) {
  const session = options.session,
    listeners = new Set<() => void>();
  let disposed = false,
    generation = 0,
    request = new AbortController(),
    recoveryToken: string | null = null;
  let state: AuthFormsSnapshot = Object.freeze({
    mode: 'login',
    open: false,
    busy: false,
    fields: empty,
    showPassword: false,
    remembered: session.getSnapshot().remembered,
    message: '',
    error: false,
    guestOpen: false,
    guestName: '',
    guestBusy: false,
    guestMessage: '',
    focus: 'email',
    focusVersion: 0,
  });
  function update(patch: Partial<AuthFormsSnapshot>) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    listeners.forEach((listener) => listener());
  }
  function cancel() {
    request.abort();
    request = new AbortController();
    generation++;
  }
  function open(next: string = 'login', message = '', error = false) {
    if (disposed) return;
    cancel();
    session.cancelTransition();
    const mode = Object.hasOwn(authModes, next) ? (next as AuthMode) : 'login';
    if (mode !== 'reset') recoveryToken = null;
    update({
      mode,
      open: true,
      busy: false,
      fields: empty,
      showPassword: false,
      message,
      error,
      guestOpen: false,
      guestBusy: false,
      focus: mode === 'signup' ? 'nickname' : mode === 'reset' ? 'password' : 'email',
      focusVersion: state.focusVersion + 1,
    });
  }
  function close() {
    if (!state.busy)
      update({
        open: false,
        fields: Object.freeze({ ...state.fields, password: '', confirm: '' }),
      });
  }
  function openGuest() {
    if (disposed || state.busy || session.getSnapshot().user) return;
    cancel();
    session.cancelTransition();
    update({
      open: false,
      fields: empty,
      guestOpen: true,
      guestName: session.getSnapshot().guest?.nickname ?? '',
      guestBusy: false,
      guestMessage: '',
    });
  }
  function closeGuest() {
    if (disposed) return;
    cancel();
    session.cancelTransition();
    update({ guestOpen: false, guestBusy: false, guestMessage: '' });
  }
  async function callback(): Promise<boolean> {
    if (disposed) return false;
    const data = options.takeCallback();
    if (!data) return false;
    cancel();
    session.clear();
    options.disconnect();
    recoveryToken = null;
    if (data.error) {
      open('recover', 'Este link expirou ou não é válido. Solicite outro e-mail.', true);
      return true;
    }
    const version = generation,
      epoch = session.getSnapshot().epoch,
      signal = request.signal;
    const current = () =>
      !disposed &&
      !signal.aborted &&
      version === generation &&
      epoch === session.getSnapshot().epoch;
    update({ busy: true });
    try {
      const recovery = data.hashType === 'recovery' || data.type === 'recovery';
      if (data.token_hash) {
        const result = await options.api(
          'verify',
          { token_hash: data.token_hash, type: recovery ? 'recovery' : data.type },
          null,
          'POST',
          signal,
        );
        if (!current()) return true;
        if (recovery) {
          if (typeof result.recovery_token !== 'string' || !result.recovery_token)
            throw Error('Este link expirou. Solicite uma nova recuperação de senha.');
          recoveryToken = result.recovery_token;
          open('reset');
        } else open('login', serverMessage(result));
      } else if (data.access_token) {
        await options.api('me', null, data.access_token, 'GET', signal);
        if (!current()) return true;
        if (recovery) {
          recoveryToken = data.access_token;
          open('reset');
        } else {
          await options.api('logout', {}, data.access_token, 'POST', signal).catch(() => {});
          if (current()) open('login', 'E-mail confirmado. Entre com sua senha.');
        }
      }
    } catch (error) {
      if (current()) open('recover', text(error), true);
    } finally {
      if (current()) update({ busy: false });
    }
    return true;
  }
  const unsubscribe = session.subscribe(() => {
    const source = session.getSnapshot();
    if (source.user) recoveryToken = null;
    if (source.remembered !== state.remembered) update({ remembered: source.remembered });
  });
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open,
    close,
    openGuest,
    closeGuest,
    callback,
    start: () => session.start(callback),
    passwordChecks,
    validPassword,
    switchMode(mode: AuthMode) {
      if (!state.busy) open(mode);
    },
    setField(key: keyof AuthFields, value: string) {
      if (disposed || state.busy) return;
      const fields = Object.freeze({ ...state.fields, [key]: value });
      const matched =
        state.message === 'As senhas não são iguais.' && fields.password === fields.confirm;
      update({ fields, ...(matched ? { message: '', error: false } : {}) });
    },
    setShowPassword(value: boolean) {
      update({ showPassword: value });
    },
    setRemember(value: boolean) {
      return session.setRemember(value);
    },
    setGuestName(name: string) {
      if (!state.guestBusy) update({ guestName: name.slice(0, 20) });
    },
    async submit() {
      if (disposed || state.busy || !state.open) return;
      const fields = state.fields,
        mode = state.mode;
      if (mode === 'signup' || mode === 'reset') {
        if (!validPassword(fields.password)) {
          update({
            message:
              new TextEncoder().encode(fields.password).length > 72
                ? 'A senha deve ter no máximo 72 bytes.'
                : 'A senha precisa cumprir todos os requisitos abaixo.',
            error: true,
            focus: 'password',
            focusVersion: state.focusVersion + 1,
          });
          return;
        }
        if (fields.password !== fields.confirm) {
          update({
            message: 'As senhas não são iguais.',
            error: true,
            focus: 'confirm',
            focusVersion: state.focusVersion + 1,
          });
          return;
        }
      }
      cancel();
      const version = generation,
        signal = request.signal,
        email = fields.email.trim();
      const current = () => !disposed && version === generation && !signal.aborted;
      update({ busy: true, message: 'Aguarde…', error: false });
      try {
        if (mode === 'login') {
          await session.login(email, fields.password, state.remembered);
          if (current()) update({ fields: empty, open: false });
        } else if (mode === 'signup') {
          const result = await options.api(
            'signup',
            { email, password: fields.password, nickname: fields.nickname },
            null,
            'POST',
            signal,
          );
          if (current()) {
            const message = serverMessage(result);
            open('login', message);
            update({ fields: Object.freeze({ ...empty, email }) });
          }
        } else if (mode === 'recover') {
          const result = await options.api('recover', { email }, null, 'POST', signal);
          if (current()) update({ message: serverMessage(result) });
        } else {
          if (!recoveryToken)
            throw Error('Este link expirou. Solicite uma nova recuperação de senha.');
          const result = await options.api(
            'reset',
            { password: fields.password },
            recoveryToken,
            'POST',
            signal,
          );
          if (!current()) return;
          recoveryToken = null;
          session.clear();
          options.disconnect();
          open('login', serverMessage(result));
        }
      } catch (error) {
        if (current() && !(error instanceof DOMException && error.name === 'AbortError'))
          update({ message: text(error), error: true });
      } finally {
        if (current()) update({ busy: false });
      }
    },
    async submitGuest() {
      if (disposed || state.guestBusy || !state.guestOpen) return;
      cancel();
      const version = generation;
      update({ guestBusy: true, guestMessage: 'Conectando ao jogo…' });
      try {
        await session.authenticateGuest(state.guestName.trim());
        if (!disposed && version === generation) {
          update({ guestOpen: false });
          options.enterGame();
        }
      } catch (error) {
        if (
          !disposed &&
          version === generation &&
          !(error instanceof DOMException && error.name === 'AbortError')
        )
          update({ guestMessage: text(error) });
      } finally {
        if (!disposed && version === generation) update({ guestBusy: false });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      session.cancelTransition();
      unsubscribe();
      recoveryToken = null;
      state = Object.freeze({
        ...state,
        fields: empty,
        guestName: '',
        message: '',
        guestMessage: '',
        open: false,
        guestOpen: false,
      });
      listeners.clear();
    },
  };
}
export type AuthForms = ReturnType<typeof createAuthForms>;
