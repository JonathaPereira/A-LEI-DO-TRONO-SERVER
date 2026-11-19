/** Public auth errors are localized here; provider messages and credentials stay private. */
export const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export function authError(code: string, message: string, status = 400) {
  return Object.assign(new Error(message), { code, status });
}
export const policyMessage =
  'Use pelo menos 8 caracteres, com letra minúscula, maiúscula, número e símbolo.';
export const authUnavailable = () =>
  authError('AUTH_UNAVAILABLE', 'Não foi possível acessar sua conta agora. Tente novamente.', 503);
export function providerError(path: string, status: number, value: unknown): never {
  const data = object(value) ? value : {};
  const code =
    typeof data.error_code === 'string'
      ? data.error_code
      : typeof data.code === 'string'
        ? data.code
        : '';
  const message = typeof data.message === 'string' ? data.message : '';
  if (code === 'email_not_confirmed')
    throw authError('EMAIL_NOT_CONFIRMED', 'Confirme seu e-mail antes de entrar.', 403);
  if (status === 429 || code.includes('rate_limit'))
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
    throw authError('SIGNUP_DISABLED', 'Novos cadastros estão temporariamente indisponíveis.', 403);
  if (path.includes('/rpc/social_')) {
    const reasons: Record<string, readonly [number, string]> = {
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
    const reason = Object.keys(reasons).find((k) => message.includes(k));
    if (reason) throw authError(reason, reasons[reason][1], reasons[reason][0]);
    throw authError(
      'SOCIAL_UNAVAILABLE',
      'Amigos e conversas indisponíveis. Confira a migração upgrade-social.sql.',
      503,
    );
  }
  if (path.includes('/rpc/community_')) {
    const reasons: Record<string, readonly [number, string]> = {
      FORBIDDEN: [403, 'Você não tem permissão para realizar essa operação.'],
      INVALID_ROLE: [400, 'Escolha Admin ou Membro.'],
      CREATOR_PROTECTED: [403, 'O cargo de criador é vinculado ao e-mail confirmado.'],
      MEMBER_NOT_FOUND: [404, 'Conta confirmada não encontrada.'],
      INVALID_CHANNEL: [400, 'Canal inválido. Use texto ou voz e um nome de 2 a 40 caracteres.'],
      CHANNEL_LIMIT: [409, 'Limite de 50 canais atingido.'],
      CHANNEL_NOT_FOUND: [404, 'Canal não encontrado.'],
    };
    const reason = Object.keys(reasons).find((k) => message.includes(k));
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
    const messages: Record<string, string> = {
      FORBIDDEN: 'Apenas o criador pode ver os e-mails.',
      AUTH_REQUIRED: 'Entre novamente na sua conta.',
      HANDLE_TAKEN: 'Esse @usuário já está em uso.',
      NICKNAME_TAKEN: 'Esse nome já está em uso.',
      INVALID_PROFILE: 'Confira os campos do perfil.',
      INVALID_PROFILE_MEDIA: 'Escolha imagens enviadas pela sua conta.',
    };
    const reason = Object.keys(messages).find((k) => message.includes(k));
    throw authError(
      reason || 'PROFILE_UNAVAILABLE',
      (reason ? messages[reason] : undefined) ||
        'Perfil indisponível. Confira a atualização do servidor.',
      reason === 'FORBIDDEN' ? 403 : reason ? 400 : 503,
    );
  }
  if (path.includes('/rpc/update_chat_profile')) {
    const messages: Record<string, string> = {
      NICKNAME_TAKEN: 'Esse apelido já está em uso. Escolha outro.',
      INVALID_NICKNAME: 'Use um apelido de 2 a 20 caracteres.',
      INVALID_AVATAR: 'Selecione um ícone ou envie uma foto válida.',
    };
    const reason = Object.keys(messages).find((k) => message.includes(k));
    throw authError(
      reason || 'PROFILE_UPDATE_FAILED',
      (reason ? messages[reason] : undefined) ||
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
  if (status >= 500)
    throw authError(
      'AUTH_UNAVAILABLE',
      'O acesso às contas está temporariamente indisponível.',
      503,
    );
  throw authError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos, ou sessão expirada.', 401);
}
