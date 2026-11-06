import http from 'http';
import app from '../../src/app';

let server: http.Server | null = null;
export const PORT = 5566;
export const BASE_URL = `http://127.0.0.1:${PORT}/api/v1`;

export async function startTestServer(): Promise<http.Server> {
  if (server) return server;
  return new Promise((resolve) => {
    server = app.listen(PORT, () => {
      resolve(server!);
    });
  });
}

export async function stopTestServer(): Promise<void> {
  if (!server) return;
  return new Promise((resolve) => {
    server!.close(() => {
      server = null;
      resolve();
    });
  });
}

export async function apiRequest(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const data = raw ? JSON.parse(raw) : {};
            resolve({ status: res.statusCode || 500, data });
          } catch {
            resolve({ status: res.statusCode || 500, data: raw });
          }
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}
