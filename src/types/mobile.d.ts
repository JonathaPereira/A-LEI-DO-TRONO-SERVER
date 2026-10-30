import type { AndroidHost } from '../lib/mobile/android';
declare global {
  interface Window {
    TronoAndroid?: AndroidHost;
  }
}
