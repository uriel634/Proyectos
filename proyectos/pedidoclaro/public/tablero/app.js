(function () {
  const ESTATUS = ['nuevo', 'preparando', 'en_camino', 'entregado', 'cancelado'];
  const ETIQUETAS_ESTATUS = {
    nuevo: 'Nuevo',
    preparando: 'Preparando',
    en_camino: 'En camino',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  };

  const filtroFecha = document.getElementById('filtro-fecha');
  const filtroEstatus = document.getElementById('filtro-estatus');
  const filtroVendedor = document.getElementById('filtro-vendedor');
  const btnVerTodos = document.getElementById('btn-ver-todos');
  const tbody = document.getElementById('tbody-pedidos');
  const divVacio = document.getElementById('vacio');
  const divActualizado = document.getElementById('actualizado');

  const kpiTotal = document.getElementById('kpi-total');
  const kpiPreparando = document.getElementById('kpi-preparando');
  const kpiEntregado = document.getElementById('kpi-entregado');
  const kpiMonto = document.getElementById('kpi-monto');

  function fechaLocalISO() {
    const d = new Date();
    const offsetMs = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
  }

  filtroFecha.value = fechaLocalISO();
  let verTodos = false;

  for (const v of VENDEDORES) {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.nombre;
    filtroVendedor.appendChild(opt);
  }

  function etiquetaEstatus(p) {
    if (p.estatus === 'en_camino' && p.tipo_entrega === 'tienda') return 'Listo para recoger';
    return ETIQUETAS_ESTATUS[p.estatus] || p.estatus;
  }

  function formatoMoneda(n) {
    return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function construirUrl() {
    const params = new URLSearchParams();
    params.set('fecha', verTodos ? 'todas' : filtroFecha.value);
    if (filtroEstatus.value) params.set('estatus', filtroEstatus.value);
    if (filtroVendedor.value) params.set('vendedor_id', filtroVendedor.value);
    return `${API_BASE}/pedidos?${params.toString()}`;
  }

  async function cambiarEstatus(pedidoId, nuevoEstatus, selectEl) {
    selectEl.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/pedido/${pedidoId}/estatus`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estatus: nuevoEstatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('No se pudo actualizar el estatus: ' + (data.error || 'error desconocido'));
      }
    } catch (err) {
      alert('Error de conexión al actualizar el estatus.');
    } finally {
      await cargarPedidos();
    }
  }

  function filaPedido(p) {
    const tr = document.createElement('tr');

    const etiquetaTipo = p.tipo_entrega === 'tienda' ? '🏬 Tienda' : '🚚 Domicilio';

    const tdCliente = document.createElement('td');
    tdCliente.innerHTML = `${p.cliente_nombre}<br><span style="color:var(--text-dim);font-size:0.78rem;">${p.cliente_telefono} · ${etiquetaTipo}</span>`;

    const tdProductos = document.createElement('td');
    tdProductos.className = 'productos';
    tdProductos.textContent = p.productos || '';

    const tdVendedor = document.createElement('td');
    tdVendedor.textContent = p.vendedor_nombre;

    const tdMonto = document.createElement('td');
    tdMonto.textContent = formatoMoneda(p.monto);

    const tdEntrega = document.createElement('td');
    tdEntrega.textContent = p.fecha_entrega;

    const tdEstatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge badge-${p.estatus}`;
    badge.textContent = etiquetaEstatus(p);
    tdEstatus.appendChild(badge);

    const selectEstatus = document.createElement('select');
    selectEstatus.className = 'cambiar-estatus';
    for (const e of ESTATUS) {
      const opt = document.createElement('option');
      opt.value = e;
      opt.textContent = e === 'en_camino' && p.tipo_entrega === 'tienda' ? 'Listo para recoger' : ETIQUETAS_ESTATUS[e];
      if (e === p.estatus) opt.selected = true;
      selectEstatus.appendChild(opt);
    }
    selectEstatus.addEventListener('change', () => cambiarEstatus(p.id, selectEstatus.value, selectEstatus));
    tdEstatus.appendChild(document.createElement('br'));
    tdEstatus.appendChild(selectEstatus);

    tr.append(tdCliente, tdProductos, tdVendedor, tdMonto, tdEntrega, tdEstatus);
    return tr;
  }

  async function cargarPedidos() {
    try {
      const res = await fetch(construirUrl());
      const data = await res.json();

      kpiTotal.textContent = data.kpis.total_pedidos;
      kpiPreparando.textContent = data.kpis.por_estatus.preparando ?? 0;
      kpiEntregado.textContent = data.kpis.por_estatus.entregado ?? 0;
      kpiMonto.textContent = formatoMoneda(data.kpis.monto_total_dia);

      tbody.innerHTML = '';
      if (!data.pedidos || data.pedidos.length === 0) {
        divVacio.style.display = 'block';
      } else {
        divVacio.style.display = 'none';
        for (const p of data.pedidos) {
          tbody.appendChild(filaPedido(p));
        }
      }

      divActualizado.textContent = 'Actualizado: ' + new Date().toLocaleTimeString('es-MX');
    } catch (err) {
      divActualizado.textContent = 'Error al cargar pedidos. Reintentando...';
    }
  }

  filtroFecha.addEventListener('change', cargarPedidos);
  filtroEstatus.addEventListener('change', cargarPedidos);
  filtroVendedor.addEventListener('change', cargarPedidos);
  btnVerTodos.addEventListener('click', () => {
    verTodos = !verTodos;
    filtroFecha.disabled = verTodos;
    btnVerTodos.classList.toggle('activo', verTodos);
    btnVerTodos.textContent = verTodos ? 'Volver a filtrar por fecha' : 'Ver todos (sin filtro de fecha)';
    cargarPedidos();
  });

  cargarPedidos();
  setInterval(cargarPedidos, AUTO_REFRESH_MS);
})();
