import { sfuCancelled, sfuError } from './sfu-protocol.ts';

/** Gathering keeps the existing soft deadline; connection failure is an error.
 * Abort always removes listeners/timers immediately, even while HTTP/WS is pending.
 */
export function waitForPeer(
  peer: RTCPeerConnection,
  phase: 'gather' | 'connect',
  timeout: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const events =
      phase === 'gather'
        ? ['icegatheringstatechange']
        : ['connectionstatechange', 'iceconnectionstatechange'];
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const event of events) peer.removeEventListener(event, check);
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(sfuCancelled());
    const check = () => {
      if (phase === 'gather') {
        if (peer.iceGatheringState === 'complete') finish();
      } else if (
        peer.connectionState === 'connected' ||
        ['connected', 'completed'].includes(peer.iceConnectionState)
      )
        finish();
      else if (peer.connectionState === 'failed' || peer.iceConnectionState === 'failed')
        finish(sfuError('SFU_CONNECT_TIMEOUT'));
    };
    const timer = setTimeout(
      () => finish(phase === 'connect' ? sfuError('SFU_CONNECT_TIMEOUT') : undefined),
      timeout,
    );
    for (const event of events) peer.addEventListener(event, check);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else check();
  });
}
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(sfuCancelled());
    if (signal.aborted) reject(sfuCancelled());
    else signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
