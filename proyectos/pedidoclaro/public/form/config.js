// Configuración del formulario. Edita estos valores para tu despliegue.

// URL del Worker de PedidoClaro (sin slash final).
const API_BASE = 'https://pedidoclaro.urieel.workers.dev';

// Lista de vendedores para el selector. El id debe coincidir con el id
// (UUID) de la tabla `vendedores` en D1. No hay endpoint público para
// listar vendedores, así que se mantiene aquí a mano.
const VENDEDORES = [
  { id: '9613b750-4495-42f2-9200-98dfd37ac9c5', nombre: 'DLIA' },
];
