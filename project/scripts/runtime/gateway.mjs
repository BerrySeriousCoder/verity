import { createServer, request as proxyRequest } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest();
export function createGateway({
  username,
  password,
  publicOrigin,
  apiPort,
  webPort,
  healthy = () => true,
}) {
  if (!username || username.includes(':') || !password || password.length < 16)
    throw new Error(
      'Set APP_USERNAME and APP_PASSWORD (at least 16 characters).',
    );
  const expected = digest(
    `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  );
  const origin = new URL(publicOrigin);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error(
      'PUBLIC_ORIGIN must be an HTTP(S) origin without a path or credentials.',
    );
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    // Railway healthchecks have their own Host and must not require login.
    if (request.url === '/healthz' && request.method === 'GET') {
      try {
        if (!healthy()) throw new Error('Child process unavailable');
        const checks = await Promise.all([
          fetch(`http://127.0.0.1:${apiPort}/api/health`, {
            signal: AbortSignal.timeout(3000),
          }),
          fetch(`http://127.0.0.1:${webPort}/`, {
            signal: AbortSignal.timeout(3000),
          }),
        ]);
        const ok = checks.every((result) => result.ok);
        await Promise.all(checks.map((result) => result.body?.cancel()));
        response.writeHead(ok ? 200 : 503, {
          'Content-Type': 'application/json',
        });
        response.end(JSON.stringify({ status: ok ? 'ok' : 'unavailable' }));
      } catch {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end('{"status":"unavailable"}');
      }
      return;
    }
    if (request.headers.host !== origin.host) {
      response.writeHead(403);
      response.end('Unrecognized host.');
      return;
    }
    if (
      !timingSafeEqual(digest(request.headers.authorization ?? ''), expected)
    ) {
      response.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="Verity", charset="UTF-8"',
      });
      response.end('Sign in to your Verity workspace.');
      return;
    }
    if (
      !['GET', 'HEAD'].includes(request.method ?? '') &&
      (request.headers['sec-fetch-site'] === 'cross-site' ||
        (request.headers.origin && request.headers.origin !== origin.origin))
    ) {
      response.writeHead(403);
      response.end('Request origin is not allowed.');
      return;
    }
    // Both backends bind only to loopback; authentication cannot be bypassed via
    // another exposed container port. SSE and uploads are piped without buffering.
    const port = request.url?.startsWith('/api/') ? apiPort : webPort;
    const headers = { ...request.headers, host: `127.0.0.1:${port}` };
    for (const name of [
      'authorization',
      'proxy-authorization',
      'forwarded',
      'x-forwarded-host',
      'x-forwarded-proto',
      'x-forwarded-for',
      'connection',
      'upgrade',
    ])
      delete headers[name];
    const upstream = proxyRequest(
      {
        hostname: '127.0.0.1',
        port,
        method: request.method,
        path: request.url,
        headers,
      },
      (incoming) => {
        response.writeHead(incoming.statusCode ?? 502, {
          ...incoming.headers,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        });
        incoming.pipe(response);
        incoming.on('error', () => response.destroy());
      },
    );
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502);
      response.end('Service temporarily unavailable.');
    });
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 60_000;
  return server;
}
