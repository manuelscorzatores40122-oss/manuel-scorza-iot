import test from 'node:test';
import assert from 'node:assert/strict';
import { dayTimeline } from '../src/dayTimeline.js';
const alarm = (hora, dias = 2, activa = true) => ({ id: hora, hora, dias, activa, nombre: 'Clase' });

test('la línea usa hora y día de Perú aunque sea martes en UTC', () => {
  const day = dayTimeline([alarm('23:30'), alarm('23:45', 4), alarm('10:00', 2, false)], Date.parse('2026-11-17T04:30:00Z'));
  assert.equal(day.day, 1);
  assert.equal(day.clock, '23:30:00');
  assert.deepEqual(day.alarmas.map(a => a.hora), ['23:30']);
  assert.equal(day.ticks.at(-1).label, '24:00');
});
test('jornada estándar de 07 a 18 con escala proporcional y segundos', () => {
  const day = dayTimeline([], Date.parse('2026-11-16T14:30:30Z'));
  assert.equal(day.clock, '09:30:30');
  assert.deepEqual(day.ticks.map(t => t.label), ['07:00', '10:00', '13:00', '16:00', '18:00']);
  assert.ok(Math.abs(day.position - 150.5 / 660 * 100) < .001);
});
test('los horarios tempranos amplían la escala y el indicador no sale de la línea', () => {
  const early = dayTimeline([alarm('05:30')], Date.parse('2026-11-16T09:00:00Z'));
  assert.equal(early.ticks[0].label, '05:00');
  assert.equal(early.position, 0);
  assert.match(early.outside, /Antes/);
  const late = dayTimeline([], Date.parse('2026-11-17T03:00:00Z'));
  assert.equal(late.position, 100);
  assert.match(late.outside, /Después/);
});
test('el cambio de día elimina los timbres de ayer', () => {
  const alarmas = [alarm('23:00'), alarm('07:00', 4)];
  assert.equal(dayTimeline(alarmas, Date.parse('2026-11-17T04:59:59Z')).alarmas[0].hora, '23:00');
  assert.equal(dayTimeline(alarmas, Date.parse('2026-11-17T05:00:00Z')).alarmas[0].hora, '07:00');
});
