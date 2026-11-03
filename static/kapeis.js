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
