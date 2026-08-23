import type { Env } from '../types';
import { logNotificacion } from '../lib/db';
import { enviarWhatsApp, type ResultadoEnvio } from '../lib/twilio';

export interface ConfirmacionClienteParams {
  pedido_id: string;
  cliente_telefono: string;
  cliente_nombre: string;
  productos: string;
  monto: number;
  fecha_entrega: string;
  vendedor_nombre: string;
  tipo_entrega: string;
}

/**
 * Worker 3 — WhatsApp de confirmación al cliente.
 * Función interna, no expone endpoint HTTP; se llama desde el Worker 1.
 */
export async function enviarConfirmacionCliente(
  env: Env,
  p: ConfirmacionClienteParams
): Promise<ResultadoEnvio> {
  const lineaEntrega =
    p.tipo_entrega === 'tienda'
      ? 'Pasarás a recogerlo a tienda.'
      : 'Te lo llevamos a tu domicilio.';

  const mensaje = `✅ *Pedido confirmado*

Hola ${p.cliente_nombre}, tu pedido fue registrado:

📦 ${p.productos}
💰 $${p.monto} MXN
🗓 Fecha: ${p.fecha_entrega}
👤 Tu vendedor: ${p.vendedor_nombre}

${lineaEntrega}
Te avisamos en cuanto esté listo.`;

  const resultado = await enviarWhatsApp(env, p.cliente_telefono, mensaje);

  await logNotificacion(env.DB, {
    pedido_id: p.pedido_id,
    tipo: 'confirmacion',
    destinatario: p.cliente_telefono,
    mensaje,
    enviado: resultado.enviado,
  });

  return resultado;
}
