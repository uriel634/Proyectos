(function () {
  const form = document.getElementById('form-pedido');
  const selectVendedor = document.getElementById('vendedor_id');
  const btnEnviar = document.getElementById('btn-enviar');
  const divMensaje = document.getElementById('mensaje');

  for (const v of VENDEDORES) {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.nombre;
    selectVendedor.appendChild(opt);
  }

  function mostrarMensaje(texto, tipo) {
    divMensaje.textContent = texto;
    divMensaje.className = 'mensaje ' + tipo;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    divMensaje.className = 'mensaje';
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando...';

    const payload = {
      cliente_nombre: form.cliente_nombre.value.trim(),
      cliente_telefono: form.cliente_telefono.value.trim(),
      productos: form.productos.value.trim(),
      monto: parseFloat(form.monto.value),
      fecha_entrega: form.fecha_entrega.value,
      tipo_entrega: form.tipo_entrega.value,
      vendedor_id: form.vendedor_id.value,
      notas: form.notas.value.trim() || undefined,
    };

    try {
      const res = await fetch(`${API_BASE}/pedido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        mostrarMensaje('✅ ' + data.mensaje, 'ok');
        form.reset();
      } else {
        mostrarMensaje('❌ ' + (data.error || 'No se pudo registrar el pedido'), 'error');
      }
    } catch (err) {
      mostrarMensaje('❌ Error de conexión. Intenta de nuevo.', 'error');
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Registrar pedido';
    }
  });
})();
