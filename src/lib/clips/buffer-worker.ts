import { createClipWorkerHandler, type ClipWorkerReply } from './worker-runtime';

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(reply: ClipWorkerReply): void;
}
const scope = globalThis as unknown as WorkerScope;
const receive = createClipWorkerHandler((reply) => scope.postMessage(reply));
scope.onmessage = (event) => receive(event.data);
