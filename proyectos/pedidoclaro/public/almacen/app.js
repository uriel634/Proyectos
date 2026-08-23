(function () {
  const filtroFecha = document.getElementById('filtro-fecha');
  const listaPedidos = document.getElementById('lista-pedidos');
  const divVacio = document.getElementById('vacio');
  const divActualizado = document.getElementById('actualizado');

  const ETIQUETAS_ESTATUS = { nuevo: 'Nuevo', preparando: 'Preparando' };

  const UMBRAL_ALERTA_MIN = 20;
  const UMBRAL_CRITICO_MIN = 30;

  function siguienteAccion(p) {
    if (p.estatus === 'nuevo') {
      return { proximoEstatus: 'preparando', texto: 'Empezar a preparar' };
    }
    if (p.estatus === 'preparando') {
      return p.tipo_entrega === 'tienda'
        ? { proximoEstatus: 'en_camino', texto: 'Marcar listo para recoger' }
        : { proximoEstatus: 'en_camino', texto: 'Listo, sale a ruta' };
    }
    return null;
  }

  function chipEspera(p) {
    if (p.estatus !== 'preparando') return null;
    const actualizadoUtc = p.updated_at.replace(' ', 'T') + 'Z';
    const minutos = Math.floor((Date.now() - new Date(actualizadoUtc).getTime()) / 60000);
    if (minutos < UMBRAL_ALERTA_MIN) {
      return { clase: 'espera-ok', texto: `🟢 ${minutos} min preparando` };
    }
    if (minutos < UMBRAL_CRITICO_MIN) {
      return { clase: 'espera-alerta', texto: `🟡 ${minutos} min preparando` };
    }
    return { clase: 'espera-critico', texto: `🔴 ${minutos} min preparando` };
  }

  filtroFecha.value = new Date().toISOString().slice(0, 10);

  async function cambiarEstatus(pedidoId, nuevoEstatus, boton) {
    boton.disabled = true;
    boton.textContent = 'Actualizando...';
    try {
      const res = await fetch(`${API_BASE}/pedido/${pedidoId}/estatus`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estatus: nuevoEstatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('No se pudo actualizar: ' + (data.error || 'error desconocido'));
        boton.disabled = false;
      }
    } catch (err) {
      alert('Error de conexión al actualizar el pedido.');
      boton.disabled = false;
    } finally {
      await cargarPedidos();
    }
  }

  function tarjetaPedido(p) {
    const div = document.createElement('div');
    div.className = 'pedido';

    const etiquetaTipo = p.tipo_entrega === 'tienda' ? '🏬 Tienda' : '🚚 Domicilio';

    const cabeza = document.createElement('div');
    cabeza.className = 'pedido-cabeza';
    cabeza.innerHTML = `
      <div>
        <div class="pedido-cliente">${p.cliente_nombre}</div>
        <div class="pedido-entrega">Vendedor: ${p.vendedor_nombre} · Entrega: ${p.fecha_entrega}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
        <span class="badge badge-${p.estatus}">${ETIQUETAS_ESTATUS[p.estatus] || p.estatus}</span>
        <span class="badge badge-tipo">${etiquetaTipo}</span>
      </div>
    `;

    const productos = document.createElement('div');
    productos.className = 'pedido-productos';
    productos.textContent = p.productos || '';

    div.append(cabeza, productos);

    const espera = chipEspera(p);
    if (espera) {
      const chip = document.createElement('div');
      chip.className = `espera ${espera.clase}`;
      chip.textContent = espera.texto;
      div.appendChild(chip);
    }

    if (p.notas) {
      const notas = document.createElement('div');
      notas.className = 'pedido-notas';
      notas.textContent = '📝 ' + p.notas;
      div.appendChild(notas);
    }

    const accion = siguienteAccion(p);
    if (accion) {
      const boton = document.createElement('button');
      boton.className = 'accion';
      boton.textContent = accion.texto;
      boton.addEventListener('click', () => cambiarEstatus(p.id, accion.proximoEstatus, boton));
      div.appendChild(boton);
    }

    return div;
  }

  async function cargarPedidos() {
    try {
      const params = new URLSearchParams({ fecha: filtroFecha.value });
      const res = await fetch(`${API_BASE}/pedidos?${params.toString()}`);
      const data = await res.json();

      const pendientes = (data.pedidos || [])
        .filter((p) => p.estatus === 'nuevo' || p.estatus === 'preparando')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      listaPedidos.innerHTML = '';
      if (pendientes.length === 0) {
        divVacio.style.display = 'block';
      } else {
        divVacio.style.display = 'none';
        for (const p of pendientes) {
          listaPedidos.appendChild(tarjetaPedido(p));
        }
      }

      divActualizado.textContent = 'Actualizado: ' + new Date().toLocaleTimeString('es-MX');
    } catch (err) {
      divActualizado.textContent = 'Error al cargar pedidos. Reintentando...';
    }
  }

  filtroFecha.addEventListener('change', cargarPedidos);

  cargarPedidos();
  setInterval(cargarPedidos, AUTO_REFRESH_MS);
})();
