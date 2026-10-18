import type { createVoiceTelemetry } from './telemetry';
import type { createCallQuality } from './quality';
import type { DiagnosticsSource } from './diagnostics-presentation';
import {
  connectionHealth,
  infrastructurePresentation,
  diagnosticPresentation,
  playbackPresentation,
} from './diagnostics-presentation.ts';

interface DiagnosticsOptions {
  read(): DiagnosticsSource;
  telemetry: Pick<ReturnType<typeof createVoiceTelemetry>, 'start' | 'collect'>;
  quality: Pick<ReturnType<typeof createCallQuality>, 'configure' | 'applyAll'>;
  report(): string;
  copy(report: string): Promise<unknown>;
  onOpen(open: boolean): void;
  onQualityChanged(): void;
  warn?(error: unknown): void;
}

/** Owns diagnostic UI state only. Collection, adaptation and media stay with their owners. */
export function createConnectionDiagnostics(options: DiagnosticsOptions) {
  const listeners = new Set<() => void>();
  const warn = options.warn ?? ((error: unknown) => console.warn('[ConnectionDiagnostics]', error));
  let open = false,
    copying = false,
    copyStatus = '',
    disposed = false;
  let generation: number | undefined,
    copyRevision = 0;
  let details: ReturnType<typeof diagnosticPresentation> | undefined;
  function read() {
    const source = options.read();
    if (generation !== undefined && source.generation !== generation) {
      copyRevision++;
      copying = false;
      copyStatus = '';
      details = undefined;
    }
    generation = source.generation;
    if (!details || (open && source.foreground)) details = diagnosticPresentation(source);
    return Object.freeze({
      open,
      copying,
      copyStatus,
      details,
      health: Object.freeze(connectionHealth(source)),
      infrastructure: infrastructurePresentation(source),
      mode: source.mode,
      adaptiveEnabled: source.quality.preferences.adaptiveEnabled,
      adaptation: source.quality.adaptation.level
        ? `Vídeo reduzido temporariamente: ${source.quality.adaptation.reason}. Retorno gradual após 60 segundos estáveis.`
        : 'Qualidade escolhida preservada; reduções temporárias quando necessário.',
    });
  }
  let snapshot: ReturnType<typeof read> | undefined;
  const getSnapshot = () => (snapshot ??= read());
  function refresh() {
    if (disposed) return;
    snapshot = read();
    for (const listener of listeners) listener();
  }
  return {
    getSnapshot,
    refresh,
    playback: () => playbackPresentation(options.read()),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    toggle(force?: boolean) {
      if (disposed) return;
      const next = typeof force === 'boolean' ? force : !open;
      if (next === open) return;
      open = next;
      refresh();
      options.onOpen(open);
      options.telemetry.start(); // The collector retains its foreground/background cadence.
    },
    async setAdaptive(enabled: boolean) {
      if (disposed || options.read().quality.preferences.adaptiveEnabled === enabled) return;
      try {
        options.quality.configure({ adaptiveEnabled: enabled });
        refresh();
        await options.quality.applyAll();
      } catch (error) {
        warn(error);
      } finally {
        if (!disposed) {
          options.onQualityChanged();
          refresh();
        }
      }
    },
    async copy() {
      if (disposed) return;
      refresh();
      if (copying) return;
      const revision = ++copyRevision,
        call = generation;
      const current = () =>
        !disposed && revision === copyRevision && options.read().generation === call;
      copying = true;
      copyStatus = '';
      refresh();
      try {
        await options.telemetry.collect();
        if (!current()) return;
        await options.copy(options.report());
        if (current()) copyStatus = 'Copiado. Não contém nomes, mensagens, IPs ou credenciais.';
      } catch {
        if (current())
          copyStatus = 'Não foi possível copiar. Permita o acesso à área de transferência.';
      } finally {
        if (!disposed && revision === copyRevision) {
          copying = false;
          refresh();
        }
      }
    },
    dispose() {
      disposed = true;
      copyRevision++;
      listeners.clear();
    },
  };
}
export type ConnectionDiagnostics = ReturnType<typeof createConnectionDiagnostics>;
