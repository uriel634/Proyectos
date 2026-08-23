import type { Env } from '../types';
import { jsonResponse } from '../lib/cors';
import { fechaHoyMexico } from '../lib/fecha';

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
  tipo_entrega: string;
  created_at: string;
  updated_at: string;
}

interface FilaKpi {
  estatus: string;
  n: number;
  total: number | null;
}

export async function handleConsultarPedidos(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const fechaParam = url.searchParams.get('fecha') || fechaHoyMexico();
    const verTodas = fechaParam === 'todas';
    const estatus = url.searchParams.get('estatus');
    const vendedorId = url.searchParams.get('vendedor_id');

    // KPIs: siempre sobre el día completo (o todo, si verTodas), sin aplicar
    // los filtros de estatus/vendedor.
    const kpiRows = await env.DB.prepare(
      verTodas
        ? `SELECT estatus, COUNT(*) as n, SUM(monto) as total FROM pedidos GROUP BY estatus`
        : `SELECT estatus, COUNT(*) as n, SUM(monto) as total FROM pedidos WHERE fecha_entrega = ? GROUP BY estatus`
    )
      .bind(...(verTodas ? [] : [fechaParam]))
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
    const condiciones: string[] = [];
    const valores: unknown[] = [];
    if (!verTodas) {
      condiciones.push('p.fecha_entrega = ?');
      valores.push(fechaParam);
    }
    if (estatus) {
      condiciones.push('p.estatus = ?');
      valores.push(estatus);
    }
    if (vendedorId) {
      condiciones.push('p.vendedor_id = ?');
      valores.push(vendedorId);
    }

    const clausulaWhere = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const pedidosResult = await env.DB.prepare(
      `SELECT p.id, c.nombre as cliente_nombre, c.telefono as cliente_telefono,
              v.nombre as vendedor_nombre, p.productos, p.monto, p.fecha_entrega,
              p.estatus, p.notas, p.tipo_entrega, p.created_at, p.updated_at
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN vendedores v ON v.id = p.vendedor_id
       ${clausulaWhere}
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
