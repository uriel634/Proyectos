import type { Env } from '../types';
import { jsonResponse } from '../lib/cors';

const ESTATUS_POSIBLES = ['nuevo', 'preparando', 'en_camino', 'entregado', 'cancelado'] as const;

interface FilaPedido {
  id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  vendedor_nombre: string;
  productos: string;
  monto: number;
  fecha_entrega: string;
  estatus: string;
  notas: string | null;
  created_at: string;
}

interface FilaKpi {
  estatus: string;
  n: number;
  total: number | null;
}

function fechaHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleConsultarPedidos(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const fecha = url.searchParams.get('fecha') || fechaHoy();
    const estatus = url.searchParams.get('estatus');
    const vendedorId = url.searchParams.get('vendedor_id');

    // KPIs: siempre sobre el día completo, sin aplicar los filtros de estatus/vendedor.
    const kpiRows = await env.DB.prepare(
      `SELECT estatus, COUNT(*) as n, SUM(monto) as total
       FROM pedidos WHERE fecha_entrega = ? GROUP BY estatus`
    )
      .bind(fecha)
      .all<FilaKpi>();

    const porEstatus: Record<string, number> = {
      nuevo: 0,
      preparando: 0,
      en_camino: 0,
      entregado: 0,
      cancelado: 0,
    };
    let totalPedidos = 0;
    let montoTotalDia = 0;
    for (const fila of kpiRows.results ?? []) {
      if (ESTATUS_POSIBLES.includes(fila.estatus as (typeof ESTATUS_POSIBLES)[number])) {
        porEstatus[fila.estatus] = fila.n;
      }
      totalPedidos += fila.n;
      montoTotalDia += fila.total ?? 0;
    }

    // Listado: aplica todos los filtros recibidos.
    const condiciones = ['p.fecha_entrega = ?'];
    const valores: unknown[] = [fecha];
    if (estatus) {
      condiciones.push('p.estatus = ?');
      valores.push(estatus);
    }
    if (vendedorId) {
      condiciones.push('p.vendedor_id = ?');
      valores.push(vendedorId);
    }

    const pedidosResult = await env.DB.prepare(
      `SELECT p.id, c.nombre as cliente_nombre, c.telefono as cliente_telefono,
              v.nombre as vendedor_nombre, p.productos, p.monto, p.fecha_entrega,
              p.estatus, p.notas, p.created_at
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN vendedores v ON v.id = p.vendedor_id
       WHERE ${condiciones.join(' AND ')}
       ORDER BY p.created_at DESC`
    )
      .bind(...valores)
      .all<FilaPedido>();

    return jsonResponse({
      kpis: {
        total_pedidos: totalPedidos,
        por_estatus: porEstatus,
        monto_total_dia: montoTotalDia,
      },
      pedidos: pedidosResult.results ?? [],
    });
  } catch (err) {
    console.error('Error consultando pedidos:', err);
    return jsonResponse({ success: false, error: 'Error interno al consultar pedidos' }, 500);
  }
}
