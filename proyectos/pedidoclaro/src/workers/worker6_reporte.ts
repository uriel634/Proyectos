import type { Env } from '../types';
import { logNotificacion } from '../lib/db';
import { fechaAyerMexico, fechaHoyMexico } from '../lib/fecha';
import { enviarWhatsApp } from '../lib/twilio';

const UMBRAL_CRITICO_MIN = 30;

interface PedidoPendiente {
  cliente_nombre: string;
  monto: number;
  vendedor_nombre: string;
}

interface DuracionPreparacion {
  pedido_id: string;
  minutos: number;
}

export async function ejecutarReporteMatutino(env: Env): Promise<void> {
  const hoy = fechaHoyMexico();
  const ayer = fechaAyerMexico();

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

  const fallosAyer = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM notificaciones_log WHERE date(created_at) = ? AND enviado = 0`
  )
    .bind(ayer)
    .first<{ n: number }>();

  // Duración de cada paso por "preparando" que ocurrió ayer, usando el
  // historial de pedido_eventos (LEAD da el siguiente evento del mismo pedido).
  const duraciones = await env.DB.prepare(
    `WITH eventos AS (
       SELECT pedido_id, estatus, created_at,
              LEAD(created_at) OVER (PARTITION BY pedido_id ORDER BY created_at) as siguiente_at
       FROM pedido_eventos
     )
     SELECT pedido_id,
            (julianday(siguiente_at) - julianday(created_at)) * 24 * 60 as minutos
     FROM eventos
     WHERE estatus = 'preparando' AND siguiente_at IS NOT NULL AND date(created_at) = ?`
  )
    .bind(ayer)
    .all<DuracionPreparacion>();

  const pendientes = sinMoverAyer.results ?? [];
  const listaDuraciones = duraciones.results ?? [];
  const promedioPreparacion =
    listaDuraciones.length > 0
      ? Math.round(listaDuraciones.reduce((suma, d) => suma + d.minutos, 0) / listaDuraciones.length)
      : null;
  const cruzaronUmbral = listaDuraciones.filter((d) => d.minutos >= UMBRAL_CRITICO_MIN).length;

  let mensaje = `📊 *Reporte PedidoClaro — ${hoy}*

Buenos días. Resumen del día:

🟠 Pedidos nuevos hoy: ${nuevosHoy?.n ?? 0}
🟡 En preparación: ${preparandoHoy?.n ?? 0}
🔴 Sin mover de ayer: ${pendientes.length}
💰 Facturado ayer: $${facturadoAyer?.total ?? 0} MXN`;

  if (promedioPreparacion !== null) {
    mensaje += `\n⏱ Tiempo promedio de preparación ayer: ${promedioPreparacion} min`;
  }
  if (cruzaronUmbral > 0) {
    mensaje += `\n⚠️ Pedidos que tardaron más de ${UMBRAL_CRITICO_MIN} min en prepararse: ${cruzaronUmbral}`;
  }
  if ((fallosAyer?.n ?? 0) > 0) {
    mensaje += `\n📵 Mensajes de WhatsApp que fallaron ayer: ${fallosAyer?.n}`;
  }

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
