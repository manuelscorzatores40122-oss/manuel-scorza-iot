import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const script = readFileSync(new URL('../public/install.js', import.meta.url), 'utf8');
function setup({ support = {}, installed = false, ios = false } = {}) {
  const elements = {}, events = {};
  const document = { getElementById(id) {
    return elements[id] ||= { hidden: true, disabled: false, textContent: '', removeAttribute() {}, addEventListener(name, callback) { this[name] = callback; } };
  }};
  const window = { TIMBRE_SUPPORT: support, matchMedia: () => ({ matches: installed, addEventListener() {} }), addEventListener(name, callback) { events[name] = callback; } };
  vm.runInNewContext(script, { document, window, navigator: { userAgent: ios ? 'iPhone' : 'Chrome', platform: '', maxTouchPoints: 0 }, encodeURIComponent });
  return { elements, events };
}
test('contacto usa solo un número internacional válido y codifica el mensaje', () => {
  const { elements } = setup({ support: { developer: 'Empresa', whatsapp: '51999999999', message: 'Hola & ayuda' } });
  assert.equal(elements.developerName.textContent, 'Empresa');
  assert.equal(elements.whatsappSupport.href, 'https://wa.me/51999999999?text=Hola%20%26%20ayuda');
  assert.equal(setup({ support: { whatsapp: 'javascript:alert(1)' } }).elements.whatsappSupport.href, undefined);
});
test('iOS muestra ayuda y modo standalone indica app instalada', async () => {
  const { elements } = setup({ ios: true });
  await elements.instalarApp.click();
  assert.match(elements.installInstructions.textContent, /Safari/);
  assert.equal(elements.installHelp.hidden, false);
  assert.equal(setup({ installed: true }).elements.instalarApp.disabled, true);
});
test('instalación cancelada permite ayuda y evento de instalación actualiza el estado', async () => {
  const { elements, events } = setup();
  let called = 0;
  events.beforeinstallprompt({ preventDefault() {}, async prompt() { called++; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  assert.equal(elements.instalarApp.textContent, 'Instalar app');
  await elements.instalarApp.click();
  assert.equal(called, 1);
  assert.match(elements.installStatus.textContent, /cancelada/);
  assert.equal(elements.instalarApp.disabled, false);
  events.appinstalled();
  assert.equal(elements.instalarApp.textContent, 'App instalada');
  assert.equal(elements.instalarApp.disabled, true);
});
test('error al abrir instalación ofrece instrucciones', async () => {
  const { elements, events } = setup();
  events.beforeinstallprompt({ preventDefault() {}, async prompt() { throw new Error('unavailable'); } });
  await elements.instalarApp.click();
  assert.equal(elements.installHelp.hidden, false);
  assert.equal(elements.instalarApp.disabled, false);
});
