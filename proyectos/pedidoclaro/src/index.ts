import type { Env } from './types';
import { handleOptions, jsonResponse } from './lib/cors';
import { handleRegistrarPedido } from './workers/worker1_registrar';
import { handleConsultarPedidos } from './workers/worker2_pedidos';
import { handleActualizarEstatus } from './workers/worker5_estatus';
import { ejecutarReporteMatutino } from './workers/worker6_reporte';
import { ejecutarSyncYRegistrar, handleSyncPos } from './workers/worker7_sync_pos';

const CRON_REPORTE_MATUTINO = '0 14 * * *';
const CRON_SYNC_POS = '*/5 * * * *';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return handleOptions();

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/pedido' && request.method === 'POST') {
        return await handleRegistrarPedido(request, env);
      }

      if (path === '/pedidos' && request.method === 'GET') {
        return await handleConsultarPedidos(request, env);
      }

      const estatusMatch = path.match(/^\/pedido\/([^/]+)\/estatus$/);
      if (estatusMatch && request.method === 'PATCH') {
        return await handleActualizarEstatus(request, env, estatusMatch[1]!);
      }

      if (path === '/sync/pos' && request.method === 'POST') {
        return await handleSyncPos(request, env);
      }

      return jsonResponse({ success: false, error: 'Ruta no encontrada' }, 404);
    } catch (err) {
      console.error('Error no controlado:', err);
      return jsonResponse({ success: false, error: 'Error interno del servidor' }, 500);
    }
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === CRON_REPORTE_MATUTINO) {
      ctx.waitUntil(ejecutarReporteMatutino(env));
    } else if (event.cron === CRON_SYNC_POS) {
      ctx.waitUntil(ejecutarSyncYRegistrar(env));
    }
  },
};
