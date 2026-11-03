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
