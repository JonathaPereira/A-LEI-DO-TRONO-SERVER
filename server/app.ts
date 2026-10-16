import type { Express } from 'express';
import type { Server } from 'node:http';
import type { WebSocketServer } from 'ws';

const { createRuntime } = require('./runtime.cjs') as {
  createRuntime: () => BackendApplication;
};

export interface BackendApplication {
  app: Express;
  server: Server;
  wss: WebSocketServer;
  /** Idempotent: releases listeners, timers, sockets and service resources. */
  close(): Promise<void>;
}

/** Create an isolated backend without opening a port or installing process listeners. */
function createApplication(): BackendApplication {
  return createRuntime();
}

module.exports = { createApplication };
