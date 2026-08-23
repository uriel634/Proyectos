import type { Env } from '../types';
import { logNotificacion } from '../lib/db';
import { enviarWhatsApp } from '../lib/twilio';

interface PedidoPendiente {
  cliente_nombre: string;
  monto: number;
  vendedor_nombre: string;
}

function restarUnDia(fechaIso: string): string {
  const fecha = new Date(`${fechaIso}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - 1);
  return fecha.toISOString().slice(0, 10);
}

export async function ejecutarReporteMatutino(env: Env): Promise<void> {
  const hoy = new Date().toISOString().slice(0, 10);
  const ayer = restarUnDia(hoy);

  const nuevosHoy = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM pedidos WHERE date(created_at) = ? AND estatus = 'nuevo'`
  )
    .bind(hoy)
    .first<{ n: number }>();

  const preparandoHoy = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM pedidos WHERE date(created_at) = ? AND estatus = 'preparando'`
  )
    .bind(hoy)
    .first<{ n: number }>();

  const sinMoverAyer = await env.DB.prepare(
    `SELECT c.nombre as cliente_nombre, p.monto, v.nombre as vendedor_nombre
     FROM pedidos p
     JOIN clientes c ON c.id = p.cliente_id
     JOIN vendedores v ON v.id = p.vendedor_id
     WHERE date(p.created_at) = ? AND p.estatus NOT IN ('entregado', 'cancelado')`
  )
    .bind(ayer)
    .all<PedidoPendiente>();

  const facturadoAyer = await env.DB.prepare(
    `SELECT SUM(monto) as total FROM pedidos WHERE date(created_at) = ? AND estatus != 'cancelado'`
  )
    .bind(ayer)
    .first<{ total: number | null }>();

  const pendientes = sinMoverAyer.results ?? [];

  let mensaje = `📊 *Reporte PedidoClaro — ${hoy}*

Buenos días. Resumen del día:

🟠 Pedidos nuevos hoy: ${nuevosHoy?.n ?? 0}
🟡 En preparación: ${preparandoHoy?.n ?? 0}
🔴 Sin mover de ayer: ${pendientes.length}
💰 Facturado ayer: $${facturadoAyer?.total ?? 0} MXN`;

  if (pendientes.length > 0) {
    mensaje += `\n\n⚠️ Pendientes de ayer:\n`;
    mensaje += pendientes.map((p) => `- ${p.cliente_nombre} · $${p.monto} · ${p.vendedor_nombre}`).join('\n');
  }

  const resultado = await enviarWhatsApp(env, env.DUENO_TELEFONO, mensaje);

  await logNotificacion(env.DB, {
    pedido_id: null,
    tipo: 'reporte',
    destinatario: env.DUENO_TELEFONO,
    mensaje,
    enviado: resultado.enviado,
  });
}
