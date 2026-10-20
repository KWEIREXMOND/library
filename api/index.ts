/**
 * Vercel serverless entry point.
 *
 * Every `/api/*` request is rewritten here (see vercel.json) and handed to the
 * same Express app the traditional server uses. The app is imported lazily so a
 * cold start only pays for the modules the first request actually needs, and we
 * wait for the shared `ready` promise before serving — schema, settings and the
 * hosted account bootstrap all happen exactly once per instance.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

type ExpressApp = (req: IncomingMessage, res: ServerResponse) => void;
type ServerModule = { app: ExpressApp; ready?: Promise<void> };

let loaded: Promise<ServerModule> | null = null;

function loadServer(): Promise<ServerModule> {
  loaded ??= import('../dist-server/index.js').then((mod) => {
    const server = mod as unknown as ServerModule;
    if (typeof server.app !== 'function') {
      throw new Error('The built server did not export an Express app.');
    }
    return server;
  });
  return loaded;
}

export const config = { maxDuration: 60 };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const server = await loadServer();
  if (server.ready) await server.ready;
  server.app(req, res);
}
