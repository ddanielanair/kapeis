// Menú del móvil, fecha del día y botón de copiar enlace.
(function () {
  var burger = document.querySelector('.burger');
  var nav = document.getElementById('menu');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', open ? 'false' : 'true');
      nav.classList.toggle('is-open', !open);
    });
  }

  var hoy = document.querySelector('[data-hoy]');
  if (hoy) {
    try {
      var txt = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      hoy.textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
    } catch (e) {}
  }

  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-copy');
      var done = function () { var t = b.textContent; b.textContent = '¡Copiado!'; setTimeout(function () { b.textContent = t; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copia el enlace:', url); });
      else window.prompt('Copia el enlace:', url);
    });
  });
})();

// Newsletter: alta sin salir de la página.
(function () {
  document.querySelectorAll('form[data-news]').forEach(function (f) {
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = f.querySelector('.news-msg');
      var btn = f.querySelector('button[type="submit"]');
      var email = f.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = 'Revisa el email, parece que no está bien escrito.'; f.email.focus(); return; }
      if (!f.acepto.checked) { msg.textContent = 'Para suscribirte tienes que aceptar la política de privacidad.'; f.acepto.focus(); return; }
      btn.disabled = true; msg.textContent = 'Enviando…';
      fetch(f.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, acepto: true, web: f.web.value }) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (d) {
          msg.textContent = d.mensaje || (d.ok ? '¡Listo! Ya te has apuntado.' : 'No hemos podido apuntarte. Inténtalo más tarde.');
          if (d.ok) f.reset();
        })
        .catch(function () { msg.textContent = 'No hemos podido apuntarte. Inténtalo más tarde.'; })
        .then(function () { btn.disabled = false; });
    });
  });
  var s = document.querySelector('[data-sus]');
  if (s && /error=1/.test(location.search)) {
    s.querySelector('[data-ok]').textContent = 'Algo no ha ido bien';
    s.querySelector('[data-ok-text]').textContent = 'No hemos podido apuntarte. Revisa el email y vuelve a intentarlo, o escríbenos a info@kapeis.es.';
  }
})();

// Buscador: índice estático (/buscar.json) y resultados al momento.
(function () {
  var forms = document.querySelectorAll('form[data-search]');
  if (!forms.length) return;
  var indice = null, cargando = null;
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var escH = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  function cargar() {
    if (indice) return Promise.resolve(indice);
    if (!cargando) cargando = fetch('/buscar.json').then(function (r) { return r.json(); }).then(function (d) {
      indice = d.map(function (a) { a._t = norm(a.t); a._m = norm(a.m + ' ' + a.k + ' ' + a.s + ' ' + a.z); a._e = norm(a.e); a._x = norm(a.x); return a; });
      return indice;
    });
    return cargando;
  }
  // Resalta los términos sin tener en cuenta tildes ni mayúsculas.
  function resaltar(txt, terms) {
    var n = norm(txt), marcas = [];
    terms.forEach(function (t) { var i = n.indexOf(t); while (i > -1) { marcas.push([i, i + t.length]); i = n.indexOf(t, i + t.length); } });
    if (!marcas.length) return escH(txt);
    marcas.sort(function (a, b) { return a[0] - b[0]; });
    var out = '', pos = 0;
    marcas.forEach(function (m) { if (m[0] < pos) return; out += escH(txt.slice(pos, m[0])) + '<mark>' + escH(txt.slice(m[0], m[1])) + '</mark>'; pos = m[1]; });
    return out + escH(txt.slice(pos));
  }
  function buscar(q) {
    var terms = norm(q).split(/\s+/).filter(function (t) { return t.length > 1; });
    if (!terms.length) return { terms: terms, res: [] };
    var res = [];
    indice.forEach(function (a) {
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var t = terms[i], s = 0;
        if (a._t.indexOf(t) > -1) s += 10;
        if (a._m.indexOf(t) > -1) s += 6;
        if (a._e.indexOf(t) > -1) s += 4;
        if (a._x.indexOf(t) > -1) s += 1;
        if (!s) return;
        score += s;
      }
      res.push({ a: a, score: score });
    });
    res.sort(function (x, y) { return y.score - x.score; });
    return { terms: terms, res: res.map(function (r) { return r.a; }) };
  }
  function pintar(form) {
    var box = form.parentNode, status = box.querySelector('.search-status'), list = box.querySelector('.search-results');
    var q = form.q.value.trim();
    if (q.length < 2) { status.textContent = ''; list.innerHTML = ''; return; }
    cargar().then(function () {
      var r = buscar(q);
      status.textContent = r.res.length ? (r.res.length === 1 ? '1 artículo' : r.res.length + ' artículos') : 'Nada por aquí. Prueba con otra palabra.';
      list.innerHTML = r.res.slice(0, 8).map(function (a) {
        return '<li><a href="' + escH(a.u) + '"><span class="sr-meta">' + escH(a.s) + ' · ' + escH(a.z) + ' · ' + escH(a.f) + '</span><span class="sr-title">' + resaltar(a.t, r.terms) + '</span><span class="sr-text">' + resaltar(a.e, r.terms) + '</span></a></li>';
      }).join('');
    }).catch(function () { status.textContent = 'No se ha podido cargar el buscador.'; });
  }
  forms.forEach(function (f) {
    var timer;
    f.q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { pintar(f); }, 120); });
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var primero = f.parentNode.querySelector('.search-results a');
      if (primero) primero.focus(); else pintar(f);
    });
  });

  // Página /buscar/?q=
  var pag = document.getElementById('q-pagina');
  if (pag) { var q = new URLSearchParams(location.search).get('q'); if (q) { pag.value = q; pintar(pag.form); } }

  // Panel de la cabecera
  var btn = document.querySelector('.search-toggle'), panel = document.getElementById('buscador');
  if (!btn || !panel) return;
  var input = panel.querySelector('input');
  function abrir() { panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); cargar(); input.focus(); }
  function cerrar(volver) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (volver) btn.focus(); }
  btn.addEventListener('click', function () { panel.hidden ? abrir() : cerrar(true); });
  panel.querySelector('.search-close').addEventListener('click', function () { cerrar(true); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) cerrar(true);
    var t = e.target.tagName;
    if (e.key === '/' && panel.hidden && t !== 'INPUT' && t !== 'TEXTAREA' && !e.target.isContentEditable) { e.preventDefault(); abrir(); }
  });
})();
