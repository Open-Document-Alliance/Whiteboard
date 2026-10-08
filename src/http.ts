import express from 'express';
import { localhostHostValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import path from 'node:path';
import { createServer } from './server.js';
import type { BoardStore } from './store.js';

export function createHttpApp(store: BoardStore, options: { distDir: string; publicOrigin: string; previewOrigin?: string }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(localhostHostValidation());
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && ![options.publicOrigin, options.previewOrigin].includes(origin)) { res.status(403).json({ error: 'Origin not allowed' }); return; }
    next();
  });
  app.use(express.json({ limit: '3mb' }));
  app.get('/health', (_req, res) => res.json({ name: 'Whiteboard', status: 'ok', version: '0.1.0' }));
  app.all('/mcp', async (req, res) => {
    const server = createServer(store, options);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Whiteboard request failed' } }); }
  });
  app.get('/', async (_req, res, next) => {
    try {
      const { readFile } = await import('node:fs/promises');
      res.type('html').send((await readFile(path.join(options.distDir, 'index.html'), 'utf8')).replaceAll('__WHITEBOARD_ORIGIN__', options.publicOrigin));
    } catch (error) { next(error); }
  });
  app.use(express.static(options.distDir));
  return app;
}
