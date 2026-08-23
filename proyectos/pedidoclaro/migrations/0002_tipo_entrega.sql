-- PedidoClaro — agrega tipo de entrega (pickup en tienda vs domicilio)

ALTER TABLE pedidos ADD COLUMN tipo_entrega TEXT DEFAULT 'domicilio';
