// Una sola dirección para Google: www.kapeis.es y kapeis.pages.dev redirigen (301) a https://kapeis.es.
// Las vistas previas de Cloudflare (xxxx.kapeis.pages.dev) no se tocan.
export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === 'www.kapeis.es' || url.hostname === 'kapeis.pages.dev') {
    url.hostname = 'kapeis.es';
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
