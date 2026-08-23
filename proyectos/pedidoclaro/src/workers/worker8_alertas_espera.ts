import type { Env } from '../types';
import { logNotificacion } from '../lib/db';
import { enviarWhatsApp } from '../lib/twilio';

const UMBRAL_CRITICO_MIN = 30;

interface PedidoEnEspera {
  id: string;
  cliente_nombre: string;
  cliente_telefono: string;
}

/**
 * Corre en cada tick del cron de 5 minutos. Avisa proactivamente al cliente
 * cuando su pedido lleva más de UMBRAL_CRITICO_MIN preparándose, en vez de
 * dejar que solo el almacén vea la alerta interna en /almacen.
 * `alerta_espera_enviada` evita mandarla más de una vez por pedido.
 */
export async function revisarEsperasLargas(env: Env): Promise<void> {
  const pendientes = await env.DB.prepare(
    `SELECT p.id, c.nombre as cliente_nombre, c.telefono as cliente_telefono
     FROM pedidos p
     JOIN clientes c ON c.id = p.cliente_id
     WHERE p.estatus = 'preparando'
       AND p.alerta_espera_enviada = 0
       AND (julianday('now') - julianday(p.updated_at)) * 24 * 60 >= ?`
  )
    .bind(UMBRAL_CRITICO_MIN)
    .all<PedidoEnEspera>();

  for (const pedido of pendientes.results ?? []) {
    const mensaje = `⏳ *Seguimos trabajando en tu pedido*

${pedido.cliente_nombre}, tu pedido está tardando un poco más de lo esperado.
Seguimos en ello, gracias por tu paciencia.`;

    const resultado = await enviarWhatsApp(env, pedido.cliente_telefono, mensaje);

    await logNotificacion(env.DB, {
      pedido_id: pedido.id,
      tipo: 'espera_larga',
      destinatario: pedido.cliente_telefono,
      mensaje,
      enviado: resultado.enviado,
    });

    await env.DB.prepare('UPDATE pedidos SET alerta_espera_enviada = 1 WHERE id = ?').bind(pedido.id).run();
  }
}
