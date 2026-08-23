-- PedidoClaro — historial de estatus (para medir tiempos por etapa)
-- y bandera para no repetir la alerta de espera larga.

CREATE TABLE IF NOT EXISTS pedido_eventos (
  id TEXT PRIMARY KEY,
  pedido_id TEXT NOT NULL REFERENCES pedidos(id),
  estatus TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pedido_eventos_pedido_id ON pedido_eventos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_eventos_created_at ON pedido_eventos(created_at);

ALTER TABLE pedidos ADD COLUMN alerta_espera_enviada INTEGER DEFAULT 0;
