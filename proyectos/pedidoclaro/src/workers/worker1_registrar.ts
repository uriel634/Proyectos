import type { Env } from '../types';
import { jsonResponse } from '../lib/cors';
import { crearCliente, crearPedido, findClienteByTelefono, findVendedorActivo, logEventoPedido } from '../lib/db';
import { enviarConfirmacionCliente } from './worker3_whatsapp_cliente';
import { enviarAlertaAlmacen } from './worker4_whatsapp_almacen';

export class ValidationError extends Error {}

export interface RegistrarPedidoInput {
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_direccion?: string;
  productos: string;
  monto: number;
  fecha_entrega: string;
  vendedor_id: string;
  notas?: string;
  pos_origen?: string;
  pos_ref_id?: string;
  tipo_entrega?: string;
}

const TIPOS_ENTREGA_VALIDOS = ['tienda', 'domicilio'] as const;
const TELEFONO_E164 = /^\+\d{10,15}$/;

const CAMPOS_REQUERIDOS = [
  'cliente_nombre',
  'cliente_telefono',
  'productos',
  'monto',
  'fecha_entrega',
  'vendedor_id',
] as const;

function validar(input: Partial<RegistrarPedidoInput>): void {
  for (const campo of CAMPOS_REQUERIDOS) {
    const valor = input[campo];
    if (valor === undefined || valor === null || valor === '') {
      throw new ValidationError(`Falta el campo requerido: ${campo}`);
    }
  }
  if (typeof input.monto !== 'number' || Number.isNaN(input.monto) || input.monto <= 0) {
    throw new ValidationError('monto debe ser un número mayor a 0');
  }
  if (input.cliente_telefono && !TELEFONO_E164.test(input.cliente_telefono)) {
    throw new ValidationError(
      'cliente_telefono debe incluir código de país, formato +52XXXXXXXXXX (sin espacios ni guiones)'
    );
  }
  if (input.tipo_entrega && !TIPOS_ENTREGA_VALIDOS.includes(input.tipo_entrega as (typeof TIPOS_ENTREGA_VALIDOS)[number])) {
    throw new ValidationError(`tipo_entrega debe ser uno de: ${TIPOS_ENTREGA_VALIDOS.join(', ')}`);
  }
}

/**
 * Núcleo del Worker 1. Se usa tanto desde el endpoint HTTP POST /pedido
 * como internamente desde el Worker 7 (sync POS), evitando una vuelta
 * HTTP extra dentro del mismo Worker.
 */
export async function registrarPedido(
  env: Env,
  input: RegistrarPedidoInput
): Promise<{ pedido_id: string }> {
  validar(input);

  const vendedor = await findVendedorActivo(env.DB, input.vendedor_id);
  if (!vendedor) {
    throw new ValidationError('vendedor_id no existe o no está activo');
  }

  let clienteId: string;
  const clienteExistente = await findClienteByTelefono(env.DB, input.cliente_telefono);
  if (clienteExistente) {
    clienteId = clienteExistente.id;
  } else {
    clienteId = crypto.randomUUID();
    await crearCliente(env.DB, clienteId, input.cliente_nombre, input.cliente_telefono, input.cliente_direccion);
  }

  const tipoEntrega = input.tipo_entrega ?? 'domicilio';

  const pedidoId = crypto.randomUUID();
  await crearPedido(env.DB, {
    id: pedidoId,
    cliente_id: clienteId,
    vendedor_id: input.vendedor_id,
    productos: input.productos,
    monto: input.monto,
    fecha_entrega: input.fecha_entrega,
    notas: input.notas ?? null,
    pos_origen: input.pos_origen ?? 'manual',
    pos_ref_id: input.pos_ref_id ?? null,
    tipo_entrega: tipoEntrega,
  });
  await logEventoPedido(env.DB, pedidoId, 'nuevo');

  const paramsWhatsApp = {
    pedido_id: pedidoId,
    cliente_telefono: input.cliente_telefono,
    cliente_nombre: input.cliente_nombre,
    productos: input.productos,
    monto: input.monto,
    fecha_entrega: input.fecha_entrega,
    vendedor_nombre: vendedor.nombre,
    tipo_entrega: tipoEntrega,
  };

  // No bloquea la respuesta del pedido si WhatsApp falla; ambos envíos
  // quedan registrados en notificaciones_log con enviado=0 si fallan.
  await Promise.allSettled([
    enviarConfirmacionCliente(env, paramsWhatsApp),
    enviarAlertaAlmacen(env, paramsWhatsApp),
  ]);

  return { pedido_id: pedidoId };
}

export async function handleRegistrarPedido(request: Request, env: Env): Promise<Response> {
  let body: Partial<RegistrarPedidoInput>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'JSON inválido' }, 400);
  }

  try {
    const { pedido_id } = await registrarPedido(env, body as RegistrarPedidoInput);
    return jsonResponse({ success: true, pedido_id, mensaje: 'Pedido registrado' });
  } catch (err) {
    if (err instanceof ValidationError) {
      return jsonResponse({ success: false, error: err.message }, 400);
    }
    console.error('Error registrando pedido:', err);
    return jsonResponse({ success: false, error: 'Error interno al registrar el pedido' }, 500);
  }
}
