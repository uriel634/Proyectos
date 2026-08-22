import type { Env } from '../types';
import { jsonResponse } from '../lib/cors';
import { logNotificacion } from '../lib/db';
import { enviarWhatsApp } from '../lib/twilio';

const ESTATUS_VALIDOS = ['preparando', 'en_camino', 'entregado', 'cancelado'] as const;
type EstatusValido = (typeof ESTATUS_VALIDOS)[number];

interface FilaPedido {
  id: string;
  monto: number;
  cliente_nombre: string;
  cliente_telefono: string;
}

export async function handleActualizarEstatus(request: Request, env: Env, pedidoId: string): Promise<Response> {
  let body: { estatus?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'JSON inválido' }, 400);
  }

  const estatus = body.estatus;
  if (!estatus || !ESTATUS_VALIDOS.includes(estatus as EstatusValido)) {
    return jsonResponse(
      { success: false, error: `estatus debe ser uno de: ${ESTATUS_VALIDOS.join(', ')}` },
      400
    );
  }

  try {
    const pedido = await env.DB.prepare(
      `SELECT p.id, p.monto, c.nombre as cliente_nombre, c.telefono as cliente_telefono
       FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
       WHERE p.id = ?`
    )
      .bind(pedidoId)
      .first<FilaPedido>();

    if (!pedido) {
      return jsonResponse({ success: false, error: 'Pedido no encontrado' }, 404);
    }

    await env.DB.prepare(`UPDATE pedidos SET estatus = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(estatus, pedidoId)
      .run();

    if (estatus === 'en_camino') {
      const mensaje = `🚚 *Tu pedido va en camino*

${pedido.cliente_nombre}, tu pedido salió a entrega.
Llega en aproximadamente 30–40 min.
¿Alguna duda? Responde aquí.`;
      const resultado = await enviarWhatsApp(env, pedido.cliente_telefono, mensaje);
      await logNotificacion(env.DB, {
        pedido_id: pedidoId,
        tipo: 'en_camino',
        destinatario: pedido.cliente_telefono,
        mensaje,
        enviado: resultado.enviado,
      });
    } else if (estatus === 'entregado') {
      const mensaje = `✅ *Pedido entregado*

${pedido.cliente_nombre}, confirmamos que tu pedido fue entregado. ¡Gracias por tu preferencia!`;
      const resultado = await enviarWhatsApp(env, pedido.cliente_telefono, mensaje);
      await logNotificacion(env.DB, {
        pedido_id: pedidoId,
        tipo: 'entregado',
        destinatario: pedido.cliente_telefono,
        mensaje,
        enviado: resultado.enviado,
      });
    }

    return jsonResponse({ success: true, pedido_id: pedidoId, estatus_nuevo: estatus });
  } catch (err) {
    console.error('Error actualizando estatus:', err);
    return jsonResponse({ success: false, error: 'Error interno al actualizar el estatus' }, 500);
  }
}
