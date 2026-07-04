document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.menu-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
      var expanded = links.classList.contains('open');
      toggle.setAttribute('aria-expanded', expanded);
    });
  }

  var WHATSAPP_NUMBER = '525561960964';

  var form = document.querySelector('#contact-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.querySelector('#name').value.trim();
      var phone = form.querySelector('#phone').value.trim();
      var service = form.querySelector('#service').value;
      var message = form.querySelector('#message').value.trim();

      var text = 'Hola Uriel Salud Integral, quiero agendar una cita.\n';
      text += 'Nombre: ' + name + '\n';
      if (phone) text += 'Teléfono: ' + phone + '\n';
      if (service) text += 'Servicio de interés: ' + service + '\n';
      if (message) text += 'Mensaje: ' + message;

      var url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text);
      window.open(url, '_blank');
    });
  }
});
