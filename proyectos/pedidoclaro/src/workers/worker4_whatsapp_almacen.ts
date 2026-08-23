import type { Env } from '../types';
import { logNotificacion } from '../lib/db';
import { enviarWhatsApp, type ResultadoEnvio } from '../lib/twilio';

export interface AlertaAlmacenParams {
  pedido_id: string;
  productos: string;
  monto: number;
  fecha_entrega: string;
  cliente_nombre: string;
  vendedor_nombre: string;
  tipo_entrega: string;
}

/**
 * Worker 4 — WhatsApp de alerta al almacén.
 * Función interna, no expone endpoint HTTP; se llama desde el Worker 1.
 */
export async function enviarAlertaAlmacen(env: Env, p: AlertaAlmacenParams): Promise<ResultadoEnvio> {
  const etiquetaEntrega = p.tipo_entrega === 'tienda' ? '🏬 RECOGE EN TIENDA' : '🚚 Domicilio';

  const mensaje = `🔔 *Pedido nuevo para preparar*

Cliente: ${p.cliente_nombre}
📦 ${p.productos}
💰 $${p.monto} MXN
🗓 Fecha: ${p.fecha_entrega}
${etiquetaEntrega}
👤 Vendedor: ${p.vendedor_nombre}

Marca como 'preparando' en el tablero.`;

  const resultado = await enviarWhatsApp(env, env.ALMACEN_TELEFONO, mensaje);

  await logNotificacion(env.DB, {
    pedido_id: p.pedido_id,
    tipo: 'almacen',
    destinatario: env.ALMACEN_TELEFONO,
    mensaje,
    enviado: resultado.enviado,
  });

  return resultado;
}
