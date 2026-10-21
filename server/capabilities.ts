import { throneRules } from '../src/lib/games/throne-rules.ts';
/** Shared protocol advertisement. Availability and authorization remain domain decisions. */
export const serverFeatures = Object.freeze({
  loveLetter: true,
  splendor: true,
  azul: true,
  soundboardRestart: true,
  voiceProfileActivity: true,
  independentGameVoice: true,
  gameRulesVersion: throneRules.version,
  socialMessaging: true,
  chatModeration: true,
  channelNotifications: true,
});
export const socketFeatures = Object.freeze({
  ...serverFeatures,
  gameActivity: true,
  independentTextChannels: true,
  guestGame: true,
  voiceEvents: true,
  presence: true,
  roles: true,
  managedChannels: true,
  soundboard: true,
  screenFps: true,
});
