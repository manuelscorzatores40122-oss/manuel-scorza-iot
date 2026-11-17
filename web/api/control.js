import { createService, HttpError } from '../lib/service.js';
const service = createService();
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const action = req.query.action;
    const method = action === 'estado' ? 'GET' : 'POST';
    if (!['estado', 'login', 'logout', 'programar', 'encender', 'apagar', 'sync', 'cambiar-clave'].includes(action)) throw new HttpError(404, 'No encontrado');
    if (req.method !== method) { res.setHeader('Allow', method); throw new HttpError(405, 'Método no permitido'); }
    // Cabecera propia + ausencia de CORS impiden formularios enviados desde otro sitio.
    if (method === 'POST' && action !== 'sync' && req.headers['x-timbre-request'] !== '1') throw new HttpError(403, 'Solicitud no permitida');
    const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body || {});
    if (action === 'sync') {
      const payload = await service.sync(body, req.headers.authorization);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(payload);
    }
    if (action === 'login') {
      const token = await service.login(body, req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
      res.setHeader('Set-Cookie', `timbre_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
      return res.status(200).json({ ok: true });
    }
    const token = await service.session(req.headers.cookie);
    if (action === 'cambiar-clave') {
      const result = await service.changePassword(body, token);
      res.setHeader('Set-Cookie', 'timbre_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
      return res.status(200).json(result);
    }
    if (action === 'logout') {
      await service.logout(token);
      res.setHeader('Set-Cookie', 'timbre_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
      return res.status(200).json({ ok: true });
    }
    const result = action === 'estado' ? await service.state() : action === 'programar' ? await service.program(body) : await service.command(action === 'encender' ? 1 : 2, body);
    return res.status(200).json(result);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 503;
    return res.status(status).send(error instanceof HttpError ? error.message : 'Servicio temporalmente no disponible');
  }
}
