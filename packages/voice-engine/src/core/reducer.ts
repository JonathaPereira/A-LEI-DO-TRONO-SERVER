import type { VoiceEngineEvent } from '../protocol/events.ts';
import type { VoiceEngineSnapshot } from '../protocol/types.ts';
import type { VoiceEngineTransitionResult } from './state.ts';
import { reduceCamera } from './reducers/camera.ts';
import { reduceConnection } from './reducers/connection.ts';
import { reduceMicrophone } from './reducers/microphone.ts';
import { reduceRemoteTrackSubscription } from './reducers/remoteTrackSubscription.ts';
import { reduceRoom } from './reducers/room.ts';
import { reduceScreen } from './reducers/screen.ts';
import { reduceScreenAudio } from './reducers/screenAudio.ts';

/** Pure deterministic transition function for the entire voice-engine state machine. */
export function transitionVoiceEngine(
  snapshot: VoiceEngineSnapshot,
  event: VoiceEngineEvent,
): VoiceEngineTransitionResult {
  if (event.type.startsWith('connection/')) {
    return reduceConnection(
      snapshot,
      event as Extract<VoiceEngineEvent, { type: `connection/${string}` }>,
    );
  }
  if (event.type.startsWith('room/')) {
    return reduceRoom(snapshot, event as Extract<VoiceEngineEvent, { type: `room/${string}` }>);
  }
  if (event.type.startsWith('microphone/')) {
    return reduceMicrophone(
      snapshot,
      event as Extract<VoiceEngineEvent, { type: `microphone/${string}` }>,
    );
  }
  if (event.type.startsWith('camera/')) {
    return reduceCamera(snapshot, event as Extract<VoiceEngineEvent, { type: `camera/${string}` }>);
  }
  if (event.type.startsWith('screen/')) {
    return reduceScreen(snapshot, event as Extract<VoiceEngineEvent, { type: `screen/${string}` }>);
  }
  if (event.type.startsWith('screenAudio/')) {
    return reduceScreenAudio(
      snapshot,
      event as Extract<VoiceEngineEvent, { type: `screenAudio/${string}` }>,
    );
  }
  if (event.type.startsWith('subscription/')) {
    return reduceRemoteTrackSubscription(
      snapshot,
      event as Extract<VoiceEngineEvent, { type: `subscription/${string}` }>,
    );
  }

  return { snapshot, commands: [] };
}
