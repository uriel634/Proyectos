import type { Env } from '../types';
import { logNotificacion } from '../lib/db';
import { enviarWhatsApp } from '../lib/twilio';

const UMBRAL_CRITICO_MIN = 30;

interface PedidoEnEspera {
  id: string;
  cliente_nombre: string;
  productos: string;
  monto: number;
  vendedor_nombre: string;
  vendedor_telefono: string;
  minutos: number;
}

/**
 * Corre en cada tick del cron de 5 minutos. Avisa al vendedor —no al
 * cliente— cuando un pedido lleva más de UMBRAL_CRITICO_MIN preparándose,
 * para que sea él quien decida si le avisa directamente al cliente.
 * `alerta_espera_enviada` evita mandarla más de una vez por pedido.
 */
export async function revisarEsperasLargas(env: Env): Promise<void> {
  const pendientes = await env.DB.prepare(
    `SELECT p.id, c.nombre as cliente_nombre, p.productos, p.monto,
            v.nombre as vendedor_nombre, v.telefono as vendedor_telefono,
            CAST((julianday('now') - julianday(p.updated_at)) * 24 * 60 AS INTEGER) as minutos
     FROM pedidos p
     JOIN clientes c ON c.id = p.cliente_id
     JOIN vendedores v ON v.id = p.vendedor_id
     WHERE p.estatus = 'preparando'
       AND p.alerta_espera_enviada = 0
       AND (julianday('now') - julianday(p.updated_at)) * 24 * 60 >= ?`
  )
    .bind(UMBRAL_CRITICO_MIN)
    .all<PedidoEnEspera>();

  for (const pedido of pendientes.results ?? []) {
    const mensaje = `⚠️ *Pedido con demora*

El pedido de ${pedido.cliente_nombre} lleva ${pedido.minutos} min en preparación.
📦 ${pedido.productos}
💰 $${pedido.monto} MXN

Quizás quieras avisarle tú directamente.`;

    const resultado = await enviarWhatsApp(env, pedido.vendedor_telefono, mensaje);

    await logNotificacion(env.DB, {
      pedido_id: pedido.id,
      tipo: 'espera_larga',
      destinatario: pedido.vendedor_telefono,
      mensaje,
      enviado: resultado.enviado,
    });

    await env.DB.prepare('UPDATE pedidos SET alerta_espera_enviada = 1 WHERE id = ?').bind(pedido.id).run();
  }
}
