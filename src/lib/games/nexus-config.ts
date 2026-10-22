// Public URLs only. Never put Supabase keys or account tokens here.
export const pageUrl = 'https://semchakra10.itch.io/nexus-mn';
// Paste ONLY the src of the playable "Embed game" iframe here.
// Leave empty to launch the official itch.io page in a new tab/window.
const rawEmbedUrl = 'https://itch.io/embed-upload/19926871?color=333333';

export function isEmbedURL(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      ((url.hostname === 'itch.io' && /^\/embed-upload\/\d+\/?$/.test(url.pathname)) ||
        (url.hostname === 'html-classic.itch.zone' &&
          /^\/html\/\d+\/index\.html$/.test(url.pathname)))
    );
  } catch {
    return false;
  }
}

export const embedUrl = isEmbedURL(rawEmbedUrl) ? rawEmbedUrl : '';
export const pvpUrl = 'wss://nexus-pvp.onrender.com/pvp';

export interface NexusConfig {
  readonly pageUrl: string;
  readonly embedUrl: string;
  readonly pvpUrl: string;
  isEmbedURL(value: string): boolean;
}

export const nexusConfig: NexusConfig = Object.freeze({
  pageUrl,
  embedUrl,
  pvpUrl,
  isEmbedURL,
});

declare global {
  interface Window {
    TronoNexusConfig?: Partial<NexusConfig>;
  }
}

if (typeof window !== 'undefined' && !window.TronoNexusConfig) {
  window.TronoNexusConfig = nexusConfig;
}

export default nexusConfig;
