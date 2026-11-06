interface AttachmentRuntime {
  TronoDesktop?: { openAttachment(options: { url: string }): Promise<unknown> };
  open(url: string, target: string): Window | null;
}

/** Open synchronously on the web to preserve the user's popup gesture. */
export async function openFile(
  resolveURL: () => Promise<string>,
  onError: (message: string) => void,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const runtime = window as unknown as AttachmentRuntime;
  const tab = runtime.TronoDesktop ? null : runtime.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  try {
    const url = await resolveURL();
    if (!isCurrent()) {
      tab?.close();
      return;
    }
    if (runtime.TronoDesktop) await runtime.TronoDesktop.openAttachment({ url });
    else if (tab) tab.location.href = url;
    else onError('Permita abrir a aba para acessar o arquivo.');
  } catch (error) {
    tab?.close();
    onError(error instanceof Error ? error.message : 'Não foi possível abrir o arquivo.');
  }
}
