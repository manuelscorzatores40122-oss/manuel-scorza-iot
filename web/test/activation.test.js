import test from 'node:test';
import assert from 'node:assert/strict';
import { activationTracker } from '../src/activation.js';
const state = { online: true, encendido: false, ahora: 1000 };
test('confirma una alarma corta ya terminada sin repetir la vibración', () => {
 const track = activationTracker();
 assert.equal(track(state), false);
 const event = { ...state, ultimaActivacion: { id: 'abc', hora: 995 } };
 assert.equal(track(event), true);
 assert.equal(track(event), false);
 assert.equal(track({ ...event, online: false }), false);
 assert.equal(track(event), false);
 assert.equal(track({ ...event, ultimaActivacion: { id: 'def', hora: 998 } }), true);
});
test('no avisa por eventos antiguos ni por el historial al abrir la app', () => {
 const track = activationTracker();
 assert.equal(track({ ...state, ultimaActivacion: { id: 'a', hora: 999 } }), false);
 assert.equal(track({ ...state, ultimaActivacion: { id: 'b', hora: 800 } }), false);
});
test('firmware anterior: confirma la transición real, no una orden pendiente', () => {
 const track = activationTracker();
 assert.equal(track(state), false);
 assert.equal(track({ ...state, ordenPendiente: true }), false);
 assert.equal(track({ ...state, encendido: true }), true);
 assert.equal(track({ ...state, encendido: true }), false);
 assert.equal(track(state), false);
 assert.equal(track({ ...state, encendido: true }), true);
});
