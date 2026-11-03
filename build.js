// Generador de la web de Kapeís. Sin dependencias: `node build.js` crea /dist.
// Lee los artículos de content/articulos/*.md y los ajustes de content/ajustes.json.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const SITE_URL = 'https://kapeis.es';

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });
const write = (rel, content) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const copyDir = (from, to) => {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    e.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
};
const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (d) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
const fechaCorta = (d) => `${d.getDate()} de ${MESES[d.getMonth()]}`;

// ---------- frontmatter (YAML sencillo, el que escribe el panel) ----------
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const lines = m[1].split(/\r?\n/);
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2];
    if (/^[>|][-+]?$/.test(val)) {
      const folded = val[0] === '>';
      const block = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i].replace(/^\s{2}/, ''));
      val = folded ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim();
    } else if (val !== '' && !/^["']/.test(val) && i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
      // texto largo sin comillas partido en varias líneas (así lo guarda el panel)
      const parts = [val];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim());
      val = parts.join(' ');
    } else if (/^".*"$/.test(val)) {
      val = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else if (/^'.*'$/.test(val)) {
      val = val.slice(1, -1).replace(/''/g, "'");
    } else if (val === 'true' || val === 'false') {
      val = val === 'true';
    } else if (/^-?\d+(\.\d+)?$/.test(val)) {
      val = Number(val);
    }
    data[key] = val;
  }
  return { data, body: m[2] };
}

// ---------- markdown mínimo ----------
function inline(s) {
  let t = esc(s);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, txt, url) => {
    const ext = /^https?:/.test(url) && !url.startsWith(SITE_URL);
    return `<a href="${url}"${ext ? ' target="_blank" rel="noopener"' : ''}>${txt}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>');
  return t;
}
function markdown(md) {
  const blocks = String(md || '').replace(/\r/g, '').split(/\n{2,}/);
  return blocks.map((b) => {
    b = b.trim();
    if (!b) return '';
    let h = b.match(/^(#{2,4})\s+(.*)$/);
    if (h) { const n = Math.max(2, h[1].length); return `<h${n}>${inline(h[2])}</h${n}>`; }
    if (/^>\s?/.test(b)) return `<blockquote><p>${inline(b.replace(/^>\s?/gm, ''))}</p></blockquote>`;
    if (/^[-*]\s+/.test(b)) return '<ul>' + b.split('\n').map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('') + '</ul>';
    if (/^\d+\.\s+/.test(b)) return '<ol>' + b.split('\n').map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('') + '</ol>';
    return `<p>${inline(b).replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}

// ---------- contenido ----------
const ajustes = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/ajustes.json'), 'utf8'));
const SECCIONES = { Marketing: 'marketing', Digital: 'digital', Retail: 'retail' };
const ZONAS = { 'España': 'espana', 'Internacional': 'internacional' };

const artDir = path.join(ROOT, 'content/articulos');
const articulos = fs.readdirSync(artDir).filter((f) => f.endsWith('.md')).map((f) => {
  const { data, body } = parseFrontmatter(fs.readFileSync(path.join(artDir, f), 'utf8'));
  const fecha = new Date(String(data.fecha || '').replace(' ', 'T'));
  const slug = data.slug ? slugify(data.slug) : slugify(f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''));
  const palabras = String(body).split(/\s+/).filter(Boolean).length;
  return {
    ...data,
    slug,
    fecha: isNaN(fecha) ? new Date() : fecha,
    body,
    html: markdown(body),
    url: `/articulos/${slug}/`,
    lectura: Number(data.lectura) || Math.max(1, Math.round(palabras / 200)),
    seccionSlug: SECCIONES[data.seccion] || 'marketing',
    zonaSlug: ZONAS[data.zona] || 'espana',
  };
}).filter((a) => a.borrador !== true).sort((a, b) => b.fecha - a.fecha);

// ---------- piezas comunes ----------
const IG_ICON = `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"/></svg>`;
const LOGO = (size = 'lg') => `<span class="logo logo-${size}"><span class="logo-hash" aria-hidden="true">#</span>kapeís</span>`;

function thumb(a, variant = 'm') {
  if (a.imagen) return `<img class="thumb thumb-${variant}" src="${esc(a.imagen)}" alt="${esc(a.alt_imagen || a.titulo)}" loading="lazy">`;
  const etiqueta = a.marca || a.titulo.split(/[:,]/)[0].split(' ').slice(0, 3).join(' ');
  return `<div class="thumb thumb-${variant} thumb-type ${a.tono === 'fosforito' ? 'is-accent' : ''}" role="img" aria-label="${esc(etiqueta)}"><span>${esc(etiqueta)}</span></div>`;
}

const tags = (a) => `<span class="tags-row"><a class="tag tag-sec" href="/${a.seccionSlug}/">${esc(a.seccion)}</a><a class="tag tag-zone" href="/${a.zonaSlug}/">${esc(a.zona)}</a></span>`;
const meta = (a, extra = []) => `<p class="meta">${tags(a)}${extra.map((e) => `<span>${esc(e)}</span>`).join('')}</p>`;

const btnHash = (href, label) => `<a class="btn btn-hash" href="${href}"><span class="hash" aria-hidden="true">#</span>${esc(label)}</a>`;

function header(active = '') {
  const link = (href, label, key) => `<li><a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a></li>`;
  return `<header class="site-header">
<div class="topbar"><div class="wrap topbar-row">
<span class="topbar-tag">Revista diaria de marketing</span>
<span class="topbar-links"><a href="mailto:${esc(ajustes.email_info)}">${esc(ajustes.email_info)}</a><a href="mailto:${esc(ajustes.email_colaboracion)}">${esc(ajustes.email_colaboracion)}</a>${ajustes.instagram ? `<a class="topbar-ig" href="${esc(ajustes.instagram)}" target="_blank" rel="noopener" aria-label="Instagram de Kapeís">@kapeis.es</a>` : ''}</span>
</div></div>
<div class="wrap">
<div class="header-row">
<a class="logo-link" href="/" aria-label="Kapeís, ir a la portada">${LOGO('lg')}</a>
<button class="burger" type="button" aria-label="Menú" aria-expanded="false" aria-controls="menu"><svg class="i-open" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg><svg class="i-close" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg></button>
</div>
<nav id="menu" class="nav" aria-label="Secciones">
<ul class="nav-list">
${link('/marketing/', 'Marketing', 'marketing')}
${link('/digital/', 'Digital', 'digital')}
${link('/retail/', 'Retail', 'retail')}
</ul>
<span class="nav-sep" aria-hidden="true"></span>
<ul class="nav-list" aria-label="Zona">
${link('/espana/', 'España', 'espana')}
${link('/internacional/', 'Internacional', 'internacional')}
</ul>
<a class="btn btn-dark btn-sm" href="/#newsletter">Suscríbete</a>
</nav>
</div>
</header>`;
}

let newsCount = 0;
function newsletter(titulo = '¿Te avisamos de lo importante?', texto = 'Publicamos cada día, pero solo escribimos a tu correo cuando hay algo que de verdad merece la pena. Pocas veces y sin relleno.') {
  const n = ++newsCount;
  const form = ajustes.newsletter_activa !== false
    ? `<form class="news-form" action="/api/suscribir" method="post" data-news novalidate>
<label for="email-${n}">Tu email</label>
<div class="news-row">
<input id="email-${n}" name="email" type="email" required placeholder="nombre@correo.com" autocomplete="email">
<button class="btn btn-dark btn-lg" type="submit">Suscribirme</button>
</div>
<label class="news-check"><input type="checkbox" name="acepto" required><span>Acepto la <a href="/legal/#privacidad">política de privacidad</a>.</span></label>
<input class="news-trap" type="text" name="web" tabindex="-1" autocomplete="off" aria-hidden="true">
<p class="news-msg" role="status" aria-live="polite"></p>
</form>`
    : `<div class="news-form"><p class="news-soon">La newsletter arranca muy pronto. Mientras, escríbenos a <a href="mailto:${esc(ajustes.email_info)}">${esc(ajustes.email_info)}</a> y te avisamos.</p></div>`;
  return `<section id="newsletter" class="wrap news-wrap" aria-labelledby="news-h">
<div class="news">
<div class="news-text"><h2 id="news-h">${titulo}</h2><p>${texto}</p></div>
${form}
</div>
</section>`;
}

function footer() {
  return `<footer class="site-footer">
<div class="wrap footer-row">
${LOGO('sm')}
<nav aria-label="Legal"><ul>
<li><a href="/sobre/">Sobre Kapeís</a></li>
<li><a href="/sobre/#contacto">Contacto</a></li>
<li><a href="/legal/#aviso">Aviso legal</a></li>
<li><a href="/legal/#privacidad">Privacidad</a></li>
<li><a href="/legal/#cookies">Cookies</a></li>
${ajustes.instagram ? `<li><a class="ig" href="${esc(ajustes.instagram)}" target="_blank" rel="noopener" aria-label="Instagram de Kapeís">${IG_ICON}Instagram</a></li>` : ''}
</ul></nav>
<p class="copy">© ${new Date().getFullYear()} Kapeís · Revista diaria de marketing</p>
</div>
</footer>`;
}

function page({ title, seoTitle, description, body, active = '', canonical = '/', og = {}, head = '' }) {
  const fullTitle = seoTitle ? seoTitle : title ? `${title} – Kapeís` : 'Kapeís – Revista de marketing, marketing digital y retail';
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || ajustes.descripcion)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${SITE_URL}${canonical}">
<meta property="og:site_name" content="Kapeís">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="${esc(title || 'Kapeís')}">
<meta property="og:description" content="${esc(description || ajustes.descripcion)}">
<meta property="og:type" content="${og.type || 'website'}">
<meta property="og:url" content="${SITE_URL}${canonical}">
${og.image ? `<meta property="og:image" content="${og.image.startsWith('http') ? esc(og.image) : SITE_URL + esc(og.image)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
${head}
<meta name="theme-color" content="#FFFFFF">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="Kapeís" href="/rss.xml">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/estilos.css">
</head>
<body>
<a class="skip" href="#contenido">Saltar al contenido</a>
${header(active)}
<main id="contenido">
${body}
</main>
<section class="contact-band" aria-label="Contacto">
<div class="wrap contact-band-row">
<p class="contact-band-title">¿Tienes algo que contarnos?</p>
<p class="contact-band-item"><span>Información</span><a href="mailto:${esc(ajustes.email_info)}">${esc(ajustes.email_info)}</a></p>
<p class="contact-band-item"><span>Colaboraciones y prensa</span><a href="mailto:${esc(ajustes.email_colaboracion)}">${esc(ajustes.email_colaboracion)}</a></p>
${ajustes.instagram ? `<p class="contact-band-item"><span>Síguenos</span><a class="ig" href="${esc(ajustes.instagram)}" target="_blank" rel="noopener">${IG_ICON}@kapeis.es</a></p>` : ''}
</div>
</section>
${footer()}
<script src="/kapeis.js" defer></script>
</body>
</html>
`;
}

// ---------- portada ----------
function portada() {
  const lista = [...articulos];
  const hero = lista.find((a) => a.portada === true) || lista[0];
  const resto = lista.filter((a) => a !== hero);
  const hoy = resto.slice(0, 4);
  const [big, m1, m2, side] = hoy;

  const heroImg = hero.imagen
    ? `<img class="hero-img" src="${esc(hero.imagen)}" alt="${esc(hero.alt_imagen || hero.titulo)}">`
    : `<div class="hero-img thumb-type" role="img" aria-label="${esc(hero.marca || hero.titulo)}"><span>${esc(hero.marca || hero.titulo)}</span></div>`;

  const heroHtml = `<section class="wrap hero" aria-labelledby="h-portada">
<div class="hero-text">
<div class="hero-top">
<p class="meta">${tags(hero)}</p>
<h1 id="h-portada"><a href="${hero.url}">${esc(hero.titulo)}</a></h1>
<p class="lede">${esc(hero.entradilla)}</p>
</div>
<div class="hero-foot">
<span class="muted">${hero.lectura} min de lectura</span>
<a class="btn btn-dark" href="${hero.url}">Leer el artículo <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></a>
</div>
</div>
${heroImg}
</section>`;

  const ultimas = resto.slice(0, 3);
  const tickerHtml = ultimas.length ? `<section class="ticker" aria-label="Últimas noticias">
<div class="wrap ticker-row">
<ul class="ticker-list">${ultimas.map((a) => `<li><a href="${a.url}">${esc(a.titulo)}</a></li>`).join('')}</ul>
</div>
</section>` : '';

  const card = (a, size) => !a ? '' : `<article class="card card-${size}">
${thumb(a, size === 'xl' ? 'wide' : size === 'side' ? 'tall' : 'm')}
${meta(a)}
<h3><a class="t" href="${a.url}">${esc(a.titulo)}</a></h3>
<p>${esc(a.entradilla)}</p>
${a.fuente_nombre ? `<p class="via">Vía ${esc(a.fuente_nombre)}</p>` : ''}
</article>`;

  const hoyHtml = hoy.length ? `<section class="wrap block" aria-labelledby="h-hoy">
<div class="block-head"><h2 id="h-hoy">Hoy en Kapeís</h2>${btnHash('/articulos/', 'Todos los artículos')}</div>
<div class="today">
<div class="col col-big">${card(big, 'xl')}</div>
<div class="col col-mid">${card(m1, 'm')}${card(m2, 'm')}</div>
<div class="col col-side">${card(side, 'side')}</div>
</div>
</section>` : '';

  const zonaLista = (nombre, slug) => {
    const items = lista.filter((a) => a.zona === nombre).slice(0, 4);
    return `<div class="zone-col">
<div class="zone-head"><h2>${nombre}</h2>${btnHash(`/${slug}/`, `Todo ${nombre}`)}</div>
<ul class="title-list">${items.map((a) => `<li><a class="t" href="${a.url}">${esc(a.titulo)}</a></li>`).join('') || '<li class="muted">Muy pronto.</li>'}</ul>
</div>`;
  };
  const zonasHtml = `<section class="zones" aria-label="España e Internacional"><div class="wrap zones-row">${zonaLista('España', 'espana')}${zonaLista('Internacional', 'internacional')}</div></section>`;

  const frase = hero.frase_destacada ? `<section class="quote" aria-labelledby="h-idea"><div class="wrap">
<figure>
<p class="quote-label" id="h-idea">La idea de hoy</p>
<span class="quote-mark" aria-hidden="true">“</span>
<blockquote>${esc(hero.frase_destacada)}</blockquote>
<figcaption>De <a href="${hero.url}">${esc(hero.titulo)}</a></figcaption>
</figure>
</div></section>` : '';

  const retail = lista.find((a) => a.seccion === 'Retail');
  const retailHtml = `<section id="retail" class="wrap retail" aria-labelledby="h-retail">
<div class="retail-intro">
<h2 id="h-retail">Retail</h2>
<span class="bar" aria-hidden="true"></span>
<p>Tiendas, escaparates y todo lo que pasa entre que alguien entra por la puerta y sale con una bolsa.</p>
<div>${btnHash('/retail/', 'Todo sobre retail')}</div>
</div>
${retail ? `<article class="retail-feature">
${thumb(retail, 'retail')}
<div>
${meta(retail)}
<h3><a class="t" href="${retail.url}">${esc(retail.titulo)}</a></h3>
<p>${esc(retail.entradilla)}</p>
${retail.fuente_nombre ? `<p class="via">Vía ${esc(retail.fuente_nombre)}</p>` : ''}
</div>
</article>` : ''}
</section>`;

  return page({ body: heroHtml + tickerHtml + hoyHtml + zonasHtml + frase + retailHtml + newsletter(), canonical: '/', og: { image: hero.imagen } });
}

// ---------- listados ----------
function listado({ titulo, descripcion, items, active, ruta }) {
  const body = `<section class="wrap list-head">
<h1>${esc(titulo)}</h1>
<p class="lede">${esc(descripcion)}</p>
</section>
<section class="wrap block">
<div class="grid-list">
${items.map((a) => `<article class="card card-m">
${thumb(a, 'm')}
<p class="meta">${tags(a)}<span>${fechaCorta(a.fecha)}</span></p>
<h3><a class="t" href="${a.url}">${esc(a.titulo)}</a></h3>
<p>${esc(a.entradilla)}</p>
</article>`).join('\n') || '<p class="muted">Todavía no hay artículos aquí. Vuelve mañana.</p>'}
</div>
</section>
${newsletter()}`;
  return page({ title: titulo, description: descripcion, body, active, canonical: ruta });
}

// ---------- artículo ----------
function articuloPage(a) {
  const relacionados = articulos.filter((x) => x !== a).sort((x, y) => (y.seccion === a.seccion) - (x.seccion === a.seccion) || y.fecha - x.fecha).slice(0, 3);
  const share = (u, t) => {
    const url = encodeURIComponent(SITE_URL + a.url), tit = encodeURIComponent(a.titulo);
    return {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      x: `https://x.com/intent/post?url=${url}&text=${tit}`,
      whatsapp: `https://wa.me/?text=${tit}%20${url}`,
    };
  };
  const s = share();
  const img = a.imagen
    ? `<figure class="art-figure"><img src="${esc(a.imagen)}" alt="${esc(a.alt_imagen || a.titulo)}">${a.pie_imagen ? `<figcaption>${esc(a.pie_imagen)}</figcaption>` : ''}</figure>`
    : '';
  const body = `<article class="art" aria-labelledby="h-art">
<div class="art-col">
<p class="meta"><a href="/">Portada</a><strong><a href="/${a.seccionSlug}/">${esc(a.seccion)}</a></strong><a href="/${a.zonaSlug}/">${esc(a.zona)}</a></p>
<h1 id="h-art">${esc(a.titulo)}</h1>
<p class="lede">${esc(a.entradilla)}</p>
<div class="art-meta">
<span class="meta"><span>${esc(a.autor || 'Redacción Kapeís')}</span><span><time datetime="${a.fecha.toISOString()}">${fechaLarga(a.fecha)}</time></span><span>${a.lectura} min de lectura</span></span>
<span class="share">
<a class="pill" href="${s.linkedin}" target="_blank" rel="noopener">LinkedIn</a>
<a class="pill" href="${s.x}" target="_blank" rel="noopener">X</a>
<a class="pill" href="${s.whatsapp}" target="_blank" rel="noopener">WhatsApp</a>
<button class="pill" type="button" data-copy="${SITE_URL}${a.url}">Copiar enlace</button>
</span>
</div>
</div>
${img ? `<div class="art-col">${img}</div>` : ''}
<div class="art-col art-body">
${a.html}
${a.frase_destacada ? `<aside class="callout"><p>${esc(a.frase_destacada)}</p></aside>` : ''}
${a.fuente_url ? `<p class="source">Lee la noticia completa en <a href="${esc(a.fuente_url)}" target="_blank" rel="noopener">${esc(a.fuente_nombre || 'la fuente original')}</a>.</p>` : ''}
<p class="tags"><a class="pill" href="/${a.seccionSlug}/">${esc(a.seccion)}</a><a class="pill" href="/${a.zonaSlug}/">${esc(a.zona)}</a></p>
</div>
</article>
<section class="wrap block" aria-labelledby="h-sigue">
<div class="block-head"><h2 id="h-sigue">Sigue leyendo</h2>${btnHash('/', 'Volver a la portada')}</div>
<div class="grid-list">
${relacionados.map((r) => `<article class="card card-m">${meta(r)}<h3><a class="t" href="${r.url}">${esc(r.titulo)}</a></h3></article>`).join('')}
</div>
</section>
${newsletter('¿Te ha gustado? Te avisamos solo de lo importante.', 'Publicamos cada día. A tu correo solo llega lo que de verdad merece la pena.')}`;
  const imgAbs = a.imagen ? (a.imagen.startsWith('http') ? a.imagen : SITE_URL + a.imagen) : undefined;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.titulo,
    description: a.descripcion_seo || a.entradilla,
    datePublished: a.fecha.toISOString(),
    dateModified: (a.actualizado ? new Date(String(a.actualizado).replace(' ', 'T')) : a.fecha).toISOString(),
    articleSection: a.seccion,
    inLanguage: 'es-ES',
    mainEntityOfPage: SITE_URL + a.url,
    ...(imgAbs ? { image: [imgAbs] } : {}),
    ...(a.palabras_clave ? { keywords: String(a.palabras_clave) } : {}),
    author: { '@type': 'Organization', name: a.autor || 'Redacción Kapeís', url: SITE_URL + '/sobre/' },
    publisher: { '@type': 'Organization', name: 'Kapeís', url: SITE_URL, logo: { '@type': 'ImageObject', url: SITE_URL + '/favicon.svg' } },
  };
  const head = `<meta property="article:published_time" content="${a.fecha.toISOString()}">
<meta property="article:section" content="${esc(a.seccion)}">
${a.alt_imagen ? `<meta property="og:image:alt" content="${esc(a.alt_imagen)}">` : ''}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
  return page({ title: a.titulo, seoTitle: a.titulo_seo ? `${a.titulo_seo} | Kapeís` : undefined, description: a.descripcion_seo || a.entradilla, body, active: a.seccionSlug, canonical: a.url, og: { type: 'article', image: a.imagen }, head });
}

// ---------- páginas fijas ----------
function sobre() {
  const body = fs.readFileSync(path.join(ROOT, 'src/sobre.html'), 'utf8')
    .replace(/\{\{email_info\}\}/g, esc(ajustes.email_info))
    .replace(/\{\{email_colaboracion\}\}/g, esc(ajustes.email_colaboracion));
  return page({ title: 'Sobre Kapeís', description: 'Qué es Kapeís, qué publicamos y cómo escribirnos.', body, canonical: '/sobre/' });
}
function legal() {
  const body = fs.readFileSync(path.join(ROOT, 'src/legal.html'), 'utf8')
    .replace(/\{\{responsable\}\}/g, esc(ajustes.responsable))
    .replace(/\{\{email_info\}\}/g, esc(ajustes.email_info))
    .replace(/\{\{actualizado\}\}/g, esc(ajustes.legal_actualizado));
  return page({ title: 'Información legal', description: 'Aviso legal, privacidad y cookies de Kapeís.', body, canonical: '/legal/' });
}
function suscripcion() {
  return page({ title: 'Suscripción', body: `<section class="wrap list-head" data-sus>
<h1 data-ok>¡Listo!</h1>
<p class="lede" data-ok-text>Ya te has apuntado a la newsletter de Kapeís. Te escribiremos solo cuando haya algo que merezca la pena.</p>
<p>${btnHash('/', 'Volver a la portada')}</p>
</section>`, canonical: '/suscripcion/' });
}
function noEncontrada() {
  return page({ title: 'Página no encontrada', body: `<section class="wrap list-head"><h1>Aquí no hay nada</h1><p class="lede">La página que buscas no existe o ha cambiado de sitio.</p><p>${btnHash('/', 'Volver a la portada')}</p></section>`, canonical: '/404/' });
}

// ---------- fuentes (se descargan al compilar para no depender de Google) ----------
async function fuentes() {
  const dir = path.join(OUT, 'fonts');
  fs.mkdirSync(dir, { recursive: true });
  const fallback = '/* sin conexión al compilar: se usan las fuentes del sistema */\n';
  try {
    const cssUrl = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@500;600;700&display=swap';
    const res = await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' } });
    if (!res.ok) throw new Error('css ' + res.status);
    let css = await res.text();
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map((m) => m[1]))];
    let n = 0;
    for (const u of urls) {
      const name = `f${n++}.woff2`;
      const r = await fetch(u);
      if (!r.ok) throw new Error('font ' + r.status);
      fs.writeFileSync(path.join(dir, name), Buffer.from(await r.arrayBuffer()));
      css = css.split(u).join(`/fonts/${name}`);
    }
    fs.writeFileSync(path.join(dir, 'fonts.css'), css);
    console.log(`Fuentes: ${urls.length} archivos alojados en la propia web.`);
  } catch (e) {
    fs.writeFileSync(path.join(dir, 'fonts.css'), fallback);
    console.log('Fuentes: no se pudieron descargar (' + e.message + '); se usa la fuente del sistema.');
  }
}

// ---------- rss y sitemap ----------
function rss() {
  const items = articulos.slice(0, 30).map((a) => `<item><title>${esc(a.titulo)}</title><link>${SITE_URL}${a.url}</link><guid>${SITE_URL}${a.url}</guid><pubDate>${a.fecha.toUTCString()}</pubDate><description>${esc(a.entradilla)}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Kapeís</title><link>${SITE_URL}</link><description>${esc(ajustes.descripcion)}</description><language>es</language>${items}</channel></rss>`;
}
function sitemap(rutas) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rutas.map((r) => `<url><loc>${SITE_URL}${r}</loc></url>`).join('')}</urlset>`;
}

// ---------- compilar ----------
(async () => {
  rmrf(OUT);
  copyDir(path.join(ROOT, 'static'), OUT);
  await fuentes();
  const rutas = ['/', '/articulos/', '/sobre/', '/legal/'];

  write('index.html', portada());
  write('articulos/index.html', listado({ titulo: 'Todos los artículos', descripcion: 'Todo lo publicado en Kapeís, de lo más nuevo a lo más antiguo.', items: articulos, ruta: '/articulos/' }));

  const descS = { Marketing: 'Campañas, marcas, publicidad y estrategia. Lo que se ha hecho y lo que se puede copiar.', Digital: 'Redes sociales, buscadores, contenidos, plataformas y medios. Lo que cambia y a quién le afecta.', Retail: 'Tiendas, escaparates, producto y experiencia de compra, en la calle y en internet.' };
  for (const [nombre, slug] of Object.entries(SECCIONES)) {
    write(`${slug}/index.html`, listado({ titulo: nombre, descripcion: descS[nombre], items: articulos.filter((a) => a.seccion === nombre), active: slug, ruta: `/${slug}/` }));
    rutas.push(`/${slug}/`);
  }
  const descZ = { 'España': 'Lo que pasa en el marketing de aquí.', 'Internacional': 'Campañas, marcas y tendencias de fuera que conviene conocer.' };
  for (const [nombre, slug] of Object.entries(ZONAS)) {
    write(`${slug}/index.html`, listado({ titulo: nombre, descripcion: descZ[nombre], items: articulos.filter((a) => a.zona === nombre), active: slug, ruta: `/${slug}/` }));
    rutas.push(`/${slug}/`);
  }
  for (const a of articulos) { write(`articulos/${a.slug}/index.html`, articuloPage(a)); rutas.push(a.url); }
  write('sobre/index.html', sobre());
  write('legal/index.html', legal());
  write('suscripcion/index.html', suscripcion());
  write('404.html', noEncontrada());
  write('rss.xml', rss());
  write('sitemap.xml', sitemap(rutas));
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log(`Kapeís compilada: ${articulos.length} artículos, ${rutas.length} páginas.`);
})();
