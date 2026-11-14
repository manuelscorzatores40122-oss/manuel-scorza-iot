import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import config from '../vite.config.js';

let middleware;
config({ mode: 'test' }).plugins[0].configureServer({
  config: { root: '/tmp' },
  middlewares: { use(fn) { middleware = fn; } }
});

async function request(url, method = 'GET', headers = {}) {
  const req = Object.assign(Readable.from([]), { url, method, headers });
  const res = { setHeader() {}, end(body) { this.body = body; this.writableEnded = true; } };
  await middleware(req, res, () => { res.next = true; });
  return res;
}

test('Vite entrega la API en lugar del HTML de la interfaz', async () => {
  for (const url of ['/api/estado', '/api/control?action=estado']) {
    const res = await request(url);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body, 'Inicia sesión para continuar');
  }
  const res = await request('/api/encender', 'POST', { 'x-timbre-request': '1' });
  assert.equal(res.statusCode, 401);
  assert.equal((await request('/api/desconocida')).statusCode, 404);
  assert.equal((await request('/')).next, true);
});
