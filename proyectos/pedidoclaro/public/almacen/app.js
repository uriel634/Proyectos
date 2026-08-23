(function () {
  const filtroFecha = document.getElementById('filtro-fecha');
  const listaPedidos = document.getElementById('lista-pedidos');
  const divVacio = document.getElementById('vacio');
  const divActualizado = document.getElementById('actualizado');

  const ETIQUETAS_ESTATUS = { nuevo: 'Nuevo', preparando: 'Preparando' };
  const SIGUIENTE_ACCION = {
    nuevo: { proximoEstatus: 'preparando', texto: 'Empezar a preparar' },
    preparando: { proximoEstatus: 'en_camino', texto: 'Listo, sale a ruta' },
  };

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

    const cabeza = document.createElement('div');
    cabeza.className = 'pedido-cabeza';
    cabeza.innerHTML = `
      <div>
        <div class="pedido-cliente">${p.cliente_nombre}</div>
        <div class="pedido-entrega">Vendedor: ${p.vendedor_nombre} · Entrega: ${p.fecha_entrega}</div>
      </div>
      <span class="badge badge-${p.estatus}">${ETIQUETAS_ESTATUS[p.estatus] || p.estatus}</span>
    `;

    const productos = document.createElement('div');
    productos.className = 'pedido-productos';
    productos.textContent = p.productos || '';

    div.append(cabeza, productos);

    if (p.notas) {
      const notas = document.createElement('div');
      notas.className = 'pedido-notas';
      notas.textContent = '📝 ' + p.notas;
      div.appendChild(notas);
    }

    const accion = SIGUIENTE_ACCION[p.estatus];
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
