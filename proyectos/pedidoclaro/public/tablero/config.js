// Configuración del tablero. Edita estos valores para tu despliegue.

// URL del Worker de PedidoClaro (sin slash final).
const API_BASE = 'https://pedidoclaro.TU-SUBDOMINIO.workers.dev';

// Lista de vendedores para el filtro. El id debe coincidir con el id
// (UUID) de la tabla `vendedores` en D1.
const VENDEDORES = [
  // { id: 'uuid-del-vendedor', nombre: 'Juan Pérez' },
];

const AUTO_REFRESH_MS = 30000;
