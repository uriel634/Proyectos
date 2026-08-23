-- PedidoClaro — esquema inicial (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  direccion TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendedores (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  activo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY,
  cliente_id TEXT NOT NULL REFERENCES clientes(id),
  vendedor_id TEXT NOT NULL REFERENCES vendedores(id),
  productos TEXT,
  monto REAL NOT NULL,
  fecha_entrega TEXT NOT NULL,
  estatus TEXT DEFAULT 'nuevo',
  notas TEXT,
  pos_origen TEXT,
  pos_ref_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notificaciones_log (
  id TEXT PRIMARY KEY,
  pedido_id TEXT REFERENCES pedidos(id),
  tipo TEXT,
  destinatario TEXT,
  mensaje TEXT,
  enviado INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estatus ON pedidos(estatus);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_entrega ON pedidos(fecha_entrega);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON pedidos(cliente_id);

-- Deduplicación de sincronización con POS externos
CREATE INDEX IF NOT EXISTS idx_pedidos_pos_origen_ref ON pedidos(pos_origen, pos_ref_id);

-- Búsqueda de cliente existente por teléfono (Worker 1)
CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);
