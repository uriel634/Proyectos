// Configuración del tablero. Edita estos valores para tu despliegue.

// URL del Worker de PedidoClaro (sin slash final).
const API_BASE = 'https://pedidoclaro.urieel.workers.dev';

// Lista de vendedores para el filtro. El id debe coincidir con el id
// (UUID) de la tabla `vendedores` en D1.
const VENDEDORES = [
  { id: '9613b750-4495-42f2-9200-98dfd37ac9c5', nombre: 'DLIA' },
];

const AUTO_REFRESH_MS = 30000;
