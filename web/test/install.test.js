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
  assert.equal(elements.whatsappSupport.href, 'https://wa.me/51999999999?text=Hola%20%26%20ayuda');
  assert.match(decodeURIComponent(elements.recoverySupportLink.href), /olvidé mi contraseña/);
  assert.equal(elements.recoverySupportLink.hidden, false);
  assert.equal(elements.recoverySupportPending.hidden, true);
  const missing = setup().elements;
  assert.equal(missing.recoverySupportLink.hidden, true);
  assert.equal(missing.recoverySupportPending.hidden, false);
  assert.equal(setup({ support: { whatsapp: 'javascript:alert(1)' } }).elements.whatsappSupport.href, undefined);
});
test('iOS muestra ayuda y modo standalone indica app instalada', async () => {
  const { elements } = setup({ ios: true });
  await elements.installHelpButton.click();
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
  assert.equal(elements.instalarApp.disabled, true);
  events.appinstalled();
  assert.equal(elements.instalarApp.textContent, 'App instalada');
  assert.equal(elements.instalarApp.disabled, true);
});
test('error al abrir instalación permite reintentar sin abrir instrucciones manuales', async () => {
  const { elements, events } = setup();
  events.beforeinstallprompt({ preventDefault() {}, async prompt() { throw new Error('unavailable'); } });
  await elements.instalarApp.click();
  assert.equal(elements.installHelp.hidden, true);
  assert.match(elements.installStatus.textContent, /Recarga/);
  assert.equal(elements.instalarApp.disabled, true);
});
test('aceptar instalación evita solicitudes duplicadas hasta confirmación', async () => {
  const { elements, events } = setup();
  let calls = 0;
  events.beforeinstallprompt({ preventDefault() {}, async prompt() { calls++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  await elements.instalarApp.click();
  await elements.instalarApp.click();
  assert.equal(calls, 1);
  assert.equal(elements.instalarApp.disabled, true);
  assert.equal(elements.instalarApp.textContent, 'Instalación solicitada');
  events.appinstalled();
  assert.equal(elements.instalarApp.textContent, 'App instalada');
});
test('acceso rápido abre la instalación en un toque y se oculta al instalar', async () => {
  const { elements, events } = setup();
  assert.equal(elements.installQuick.hidden, true);
  let calls = 0;
  events.beforeinstallprompt({ preventDefault() {}, async prompt() { calls++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert.equal(elements.installQuick.hidden, false);
  await elements.instalarDirecto.click();
  assert.equal(calls, 1);
  assert.equal(elements.installQuick.hidden, true);
  events.appinstalled();
  assert.equal(elements.instalarDirecto.disabled, true);
});
test('manifiesto usa los iconos del timbre con dimensiones PNG correctas', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.short_name, 'Manuel Scorza');
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\/icons\/timbre-mono-/);
    const png = readFileSync(new URL(`../public${icon.src}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

test('instalar solo abre la confirmación nativa, sin instrucciones manuales', async () => {
  const { elements, events } = setup();
  assert.equal(elements.instalarApp.disabled, true);
  await elements.instalarApp.click();
  assert.equal(elements.installHelp.hidden, true);
  let calls = 0;
  events.beforeinstallprompt({ preventDefault() {}, async prompt() { calls++; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  assert.equal(elements.instalarApp.disabled, false);
  await elements.instalarApp.click();
  assert.equal(calls, 1);
  assert.equal(elements.installHelp.hidden, true);
  events.beforeinstallprompt({ preventDefault() {}, async prompt() { calls++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert.equal(elements.instalarApp.disabled, false);
  await elements.instalarApp.click();
  assert.equal(calls, 2);
});
