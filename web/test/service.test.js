import test from 'node:test';
import assert from 'node:assert/strict';
import { createService, configFrom, validarAlarmas } from '../lib/service.js';
function fixture() {
  let now = 1800000000;
  const values = new Map(), expires = new Map();
  const db = async (cmd, ...args) => {
    for (const [k, until] of expires) if (until <= now) { values.delete(k); expires.delete(k); }
    switch (cmd) {
      case 'GET': return values.get(args[0]) ?? null;
      case 'MGET': return args.map(k => values.get(k) ?? null);
      case 'SET': values.set(args[0], args[1]); if (args[2] === 'EX') expires.set(args[0], now + args[3]); return 'OK';
      case 'DEL': return values.delete(args[0]);
      case 'INCR': { const n = Number(values.get(args[0]) || 0) + 1; values.set(args[0], n); return n; }
      case 'EXPIRE': expires.set(args[0], now + args[1]); return 1;
      case 'EVAL': {
        if (args[0].includes('compare-and-set schedule')) {
          const [, , k, expected, next] = args;
          const current = values.get(k);
          if ((current ? JSON.parse(current).revision : '-') !== expected) return 0;
          values.set(k, next); return 1;
        }
        const [, , configKey, telemetryKey, commandKey, config, telemetry] = args;
        if (!values.has(configKey)) values.set(configKey, config);
        values.set(telemetryKey, telemetry);
        return [values.get(configKey), values.get(commandKey) ?? null];
      }
      default: throw new Error(cmd);
    }
  };
  const env = { ADMIN_USER: 'admin', ADMIN_PASSWORD: '123456', DEVICE_TOKEN: 'a'.repeat(64) };
  return { service: createService(db, env, () => now), advance: s => now += s, auth: `Bearer ${env.DEVICE_TOKEN}` };
}
const config = { hora: '04:00', activo: '1', dias: '62', duracion: '10' };
const report = { ...config, revision: '-', ack: '-', reloj: '08:39:00', encendido: '0', restante: '0', proxima: '1800069660' };
test('validación estricta de hora, días y duración', () => {
  assert.equal(configFrom(config).dias, 62);
  for (const change of [{ hora: '24:00' }, { dias: '0' }, { dias: '2.5' }, { duracion: '0' }, { duracion: 'abc' }, { activo: 'true' }]) assert.throws(() => configFrom({ ...config, ...change }), { status: 400 });
});
test('login, sesión revocable, caducidad y límite de intentos', async () => {
  const { service: s, advance } = fixture();
  await assert.rejects(s.session(), { status: 401 });
  await assert.rejects(s.login({ usuario: 'admin', clave: 'bad' }, 'ip'), { status: 401 });
  const token = await s.login({ usuario: 'admin', clave: '123456' }, 'ip');
  assert.equal(await s.session(`other=1; timbre_session=${token}`), token);
  await s.logout(token); await assert.rejects(s.session(`timbre_session=${token}`), { status: 401 });
  const t = await s.login({ usuario: 'admin', clave: '123456' }, 'ip'); advance(43201);
  await assert.rejects(s.session(`timbre_session=${t}`), { status: 401 });
  for (let i = 0; i < 10; i++) await assert.rejects(s.login({}, 'attacker'), { status: 401 });
  await assert.rejects(s.login({}, 'attacker'), { status: 429 });
});
test('registro inicial, confirmación y configuración web no sobreescrita por placa', async () => {
  const { service: s, auth } = fixture();
  await assert.rejects(s.sync(report, 'wrong'), { status: 401 });
  const response = (await s.sync(report, auth)).trim().split(' ');
  assert.equal(response[2], '240'); assert.equal((await s.state()).pendiente, true);
  await s.sync({ ...report, revision: response[1] }, auth);
  assert.equal((await s.state()).pendiente, false);
  const updated = await s.program({ ...config, hora: '06:30' });
  const sync = (await s.sync({ ...report, revision: response[1] }, auth)).split(' ');
  assert.equal(sync[2], '390'); assert.equal(sync[1], updated.revision);
});
test('órdenes: rechazo offline, reintento, confirmación y vencimiento', async () => {
  const { service: s, auth, advance } = fixture();
  await assert.rejects(s.command(1), { status: 409 });
  await s.sync(report, auth); await s.command(1);
  const first = (await s.sync(report, auth)).trim().split(' ');
  const retry = (await s.sync(report, auth)).trim().split(' ');
  assert.equal(first[7], '1'); assert.equal(first[6], retry[6]);
  const ack = (await s.sync({ ...report, ack: first[6] }, auth)).trim().split(' ');
  assert.equal(ack[7], '0'); assert.equal((await s.state()).ordenPendiente, false);
  await s.command(2); advance(31);
  assert.equal((await s.sync(report, auth)).trim().split(' ')[7], '0');
  advance(36); assert.equal((await s.state()).online, false);
});
test('guardar antes de conectar no pierde la configuración y estado antiguo no indica sonando', async () => {
  const { service: s, auth, advance } = fixture();
  const saved = await s.program({ ...config, hora: '12:00' });
  const result = (await s.sync({ ...report, encendido: '1', restante: '3' }, auth)).split(' ');
  assert.equal(result[1], saved.revision); assert.equal(result[2], '720');
  assert.equal((await s.state()).encendido, true);
  advance(4); assert.equal((await s.state()).encendido, false);
});

const bells = [
  { id: '00000001', nombre: 'Entrada', hora: '07:30', dias: 62, duracion: 5, activa: true },
  { id: '00000002', nombre: 'Recreo', hora: '10:15', dias: 62, duracion: 8, activa: true },
  { id: '00000003', nombre: 'Salida viernes', hora: '13:00', dias: 32, duracion: 10, activa: true }
];
test('varios horarios: limites, duplicados y coincidencias por dia', () => {
  assert.equal(validarAlarmas(bells).length, 3);
  assert.throws(() => validarAlarmas([...bells, bells[0]]), {status:400});
  assert.throws(() => validarAlarmas([{...bells[0], nombre:''}]), {status:400});
  assert.throws(() => validarAlarmas([{...bells[0], hora:'7:60'}]), {status:400});
  assert.throws(() => validarAlarmas([bells[0], {...bells[1], hora:'07:30'}]), {status:400});
  assert.equal(validarAlarmas([bells[0], {...bells[1], hora:'07:30', dias:1}]).length, 2);
  assert.equal(validarAlarmas([]).length, 0);
  assert.throws(() => validarAlarmas(Array(33).fill(bells[0])), {status:400});
});
test('migracion sin perder alarma anterior y protocolo compatible con firmware v1', async () => {
  const {service:s, auth} = fixture();
  await s.sync(report, auth);
  const old = await s.state();
  assert.equal(old.alarmas[0].hora, '04:00');
  const saved = await s.program({alarmas:JSON.stringify(bells), revision:old.revision});
  assert.equal(saved.alarmas.length, 3); assert.equal(saved.pendiente, true);
  const legacy = (await s.sync(report, auth)).split(' ');
  assert.equal(legacy[1], old.revision); assert.equal(legacy[2], '240');
  assert.equal((await s.state()).requiereActualizacion, true);
  const v2 = await s.sync({...report, proto:'2'}, auth);
  assert.match(v2, /^v2 [a-f0-9]{32} 3 10 - 0 0/);
  assert.match(v2, /00000002 615 1 62 8/);
  await s.sync({...report, proto:'2', revision:saved.revision}, auth);
  assert.equal((await s.state()).pendiente, false);
  assert.equal((await s.state()).requiereActualizacion, false);
});
test('ediciones concurrentes y borrar todos los horarios', async () => {
  const {service:s, auth} = fixture();
  const saved = await s.program({alarmas:JSON.stringify(bells), revision:'-'});
  await assert.rejects(s.program({alarmas:'[]', revision:'-'}), {status:409});
  await assert.rejects(s.program(config), {status:409});
  const cleared = await s.program({alarmas:'[]', revision:saved.revision});
  assert.equal(cleared.alarmas.length, 0);
  const v2 = await s.sync({...report, proto:'2'}, auth);
  assert.match(v2, /^v2 [a-f0-9]{32} 0 10 - 0 0\n$/);
});
