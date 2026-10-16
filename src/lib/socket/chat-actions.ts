/** Transitional commands: the existing upload controller still owns attachments. */
interface ChatController {
  sendChat(): Promise<void>;
}

export async function sendChatMessage(): Promise<void> {
  const runtime = window as Window & { TronoSocial?: ChatController };
  if (!runtime.TronoSocial) return;
  await runtime.TronoSocial.sendChat();
}
