// Alta en la newsletter de Kapeís a través de la API de Mailrelay.
// Variables de entorno en Netlify:
//   MAILRELAY_ACCOUNT   p. ej. kapeis.ipzmarketing.com
//   MAILRELAY_API_KEY   clave de la API (Mailrelay → Configuración → Claves API)
//   MAILRELAY_GROUP_ID  (opcional) id del grupo; si falta, se busca el grupo por nombre
//   MAILRELAY_GROUP_NAME (opcional) por defecto "Newsletter Kapeís"
//   MAILRELAY_SEND_CONFIRMATION (opcional) "no" para no pedir el correo de confirmación aparte

const json = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let cachedGroupId = null;

async function api(path, options = {}) {
  const res = await fetch(`https://${process.env.MAILRELAY_ACCOUNT}/api/v1${path}`, {
    ...options,
    headers: { 'X-AUTH-TOKEN': process.env.MAILRELAY_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function groupId() {
  if (process.env.MAILRELAY_GROUP_ID) return Number(process.env.MAILRELAY_GROUP_ID);
  if (cachedGroupId) return cachedGroupId;
  const name = (process.env.MAILRELAY_GROUP_NAME || 'Newsletter Kapeís').trim().toLowerCase();
  const r = await api('/groups?per_page=100');
  const list = Array.isArray(r.data) ? r.data : (r.data && r.data.data) || [];
  const g = list.find((x) => String(x.name || '').trim().toLowerCase() === name);
  cachedGroupId = g ? g.id : null;
  return cachedGroupId;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, mensaje: 'Método no permitido.' });
  if (!process.env.MAILRELAY_ACCOUNT || !process.env.MAILRELAY_API_KEY) {
    return json(500, { ok: false, mensaje: 'La newsletter aún no está configurada. Escríbenos a info@kapeis.es.' });
  }

  let body = {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    body = (event.headers['content-type'] || '').includes('application/json') ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw));
  } catch (e) { return json(400, { ok: false, mensaje: 'No hemos entendido el envío.' }); }

  const wantsHtml = !(event.headers['content-type'] || '').includes('application/json');
  const reply = (status, payload) => wantsHtml
    ? { statusCode: 303, headers: { Location: payload.ok ? '/suscripcion/' : '/suscripcion/?error=1' } }
    : json(status, payload);

  if (body.web) return reply(200, { ok: true, mensaje: '¡Hecho!' }); // campo trampa para robots
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return reply(400, { ok: false, mensaje: 'Revisa el email, parece que no está bien escrito.' });
  if (!(body.acepto === true || body.acepto === 'on' || body.acepto === 'true')) return reply(400, { ok: false, mensaje: 'Para suscribirte tienes que aceptar la política de privacidad.' });

  try {
    const gid = await groupId();
    const payload = { email, status: 'inactive' };
    if (gid) payload.group_ids = [gid];
    const r = await api('/subscribers/sync', { method: 'POST', body: JSON.stringify(payload) });
    if (!r.ok) {
      console.log('Mailrelay sync', r.status, JSON.stringify(r.data).slice(0, 500));
      return reply(502, { ok: false, mensaje: 'No hemos podido apuntarte ahora mismo. Inténtalo de nuevo en un rato.' });
    }
    const sub = (r.data && (r.data.id ? r.data : r.data.data)) || {};
    if (sub.id && sub.status !== 'active' && process.env.MAILRELAY_SEND_CONFIRMATION !== 'no') {
      const c = await api(`/subscribers/${sub.id}/resend_confirmation_email`, { method: 'POST' });
      if (!c.ok) console.log('Mailrelay confirmación', c.status, JSON.stringify(c.data).slice(0, 300));
    }
    if (!gid) console.log('Aviso: no se encontró el grupo de la newsletter; el suscriptor se ha creado sin grupo.');
    return reply(200, { ok: true, mensaje: sub.status === 'active' ? '¡Ya estabas suscrita o suscrito! Gracias.' : '¡Casi está! Revisa tu correo y confirma la suscripción.' });
  } catch (e) {
    console.log('Error newsletter', e && e.message);
    return reply(500, { ok: false, mensaje: 'No hemos podido apuntarte ahora mismo. Inténtalo de nuevo en un rato.' });
  }
};
