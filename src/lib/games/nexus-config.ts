import settings from '../../../electron/nexus-config.cjs';

export interface NexusConfig {
  readonly pageUrl: string;
  readonly embedUrl: string;
  readonly pvpUrl: string;
  isEmbedURL(value: string): boolean;
}

export const nexusConfig: NexusConfig = settings.nexusConfig;
export const { pageUrl, embedUrl, pvpUrl, isEmbedURL } = nexusConfig;

declare global {
  interface Window {
    TronoNexusConfig?: Partial<NexusConfig>;
  }
}

if (typeof window !== 'undefined' && !window.TronoNexusConfig) {
  window.TronoNexusConfig = nexusConfig;
}

export default nexusConfig;
