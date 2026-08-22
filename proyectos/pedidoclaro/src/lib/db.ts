export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
}

export async function findClienteByTelefono(db: D1Database, telefono: string): Promise<Cliente | null> {
  return db
    .prepare('SELECT id, nombre, telefono FROM clientes WHERE telefono = ?')
    .bind(telefono)
    .first<Cliente>();
}

export async function crearCliente(
  db: D1Database,
  id: string,
  nombre: string,
  telefono: string,
  direccion?: string | null
): Promise<void> {
  await db
    .prepare('INSERT INTO clientes (id, nombre, telefono, direccion) VALUES (?, ?, ?, ?)')
    .bind(id, nombre, telefono, direccion ?? null)
    .run();
}

export interface Vendedor {
  id: string;
  nombre: string;
}

export async function findVendedorActivo(db: D1Database, vendedorId: string): Promise<Vendedor | null> {
  return db
    .prepare('SELECT id, nombre FROM vendedores WHERE id = ? AND activo = 1')
    .bind(vendedorId)
    .first<Vendedor>();
}

export interface NuevoPedido {
  id: string;
  cliente_id: string;
  vendedor_id: string;
  productos: string;
  monto: number;
  fecha_entrega: string;
  notas: string | null;
  pos_origen: string;
  pos_ref_id: string | null;
}

export async function crearPedido(db: D1Database, pedido: NuevoPedido): Promise<void> {
  await db
    .prepare(
      `INSERT INTO pedidos
         (id, cliente_id, vendedor_id, productos, monto, fecha_entrega, estatus, notas, pos_origen, pos_ref_id)
       VALUES (?, ?, ?, ?, ?, ?, 'nuevo', ?, ?, ?)`
    )
    .bind(
      pedido.id,
      pedido.cliente_id,
      pedido.vendedor_id,
      pedido.productos,
      pedido.monto,
      pedido.fecha_entrega,
      pedido.notas,
      pedido.pos_origen,
      pedido.pos_ref_id
    )
    .run();
}

export async function findPedidoByPosRef(
  db: D1Database,
  posOrigen: string,
  posRefId: string
): Promise<{ id: string } | null> {
  return db
    .prepare('SELECT id FROM pedidos WHERE pos_origen = ? AND pos_ref_id = ?')
    .bind(posOrigen, posRefId)
    .first<{ id: string }>();
}

export interface NuevaNotificacion {
  pedido_id: string | null;
  tipo: string;
  destinatario: string;
  mensaje: string;
  enviado: boolean;
}

export async function logNotificacion(db: D1Database, n: NuevaNotificacion): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notificaciones_log (id, pedido_id, tipo, destinatario, mensaje, enviado)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), n.pedido_id, n.tipo, n.destinatario, n.mensaje, n.enviado ? 1 : 0)
    .run();
}
