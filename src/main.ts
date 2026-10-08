import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BoardStore } from './store.js';
import { createServer } from './server.js';
import { createHttpApp } from './http.js';

const port = Number(process.env.PORT ?? 3174);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const publicOrigin = new URL(process.env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`).origin;
const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const store = new BoardStore(path.resolve(process.env.WHITEBOARD_DATA_DIR ?? '.whiteboard'));
if (process.argv.includes('--stdio')) {
  await createServer(store, { distDir, publicOrigin }).connect(new StdioServerTransport());
} else {
  const http = createHttpApp(store, { distDir, publicOrigin, previewOrigin: 'http://127.0.0.1:3175' }).listen(port, '127.0.0.1', () => console.log(`Whiteboard: http://127.0.0.1:${port}/ — MCP: /mcp`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => http.close(() => process.exit(0)));
}
