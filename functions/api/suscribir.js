// Alta en la newsletter de Kapeís a través de la API de Mailrelay (Cloudflare Pages Function).
// Variables de entorno en Cloudflare Pages (Settings → Variables and Secrets):
//   MAILRELAY_ACCOUNT    p. ej. kapeis.ipzmarketing.com
//   MAILRELAY_API_KEY    clave de la API (Mailrelay → Configuración → Claves API) — guárdala como "Secret"
//   MAILRELAY_GROUP_ID   (opcional) id del grupo; si falta, se busca el grupo por nombre
//   MAILRELAY_GROUP_NAME (opcional) por defecto "Newsletter Kapeís"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
let cachedGroupId = null;

function api(env, path, options = {}) {
  return fetch(`https://${env.MAILRELAY_ACCOUNT}/api/v1${path}`, {
    ...options,
    headers: { 'X-AUTH-TOKEN': env.MAILRELAY_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
  }).then(async (res) => {
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    return { ok: res.ok, status: res.status, data };
  });
}

async function groupId(env) {
  if (env.MAILRELAY_GROUP_ID) return Number(env.MAILRELAY_GROUP_ID);
  if (cachedGroupId) return cachedGroupId;
  const name = (env.MAILRELAY_GROUP_NAME || 'Newsletter Kapeís').trim().toLowerCase();
  const r = await api(env, '/groups?per_page=100');
  const list = Array.isArray(r.data) ? r.data : (r.data && r.data.data) || [];
  const g = list.find((x) => String(x.name || '').trim().toLowerCase() === name);
  cachedGroupId = g ? g.id : null;
  return cachedGroupId;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json(405, { ok: false, mensaje: 'Método no permitido.' });
  if (!env.MAILRELAY_ACCOUNT || !env.MAILRELAY_API_KEY) {
    return json(500, { ok: false, mensaje: 'La newsletter aún no está configurada. Escríbenos a info@kapeis.es.' });
  }

  const ctype = request.headers.get('content-type') || '';
  const wantsHtml = !ctype.includes('application/json');
  const reply = (status, payload) => wantsHtml
    ? new Response(null, { status: 303, headers: { Location: payload.ok ? '/suscripcion/' : '/suscripcion/?error=1' } })
    : json(status, payload);

  let body = {};
  try {
    const raw = await request.text();
    body = ctype.includes('application/json') ? JSON.parse(raw || '{}') : Object.fromEntries(new URLSearchParams(raw));
  } catch (e) { return json(400, { ok: false, mensaje: 'No hemos entendido el envío.' }); }

  if (body.web) return reply(200, { ok: true, mensaje: '¡Hecho!' }); // campo trampa para robots
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return reply(400, { ok: false, mensaje: 'Revisa el email, parece que no está bien escrito.' });
  if (!(body.acepto === true || body.acepto === 'on' || body.acepto === 'true')) return reply(400, { ok: false, mensaje: 'Para suscribirte tienes que aceptar la política de privacidad.' });

  try {
    const gid = await groupId(env);
    // restore_if_deleted: si el email se borró antes en Mailrelay (papelera), se recupera en lugar de dar error.
    const payload = { email, status: 'active', restore_if_deleted: true };
    if (gid) payload.group_ids = [gid];
    const r = await api(env, '/subscribers/sync', { method: 'POST', body: JSON.stringify(payload) });
    if (!r.ok) {
      console.log('Mailrelay sync', r.status, JSON.stringify(r.data).slice(0, 500));
      return reply(502, { ok: false, mensaje: 'No hemos podido apuntarte ahora mismo. Inténtalo de nuevo en un rato.' });
    }
    // Si esa persona se había dado de baja y ahora vuelve a apuntarse (con la casilla aceptada), se reactiva.
    const sub = r.data && (r.data.data || r.data);
    if (sub && sub.id && sub.status && sub.status !== 'active') {
      const up = await api(env, `/subscribers/${sub.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
      if (!up.ok) console.log('Mailrelay reactivar', up.status, JSON.stringify(up.data).slice(0, 300));
    }
    if (!gid) console.log('Aviso: no se encontró el grupo de la newsletter; el suscriptor se ha creado sin grupo.');
    return reply(200, { ok: true, mensaje: '¡Listo! Ya te has apuntado a la newsletter de Kapeís.' });
  } catch (e) {
    console.log('Error newsletter', e && e.message);
    return reply(500, { ok: false, mensaje: 'No hemos podido apuntarte ahora mismo. Inténtalo de nuevo en un rato.' });
  }
}
