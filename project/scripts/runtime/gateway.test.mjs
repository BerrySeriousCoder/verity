import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createGateway } from './gateway.mjs';
const listen = async (server) => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};
const close = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });
test('gateway protects API and files, rejects cross-site writes and streams without buffering', async () => {
  let healthy = true,
    lastHeaders;
  const api = createServer((request, response) => {
    lastHeaders = request.headers;
    if (request.url === '/api/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('data: first\n\n');
      return;
    }
    response.end('api');
  });
  const web = createServer((_request, response) => response.end('web'));
  const apiPort = await listen(api),
    webPort = await listen(web);
  const reservation = createServer();
  const port = await listen(reservation);
  await close(reservation);
  const base = `http://127.0.0.1:${port}`;
  const gateway = createGateway({
    username: 'tester',
    password: 'long-demo-password',
    publicOrigin: base,
    apiPort,
    webPort,
    healthy: () => healthy,
  });
  gateway.listen(port, '127.0.0.1');
  await once(gateway, 'listening');
  const headers = {
    authorization: `Basic ${Buffer.from('tester:long-demo-password').toString('base64')}`,
  };
  try {
    assert.equal((await fetch(`${base}/api/workspace`, {})).status, 401);
    assert.equal(
      await new Promise((resolve, reject) => {
        const request = httpRequest(
          `${base}/api/workspace`,
          { headers: { ...headers, host: 'attacker.example' } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.on('error', reject);
        request.end();
      }),
      403,
    );
    assert.equal(
      (await fetch(`${base}/api/workspace`, { headers })).status,
      200,
    );
    assert.equal(lastHeaders.authorization, undefined);
    assert.equal(await (await fetch(base, { headers })).text(), 'web');
    assert.equal(
      (
        await fetch(`${base}/api/write`, {
          method: 'POST',
          headers: { ...headers, origin: 'https://attacker.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/api/write`, {
          method: 'POST',
          headers: { ...headers, origin: base },
        })
      ).status,
      200,
    );
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    healthy = false;
    assert.equal((await fetch(`${base}/healthz`)).status, 503);
    const response = await fetch(`${base}/api/events`, {
      headers,
      signal: AbortSignal.timeout(3000),
    });
    const reader = response.body.getReader();
    assert.equal(
      new TextDecoder().decode((await reader.read()).value),
      'data: first\n\n',
    );
    await reader.cancel();
  } finally {
    await close(gateway);
    await close(api);
    await close(web);
  }
});
test('gateway rejects missing credentials and invalid origins', () => {
  const options = {
    username: 'tester',
    password: 'long-demo-password',
    publicOrigin: 'https://verity.example',
    apiPort: 1,
    webPort: 2,
  };
  assert.throws(
    () => createGateway({ ...options, password: '' }),
    /APP_PASSWORD/,
  );
  assert.throws(
    () =>
      createGateway({
        ...options,
        publicOrigin: 'https://user:pass@verity.example/path',
      }),
    /PUBLIC_ORIGIN/,
  );
});

test('first deployment without a domain starts healthy but never exposes the workspace', async () => {
  let workspaceRequests = 0;
  const api = createServer((request, response) => {
    if (request.url !== '/api/health') workspaceRequests++;
    response.end('ok');
  });
  const web = createServer((_request, response) => response.end('web'));
  const apiPort = await listen(api),
    webPort = await listen(web);
  const gateway = createGateway({
    username: 'tester',
    password: 'long-demo-password',
    publicOrigin: '',
    apiPort,
    webPort,
  });
  const port = await listen(gateway);
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    for (const path of ['/', '/api/workspace']) {
      const response = await fetch(`${base}${path}`, {
        headers: {
          authorization: `Basic ${Buffer.from('tester:long-demo-password').toString('base64')}`,
          'x-forwarded-host': 'pretend.up.railway.app',
        },
      });
      assert.equal(response.status, 503);
      assert.match(await response.text(), /Generate a Railway public domain/);
    }
    assert.equal(workspaceRequests, 0);
  } finally {
    await close(gateway);
    await close(api);
    await close(web);
  }
});
