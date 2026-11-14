import test from 'node:test';
import assert from 'node:assert/strict';
import { leerJson } from '../src/apiResponse.js';

test('acepta una respuesta JSON de la API', async () => {
  assert.deepEqual(await leerJson(Response.json({ ok: true })), { ok: true });
});

test('explica cuando el servidor devuelve HTML en lugar de JSON', async () => {
  const response = new Response('<!DOCTYPE html><html></html>', { headers: { 'Content-Type': 'text/html' } });
  await assert.rejects(leerJson(response), /API.*\/api/);
});

test('explica un JSON malformado', async () => {
  const response = new Response('<!DOCTYPE html>', { headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(leerJson(response), /JSON inválida/);
});
