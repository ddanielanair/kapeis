// Inicio de sesión del panel (/admin) con GitHub. Decap CMS abre esta dirección en una ventana.
// Variables en Cloudflare Pages: GITHUB_CLIENT_ID y GITHUB_CLIENT_SECRET (este último como "Secret").
export async function onRequest({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) return new Response('Falta configurar GITHUB_CLIENT_ID en Cloudflare.', { status: 500 });
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  const gh = new URL('https://github.com/login/oauth/authorize');
  gh.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  gh.searchParams.set('redirect_uri', `${url.origin}/api/callback`);
  gh.searchParams.set('scope', url.searchParams.get('scope') || 'repo,user');
  gh.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: gh.toString(),
      'Set-Cookie': `kapeis_oauth=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      'Cache-Control': 'no-store',
    },
  });
}
