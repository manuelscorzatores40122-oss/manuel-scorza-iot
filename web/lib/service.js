import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const digest = value => createHash('sha256').update(String(value)).digest('hex');
const same = (a, b) => timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const id = () => randomBytes(16).toString('hex');
const key = name => `timbre:v1:${name}`;
export function configFrom(body) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.hora || '')) throw new HttpError(400, 'Hora inválida');
  const dias = Number(body.dias), duracion = Number(body.duracion);
  if (!['0', '1'].includes(String(body.activo))) throw new HttpError(400, 'Activación inválida');
  const programacionActiva = String(body.activo) === '1';
  if (!Number.isInteger(dias) || dias < 0 || dias > 127 || (programacionActiva && !dias)) throw new HttpError(400, 'Selecciona al menos un día');
  if (!Number.isInteger(duracion) || duracion < 1 || duracion > 3600) throw new HttpError(400, 'Duración inválida (1–3600 s)');
  return { horaProgramada: body.hora, dias, duracion, programacionActiva };
}
export const MAX_ALARMAS = 32;
export function alarmasDe(config) {
  if (Array.isArray(config?.alarmas)) return config.alarmas;
  if (!config) return [];
  return [{ id: '00000001', nombre: 'Timbre existente', hora: config.horaProgramada,
    dias: config.dias, duracion: config.duracion, activa: config.programacionActiva }];
}
export function validarAlarmas(value) {
  let list;
  try { list = typeof value === 'string' ? JSON.parse(value) : value; } catch { throw new HttpError(400, 'Horarios inválidos'); }
  if (!Array.isArray(list) || list.length > MAX_ALARMAS) throw new HttpError(400, 'Puedes guardar hasta 32 horarios');
  const ids = new Set();
  const result = list.map(a => {
    if (!a || !/^[a-f0-9]{8}$/.test(a.id || '') || a.id === '00000000' || ids.has(a.id)) throw new HttpError(400, 'Identificador de horario inválido');
    ids.add(a.id);
    if (typeof a.nombre !== 'string' || !a.nombre.trim() || a.nombre.trim().length > 40) throw new HttpError(400, 'Escribe un nombre de hasta 40 caracteres');
    if (typeof a.activa !== 'boolean') throw new HttpError(400, 'Activación inválida');
    const c = configFrom({ hora: a.hora, dias: a.dias, duracion: a.duracion, activo: a.activa ? '1' : '0' });
    return { id: a.id, nombre: a.nombre.trim(), hora: c.horaProgramada, dias: c.dias, duracion: c.duracion, activa: c.programacionActiva };
  });
  for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
    const a = result[i], b = result[j];
    if (a.activa && b.activa && a.hora === b.hora && (a.dias & b.dias)) throw new HttpError(400, 'Dos timbres activos coinciden a la misma hora y día');
  }
  return result.sort((a,b) => a.hora.localeCompare(b.hora) || a.id.localeCompare(b.id));
}
export async function redis(...command) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url?.startsWith('https://') || !token) throw new HttpError(503, 'Falta conectar Redis en Vercel');
  const response = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command), signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new HttpError(503, 'Almacenamiento no disponible');
  const data = await response.json();
  if (data.error) throw new HttpError(503, 'Almacenamiento no disponible');
  return data.result;
}
const parse = value => value ? JSON.parse(value) : null;
const CONFIG_CAS = `-- compare-and-set schedule
local old=redis.call('GET',KEYS[1])
local rev='-'
if old then rev=cjson.decode(old).revision end
if rev~=ARGV[1] then return 0 end
redis.call('SET',KEYS[1],ARGV[2])
return 1`;
export function createService(db = redis, env = process.env, clock = () => Math.floor(Date.now() / 1000)) {
  async function session(cookie = '') {
    const token = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('timbre_session='))?.slice(15);
    if (!token || !/^[a-f0-9]{64}$/.test(token) || !await db('GET', key(`session:${digest(token)}`))) throw new HttpError(401, 'Inicia sesión para continuar');
    return token;
  }
  async function state() {
    const [c, t, cmd] = (await db('MGET', key('config'), key('telemetry'), key('command'))).map(parse);
    const ahora = clock(), online = !!t && ahora - t.seen <= 35;
    const config = c || { horaProgramada: '18:00', programacionActiva: false, dias: 127, duracion: 10 };
    return { ...config, alarmas: alarmasDe(c), maxAlarmas: MAX_ALARMAS, firmwareVersion: t?.proto || 1, requiereActualizacion: !!t && t.proto !== 2, ahora, online, configurado: !!c,
      encendido: online && !!t.encendido && t.restante > ahora - t.seen,
      restante: online ? Math.max(0, t.restante - (ahora - t.seen)) : 0,
      hora: online ? t.hora : 'Sin conexión',
      proxima: online && t.revision === c?.revision ? t.proxima : 0,
      pendiente: !!c && (t?.revision !== c.revision || (Array.isArray(c.alarmas) && t?.proto !== 2)),
      ordenPendiente: !!cmd && cmd.expires > ahora && t?.ack !== cmd.id,
      ultimaConexion: t?.seen || 0
    };
  }
  return {
    session, state,
    async login(body, ip) {
      if (!env.ADMIN_PASSWORD) throw new HttpError(503, 'Falta configurar ADMIN_PASSWORD');
      const bucket = key(`login:${digest(ip)}:${Math.floor(clock() / 600)}`);
      const attempts = await db('INCR', bucket);
      if (attempts === 1) await db('EXPIRE', bucket, 660);
      if (attempts > 10) throw new HttpError(429, 'Demasiados intentos. Espera 10 minutos.');
      if (!same(body.usuario || '', env.ADMIN_USER || 'admin') || !same(body.clave || '', env.ADMIN_PASSWORD)) throw new HttpError(401, 'Usuario o contraseña incorrectos');
      const token = randomBytes(32).toString('hex');
      await db('SET', key(`session:${digest(token)}`), '1', 'EX', 43200);
      return token;
    },
    async logout(token) { await db('DEL', key(`session:${digest(token)}`)); },
    async program(body) {
      if (body.alarmas !== undefined) {
        const alarmas = validarAlarmas(body.alarmas);
        const current = parse(await db('GET', key('config')));
        const expected = current?.revision || '-';
        if (body.revision !== expected) throw new HttpError(409, 'Los horarios cambiaron. Cierra el editor y vuelve a intentarlo.');
        // Conservar la programacion del firmware antiguo hasta actualizar la placa.
        const legacy = current || { horaProgramada: '18:00', programacionActiva: false, dias: 62, duracion: 10 };
        const next = { ...legacy, alarmas, schema: 2, legacyRevision: current?.legacyRevision || current?.revision || id(), revision: id() };

        if (!await db('EVAL', CONFIG_CAS, 1, key('config'), expected, JSON.stringify(next))) throw new HttpError(409, 'Los horarios cambiaron. Recarga antes de guardar.');
      } else {
        const current = parse(await db('GET', key('config')));
        if (current?.alarmas) throw new HttpError(409, 'Actualiza la página para editar los horarios escolares');
        const next = { ...configFrom(body), revision: id() };
        if (!await db('EVAL', CONFIG_CAS, 1, key('config'), current?.revision || '-', JSON.stringify(next))) throw new HttpError(409, 'Los horarios cambiaron. Recarga antes de guardar.');
      }
      return state();
    },
    async command(action) {
      const status = await state();
      if (!status.online) throw new HttpError(409, 'El ESP32 está desconectado. No se envió la orden.');
      await db('SET', key('command'), JSON.stringify({ id: id(), action, expires: clock() + 30 }), 'EX', 35);
      return state();
    },
    async sync(body, authorization) {
      if (!env.DEVICE_TOKEN || env.DEVICE_TOKEN.length < 32) throw new HttpError(503, 'Falta configurar DEVICE_TOKEN');
      if (!same(authorization || '', `Bearer ${env.DEVICE_TOKEN}`)) throw new HttpError(401, 'Dispositivo no autorizado');
      const initial = configFrom(body);
      if (!/^(?:[a-f0-9]{32}|-)$/.test(body.revision || '') || !/^(?:[a-f0-9]{32}|-)$/.test(body.ack || '')) throw new HttpError(400, 'Identificador inválido');
      if (!/^\d{2}:\d{2}:\d{2}$/.test(body.reloj || '') || !['0', '1'].includes(String(body.encendido))) throw new HttpError(400, 'Estado inválido');
      const restante = Number(body.restante), proxima = Number(body.proxima);
      if (!Number.isInteger(restante) || restante < 0 || restante > 3600 || !Number.isSafeInteger(proxima) || proxima < 0) throw new HttpError(400, 'Telemetría inválida');
      const telemetry = { proto: body.proto === '2' ? 2 : 1, hora: body.reloj, encendido: body.encendido === '1', restante, proxima, revision: body.revision, ack: body.ack, seen: clock() };
      // Una operación atómica: inicializa sin pisar cambios web y registra la confirmación.
      const script = `redis.call('SET',KEYS[1],ARGV[1],'NX')
redis.call('SET',KEYS[2],ARGV[2])
return {redis.call('GET',KEYS[1]),redis.call('GET',KEYS[3])}`;
      const [config, command] = (await db('EVAL', script, 3, key('config'), key('telemetry'), key('command'), JSON.stringify({ ...initial, revision: id() }), JSON.stringify(telemetry))).map(parse);
      const cmd = command && command.expires > clock() && command.id !== body.ack ? command : null;
      if (body.proto === '2') {
        const alarmas = alarmasDe(config);
        const header = `v2 ${config.revision} ${alarmas.length} ${config.duracion} ${cmd?.id || '-'} ${cmd?.action || 0} ${cmd?.expires || 0}`;
        const rows = alarmas.map(a => {
          const [h, m] = a.hora.split(':').map(Number);
          return `${a.id} ${h * 60 + m} ${a.activa ? 1 : 0} ${a.dias} ${a.duracion}`;
        });
        return [header, ...rows].join('\n') + '\n';
      }
      const [hour, minute] = config.horaProgramada.split(':').map(Number);
      return `v1 ${config.legacyRevision || config.revision} ${hour * 60 + minute} ${config.programacionActiva ? 1 : 0} ${config.dias} ${config.duracion} ${cmd?.id || '-'} ${cmd?.action || 0} ${cmd?.expires || 0}\n`;
    }
  };
}
