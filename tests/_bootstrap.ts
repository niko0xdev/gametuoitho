// Shared bootstrap: sets up a temp SQLite database, registers handlers,
// and returns a fresh Express app for in-process testing.
//
// Tests should call bootstrap() at module load time. Subsequent tests
// share the same process-level singleton db (one DB per test run).

import fs from 'node:fs';
import http from 'node:http';

// Set DB_FILE BEFORE any server module imports so the SQLite singleton points at a temp file.
const tmpFile = `${process.env.TMPDIR ?? '/tmp'}/gt-${process.pid}-${Math.random().toString(36).slice(2)}.db`;
process.env.DB_FILE = tmpFile;
// Make sure no JSON migration file interferes
process.env.DB_FILE_JSON = '/tmp/__nonexistent_legacy_seed__.json';
// Tell server.ts to skip listen() so test runner can exit cleanly.
process.env.NODE_ENV = 'test';

// OpenAI handlers are env-driven; tests can stub these by setting env before import.
if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = 'test-key';
if (!process.env.OPENAI_MODEL) process.env.OPENAI_MODEL = 'gpt-4o-mini';

process.on('exit', () => {
  try { fs.unlinkSync(tmpFile); } catch {}
});

// Use dynamic import to ensure env vars are set BEFORE the linked server.ts runs.
await import('../server.ts');
import { afterAll } from 'vitest';

// Close the shared HTTP server after all tests in this file complete so the worker can exit.
afterAll(async () => {
  await closeServer();
});

let httpServer: http.Server | null = null;
let serverClosingPromise: Promise<void> | null = null;

function closeServer(): Promise<void> {
  if (!httpServer) return Promise.resolve();
  if (serverClosingPromise) return serverClosingPromise;
  serverClosingPromise = new Promise<void>((resolve) => {
    if (!httpServer) { resolve(); return; }
    const s = httpServer;
    s.close(() => resolve());
    s.unref?.();
    // Force close any keep-alive connections
    setImmediate(() => {
      try { s.closeAllConnections?.(); } catch {}
    });
  });
  return serverClosingPromise;
}

process.on('exit', () => {
  if (httpServer) {
    try { httpServer.close(); } catch {}
  }
});

export function getApp(): any {
  const app = (globalThis as any).__gametuoithoApp;
  if (!app) {
    throw new Error('app not initialized — server.ts did not run startServer()');
  }
  return app;
}

// Helper: build a real http.Server bound to a random port.
function startServerOnce(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    if (httpServer) {
      const addr = httpServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server: httpServer, port });
      return;
    }
    const server = http.createServer(getApp());
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      httpServer = server;
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

export interface TestResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
}

export function request(app: any): {
  get: (url: string, headersOrBody?: any, headers?: Record<string, string>) => Promise<TestResponse>;
  post: (url: string, body?: any, headers?: Record<string, string>) => Promise<TestResponse>;
  put: (url: string, body?: any, headers?: Record<string, string>) => Promise<TestResponse>;
  delete: (url: string, headersOrBody?: any, headers?: Record<string, string>) => Promise<TestResponse>;
} {
  async function run(method: string, url: string, body?: any, headers: Record<string, string> = {}) {
    const { port } = await startServerOnce();
    return await new Promise<TestResponse>((resolve, reject) => {
      const u = new URL(url, `http://127.0.0.1:${port}`);
      const finalHeaders: Record<string, string> = { ...headers };
      // Only set content-type for non-GET/DELETE with body
      if (body !== undefined && body !== null && method !== 'GET' && method !== 'DELETE') {
        finalHeaders['content-type'] = finalHeaders['content-type'] || 'application/json';
      }
      const opts: any = {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: finalHeaders,
      };
      const req = http.request(opts, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const bodyStr = Buffer.concat(chunks).toString('utf-8');
          let parsed: any = bodyStr;
          const ct = res.headers['content-type'] || '';
          if (ct.includes('json') && bodyStr) {
            try { parsed = JSON.parse(bodyStr); } catch {}
          }
          resolve({
            status: res.statusCode || 0,
            body: parsed,
            headers: res.headers as Record<string, string>,
          });
        });
      });
      req.on('error', reject);
      if (body !== undefined && body !== null && method !== 'GET' && method !== 'DELETE') {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }
  return {
    get: (url, _ignored, headers) => run('GET', url, undefined, headers),
    post: (url, body, headers) => run('POST', url, body ?? {}, headers),
    put: (url, body, headers) => run('PUT', url, body ?? {}, headers),
    delete: (url, _ignored, headers) => run('DELETE', url, undefined, headers),
  };
}