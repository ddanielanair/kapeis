// Vuelta desde GitHub: cambia el código por un token y se lo pasa al panel (Decap CMS).
const page = (status, content) => {
  const msg = `authorization:github:${status}:${JSON.stringify(content)}`;
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Kapeís · acceso</title>
<body style="font-family:system-ui,sans-serif;padding:24px">${status === 'success' ? 'Acceso correcto, ya puedes cerrar esta ventana.' : 'No se ha podido iniciar sesión.'}
<script>
(function () {
  var msg = ${JSON.stringify(msg)};
  function receive(e) {
    if (e.origin !== window.location.origin) return;
    window.opener.postMessage(msg, e.origin);
    window.removeEventListener('message', receive, false);
    setTimeout(function () { window.close(); }, 300);
  }
  window.addEventListener('message', receive, false);
  if (window.opener) window.opener.postMessage('authorizing:github', window.location.origin);
})();
</script></body></html>`, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': 'kapeis_oauth=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Lax' } });
};

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookie = (request.headers.get('cookie') || '').match(/(?:^|;\s*)kapeis_oauth=([^;]+)/);
  if (!code || !state || !cookie || cookie[1] !== state) return page('error', { message: 'Sesión caducada. Vuelve a intentarlo.' });

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'kapeis-cms' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/api/callback` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) return page('error', { message: data.error_description || 'GitHub no ha devuelto el acceso.' });
  return page('success', { token: data.access_token, provider: 'github' });
}
