'use strict';
const { accountRole, permissions } = require('./roles');
const { cleanProfile } = require('./profile-customization.ts');

// Supabase keeps password hashes and recovery tokens. The application never stores passwords.
const SYMBOLS = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~';
function passwordChecks(password) {
  const p = typeof password === 'string' ? password : '';
  return {
    length: [...p].length >= 8,
    lowercase: /[a-z]/.test(p),
    uppercase: /[A-Z]/.test(p),
    number: /[0-9]/.test(p),
    symbol: [...p].some((c) => SYMBOLS.includes(c)),
  };
}
function validPassword(password) {
  return (
    Object.values(passwordChecks(password)).every(Boolean) &&
    Buffer.byteLength(password, 'utf8') <= 72
  );
}
function validNickname(name) {
  return typeof name === 'string' && /^[\p{L}\p{N} _.-]{2,20}$/u.test(name) && name === name.trim();
}
function authError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
const policyMessage =
  'Use pelo menos 8 caracteres, com letra minúscula, maiúscula, número e símbolo.';
function createAuth({
  env = process.env,
  fetchImpl = globalThis.fetch,
  onRevoke = () => {},
  onProfileChange = () => {},
} = {}) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '');
  let site = null,
    origin = null;
  try {
    site = new URL(env.APP_URL);
    origin = site.origin;
  } catch {}
  const configured =
    Boolean(/^https:\/\/[^/]+$/.test(url) && key && site?.protocol === 'https:') ||
    Boolean(
      env.AUTH_TEST_LOCAL === 'true' &&
      /^http:\/\/127\.0\.0\.1:\d+$/.test(url) &&
      key &&
      site?.hostname === '127.0.0.1',
    );
  const required = env.AUTH_REQUIRED !== 'false'; // Default is closed. false is only for deliberate legacy rollout/tests.
  const allowedOrigins = new Set(
    [
      origin,
      ...String(env.AUTH_ALLOWED_ORIGINS || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ].filter(Boolean),
  );
  const rates = new Map();
  const rateCleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rates) if (v.until <= now) rates.delete(k);
  }, 60_000);
  rateCleanup.unref();
  const health = () => ({ required, configured });
  function assertConfigured() {
    if (!configured)
      throw authError(
        'AUTH_UNAVAILABLE',
        'O acesso às contas está temporariamente indisponível. Tente novamente mais tarde.',
        503,
      );
  }
  function limit(req, kind, max = 10) {
    const now = Date.now(),
      keys = [`${kind}:ip:${req.ip || req.socket.remoteAddress}`];
    if (['signup', 'recover'].includes(kind))
      keys.push(
        `${kind}:email:${String(req.body?.email || '')
          .trim()
          .toLowerCase()}`,
      );
    for (const k of keys) {
      let r = rates.get(k);
      if (!r || r.until <= now) {
        r = { count: 0, until: now + 60_000 };
        rates.set(k, r);
      }
      r.count++;
      if (r.count > max)
        throw authError(
          'AUTH_RATE_LIMIT',
          'Muitas tentativas. Aguarde um minuto antes de tentar novamente.',
          429,
        );
    }
  }
  async function upstream(path, { method = 'GET', body, token } = {}) {
    assertConfigured();
    let response;
    try {
      response = await fetchImpl(`${url}${path}`, {
        method,
        headers: {
          apikey: key,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw authError(
        'AUTH_UNAVAILABLE',
        'Não foi possível acessar sua conta agora. Tente novamente.',
        503,
      );
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = data.error_code || data.code || '';
      if (code === 'email_not_confirmed')
        throw authError('EMAIL_NOT_CONFIRMED', 'Confirme seu e-mail antes de entrar.', 403);
      if (response.status === 429 || code.includes('rate_limit'))
        throw authError(
          'AUTH_RATE_LIMIT',
          'Muitas tentativas. Aguarde antes de tentar novamente.',
          429,
        );
      if (code === 'weak_password') throw authError('WEAK_PASSWORD', policyMessage);
      if (code === 'user_already_exists' || code === 'email_exists')
        throw authError(
          'SIGNUP_FAILED',
          'Não foi possível concluir o cadastro. Tente entrar ou recuperar sua senha.',
        );
      if (code === 'signup_disabled')
        throw authError(
          'SIGNUP_DISABLED',
          'Novos cadastros estão temporariamente indisponíveis.',
          403,
        );
      if (path.includes('/rpc/social_')) {
        const reasons = {
          AUTH_REQUIRED: [401, 'Entre novamente na sua conta.'],
          FORBIDDEN: [403, 'Esta conversa é privada.'],
          FRIEND_REQUIRED: [403, 'Adicione esta pessoa aos amigos antes de enviar mensagens.'],
          INVALID_TARGET: [400, 'Conta confirmada não encontrada.'],
          INVALID_MESSAGE: [400, 'Mensagem inválida.'],
          INVALID_ATTACHMENT: [400, 'Esse anexo não está disponível nesta conversa.'],
          INVALID_CURSOR: [400, 'Página de mensagens inválida.'],
          INVALID_ACTION: [400, 'Ação inválida.'],
          REQUEST_NOT_FOUND: [404, 'Esse pedido não está mais disponível.'],
          CHANNEL_NOT_FOUND: [404, 'Esse canal não existe mais.'],
        };
        const reason = Object.keys(reasons).find((k) => String(data.message || '').includes(k));
        if (reason) throw authError(reason, reasons[reason][1], reasons[reason][0]);
        throw authError(
          'SOCIAL_UNAVAILABLE',
          'Amigos e conversas indisponíveis. Confira a migração upgrade-social.sql.',
          503,
        );
      }
      if (path.includes('/rpc/community_')) {
        const reasons = {
          FORBIDDEN: [403, 'Você não tem permissão para realizar essa operação.'],
          INVALID_ROLE: [400, 'Escolha Admin ou Membro.'],
          CREATOR_PROTECTED: [403, 'O cargo de criador é vinculado ao e-mail confirmado.'],
          MEMBER_NOT_FOUND: [404, 'Conta confirmada não encontrada.'],
          INVALID_CHANNEL: [
            400,
            'Canal inválido. Use texto ou voz e um nome de 2 a 40 caracteres.',
          ],
          CHANNEL_LIMIT: [409, 'Limite de 50 canais atingido.'],
          CHANNEL_NOT_FOUND: [404, 'Canal não encontrado.'],
        };
        const reason = Object.keys(reasons).find((k) => String(data.message || '').includes(k));
        if (reason) throw authError(reason, reasons[reason][1], reasons[reason][0]);
        throw authError(
          'COMMUNITY_UNAVAILABLE',
          'Comunidade indisponível. Confira a atualização SQL.',
          503,
        );
      }
      if (
        path.includes('/rpc/save_member_profile') ||
        path.includes('/rpc/read_member_profile') ||
        path.includes('/rpc/creator_registered_accounts')
      ) {
        const messages = {
          FORBIDDEN: 'Apenas o criador pode ver os e-mails.',
          AUTH_REQUIRED: 'Entre novamente na sua conta.',
          HANDLE_TAKEN: 'Esse @usuário já está em uso.',
          NICKNAME_TAKEN: 'Esse nome já está em uso.',
          INVALID_PROFILE: 'Confira os campos do perfil.',
          INVALID_PROFILE_MEDIA: 'Escolha imagens enviadas pela sua conta.',
        };
        const reason = Object.keys(messages).find((k) => String(data.message || '').includes(k));
        throw authError(
          reason || 'PROFILE_UNAVAILABLE',
          messages[reason] || 'Perfil indisponível. Confira a atualização do servidor.',
          reason === 'FORBIDDEN' ? 403 : reason ? 400 : 503,
        );
      }
      if (path.includes('/rpc/update_chat_profile')) {
        const messages = {
          NICKNAME_TAKEN: 'Esse apelido já está em uso. Escolha outro.',
          INVALID_NICKNAME: 'Use um apelido de 2 a 20 caracteres.',
          INVALID_AVATAR: 'Selecione um ícone ou envie uma foto válida.',
        };
        const reason = Object.keys(messages).find((k) => String(data.message || '').includes(k));
        throw authError(
          reason || 'PROFILE_UPDATE_FAILED',
          messages[reason] ||
            'Não foi possível salvar. Confira se a atualização SQL foi executada.',
          reason === 'NICKNAME_TAKEN' ? 409 : 400,
        );
      }
      if (path.includes('/verify'))
        throw authError(
          'RECOVERY_INVALID',
          'Este link expirou ou já foi utilizado. Solicite outro link.',
          401,
        );
      if (path.includes('/signup'))
        throw authError(
          'SIGNUP_FAILED',
          'Não foi possível concluir o cadastro. Confira os dados ou tente outro apelido.',
        );
      if (path.includes('/recover'))
        throw authError(
          'EMAIL_UNAVAILABLE',
          'Não foi possível enviar o e-mail agora. Tente novamente mais tarde.',
          503,
        );
      if (response.status >= 500)
        throw authError(
          'AUTH_UNAVAILABLE',
          'O acesso às contas está temporariamente indisponível.',
          503,
        );
      throw authError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos, ou sessão expirada.', 401);
    }
    return data;
  }
  function tokenFrom(req) {
    const m = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
    if (!m) throw authError('AUTH_REQUIRED', 'Entre na sua conta para continuar.', 401);
    return m[1];
  }
  async function identity(token) {
    if (typeof token !== 'string' || token.length > 12_000)
      throw authError('AUTH_REQUIRED', 'Entre na sua conta para continuar.', 401);
    // The hosted Auth service validates the token. Never trust a locally decoded JWT for identity.
    const user = await upstream('/auth/v1/user', { token });
    if (!user.id || user.is_anonymous || !user.email_confirmed_at)
      throw authError('EMAIL_NOT_CONFIRMED', 'Confirme seu e-mail antes de entrar.', 403);
    const rows = await upstream(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=*`, {
      token,
    });
    const profile = Array.isArray(rows) ? rows.find((p) => p.id === user.id) : null;
    if (!profile || !validNickname(profile.nickname))
      throw authError(
        'PROFILE_UNAVAILABLE',
        'Não foi possível carregar seu perfil. Tente novamente mais tarde.',
        503,
      );
    let exp, sessionId;
    try {
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
      exp = claims.exp;
      sessionId = claims.session_id;
    } catch {}
    if (!Number.isFinite(exp) || exp * 1000 <= Date.now())
      throw authError('AUTH_EXPIRED', 'Sua sessão expirou. Entre novamente.', 401);
    return {
      id: user.id,
      nickname: profile.nickname,
      email: user.email,
      role: accountRole(user, profile),
      avatar_preset: profile.avatar_preset || 'crown',
      avatar_file_id: profile.avatar_file_id || null,
      expiresAt: exp * 1000,
      sessionId,
    };
  }
  async function sessionPayload(data) {
    if (!data.access_token || !data.refresh_token)
      throw authError('AUTH_UNAVAILABLE', 'Não foi possível iniciar a sessão.', 503);
    const user = await identity(data.access_token);
    return {
      session: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(user.expiresAt / 1000),
      },
      user: publicAccount(user),
    };
  }
  function publicAccount(user) {
    return {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      role: user.role,
      permissions: permissions(user.role),
      avatar_preset: user.avatar_preset,
      avatar_file_id: user.avatar_file_id,
    };
  }
  function emailFrom(body) {
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    if (email.length > 254 || !/^\S+@[^\s@]+\.[^\s@]+$/.test(email))
      throw authError('INVALID_EMAIL', 'Informe um e-mail válido.');
    return email;
  }
  function requirePassword(body) {
    if (typeof body?.password !== 'string' || !validPassword(body.password))
      throw authError(
        'WEAK_PASSWORD',
        Buffer.byteLength(String(body?.password || ''), 'utf8') > 72
          ? 'A senha deve ter no máximo 72 bytes. Evite uma senha tão longa.'
          : policyMessage,
      );
    return body.password;
  }
  function install(app, express) {
    app.use(
      '/auth',
      (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        res.set('Referrer-Policy', 'no-referrer');
        res.set('X-Content-Type-Options', 'nosniff');
        const requestOrigin = req.headers.origin;
        if (requestOrigin && !allowedOrigins.has(requestOrigin))
          return res
            .status(403)
            .json({ error: { code: 'ORIGIN_FORBIDDEN', message: 'Origem não autorizada.' } });
        if (requestOrigin) {
          res.set('Access-Control-Allow-Origin', requestOrigin);
          res.vary('Origin');
          res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        }
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
      },
      express.json({ limit: '16kb' }),
    );
    function route(method, path, fn, kind, max = 10) {
      app[method](`/auth/${path}`, async (req, res) => {
        try {
          assertConfigured();
          limit(req, kind || path, max);
          res.json(await fn(req));
        } catch (err) {
          res.status(err.status || 503).json({
            error: {
              code: err.code || 'AUTH_UNAVAILABLE',
              message: err.status ? err.message : 'Não foi possível acessar sua conta agora.',
            },
          });
        }
      });
    }
    route(
      'post',
      'signup',
      async (req) => {
        const email = emailFrom(req.body),
          password = requirePassword(req.body),
          nickname = String(req.body.nickname || '')
            .trim()
            .normalize('NFKC');
        if (!validNickname(nickname))
          throw authError(
            'INVALID_NICKNAME',
            'Use um apelido de 2 a 20 caracteres: letras, números, espaço, ponto, hífen ou sublinhado.',
          );
        // Supabase confirmation remains required; no admin/service_role credential is used here.
        const data = await upstream(
          `/auth/v1/signup?redirect_to=${encodeURIComponent(site.href)}`,
          { method: 'POST', body: { email, password, data: { nickname } } },
        );
        if (data.access_token)
          throw authError(
            'EMAIL_CONFIRMATION_REQUIRED',
            'Confirmação de e-mail precisa estar habilitada para concluir o acesso.',
            503,
          );
        return {
          message:
            'Confira seu e-mail para confirmar o cadastro. Se já tiver uma conta, entre ou recupere sua senha.',
        };
      },
      'signup',
      5,
    );
    route('post', 'login', async (req) => {
      const email = emailFrom(req.body);
      if (
        typeof req.body.password !== 'string' ||
        !req.body.password ||
        req.body.password.length > 1024
      )
        throw authError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.', 401);
      return sessionPayload(
        await upstream('/auth/v1/token?grant_type=password', {
          method: 'POST',
          body: { email, password: req.body.password },
        }),
      );
    });
    route(
      'post',
      'refresh',
      async (req) => {
        if (typeof req.body.refresh_token !== 'string' || req.body.refresh_token.length > 12_000)
          throw authError('AUTH_REQUIRED', 'Entre novamente na sua conta.', 401);
        return sessionPayload(
          await upstream('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            body: { refresh_token: req.body.refresh_token },
          }),
        );
      },
      'refresh',
      30,
    );
    route(
      'post',
      'recover',
      async (req) => {
        const email = emailFrom(req.body),
          redirect = new URL(site.href);
        redirect.searchParams.set('auth', 'recovery');
        try {
          await upstream(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirect.href)}`, {
            method: 'POST',
            body: { email },
          });
        } catch (e) {
          if (e.status !== 401 && e.code !== 'INVALID_CREDENTIALS') throw e;
        }
        return {
          message:
            'Se existir uma conta com esse e-mail, você receberá um link para criar uma nova senha.',
        };
      },
      'recover',
      5,
    );
    route('post', 'verify', async (req) => {
      const { token_hash, type } = req.body;
      if (
        typeof token_hash !== 'string' ||
        !token_hash ||
        token_hash.length > 512 ||
        !['recovery', 'signup', 'email'].includes(type)
      )
        throw authError('RECOVERY_INVALID', 'Link inválido. Solicite um novo e-mail.', 401);
      const data = await upstream('/auth/v1/verify', {
        method: 'POST',
        body: { token_hash, type },
      });
      if (type === 'recovery') {
        if (!data.access_token)
          throw authError('RECOVERY_INVALID', 'Este link expirou. Solicite outro link.', 401);
        return { recovery_token: data.access_token };
      }
      // Confirming a registration does not automatically keep a login session.
      if (data.access_token)
        await upstream('/auth/v1/logout?scope=local', {
          method: 'POST',
          token: data.access_token,
        }).catch(() => {});
      return { message: 'E-mail confirmado. Entre com sua senha.' };
    });
    route(
      'post',
      'reset',
      async (req) => {
        const password = requirePassword(req.body),
          token = tokenFrom(req),
          account = await identity(token);
        await upstream('/auth/v1/user', { method: 'PUT', token, body: { password } });
        onRevoke({ userId: account.id, all: true });
        await upstream('/auth/v1/logout?scope=global', { method: 'POST', token });
        return { message: 'Senha atualizada. Entre novamente com a nova senha.' };
      },
      'reset',
      5,
    );
    route(
      'get',
      'me',
      async (req) => ({ user: publicAccount(await identity(tokenFrom(req))) }),
      'me',
      60,
    );
    route(
      'post',
      'profile',
      async (req) => {
        const token = tokenFrom(req),
          account = await identity(token),
          nickname = String(req.body.nickname || '')
            .trim()
            .normalize('NFKC');
        if (!validNickname(nickname))
          throw authError(
            'INVALID_NICKNAME',
            'Use um apelido de 2 a 20 caracteres: letras, números, espaço, ponto, hífen ou sublinhado.',
          );
        const preset = String(req.body.avatar_preset || 'crown'),
          file = req.body.avatar_file_id || null;
        if (file && !/^[0-9a-f-]{36}$/i.test(file))
          throw authError('INVALID_AVATAR', 'Foto inválida.');
        if (req.body.personalization !== undefined)
          await upstream('/rest/v1/rpc/save_member_profile', {
            method: 'POST',
            token,
            body: {
              p_nickname: nickname,
              p_preset: preset,
              p_file: file,
              p_data: cleanProfile(req.body.personalization),
            },
          });
        else
          await upstream('/rest/v1/rpc/update_chat_profile', {
            method: 'POST',
            token,
            body: { p_nickname: nickname, p_preset: preset, p_file: file },
          });
        const user = await identity(token);
        onProfileChange(user);
        return { user: publicAccount(user) };
      },
      'profile',
      15,
    );
    route('post', 'logout', async (req) => {
      const token = tokenFrom(req),
        account = await identity(token);
      await upstream('/auth/v1/logout?scope=local', { method: 'POST', token });
      onRevoke({ userId: account.id, sessionId: account.sessionId, all: !account.sessionId });
      return { ok: true };
    });
    app.use('/auth', (err, req, res, next) => {
      if (!err) return next();
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Dados inválidos.' } });
    });
  }
  return {
    required,
    configured,
    health,
    identity,
    install,
    allowedOrigins,
    tokenFrom,
    request: (token, path, method = 'GET', body) => upstream(path, { token, method, body }),
  };
}
module.exports = {
  createAuth,
  passwordChecks,
  validPassword,
  validNickname,
  policyMessage,
  authError,
};
