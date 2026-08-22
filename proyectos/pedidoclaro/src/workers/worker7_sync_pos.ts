import type { Env } from '../types';
import { jsonResponse } from '../lib/cors';
import { findPedidoByPosRef, logNotificacion } from '../lib/db';
import { registrarPedido, ValidationError } from './worker1_registrar';

export interface ResultadoSync {
  sincronizados: number;
  duplicados: number;
  errores: number;
}

function vacio(): ResultadoSync {
  return { sincronizados: 0, duplicados: 0, errores: 0 };
}

export async function syncPos(env: Env): Promise<ResultadoSync> {
  switch (env.POS_TIPO) {
    case 'alegra':
      return syncAlegra(env);
    case 'sheets':
      return syncSheets(env);
    case 'csv':
      return syncCsv(env);
    default:
      return vacio();
  }
}

// ---------------------------------------------------------------------------
// Alegra
// ---------------------------------------------------------------------------

interface AlegraItem {
  name: string;
  quantity?: number;
}

interface AlegraFactura {
  id: number | string;
  client?: { name?: string; phonePrimary?: string; phoneMobile?: string };
  items?: AlegraItem[];
  total?: number | string;
  dueDate?: string;
}

async function syncAlegra(env: Env): Promise<ResultadoSync> {
  const resultado = vacio();
  if (!env.ALEGRA_EMAIL || !env.ALEGRA_TOKEN) return resultado;

  const auth = btoa(`${env.ALEGRA_EMAIL}:${env.ALEGRA_TOKEN}`);
  const url = 'https://api.alegra.com/api/v1/invoices?order_creation-date=today&status=open';

  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) {
    resultado.errores++;
    return resultado;
  }

  const facturas: AlegraFactura[] = await res.json();
  for (const factura of facturas) {
    const posRefId = String(factura.id);
    const existente = await findPedidoByPosRef(env.DB, 'alegra', posRefId);
    if (existente) {
      resultado.duplicados++;
      continue;
    }

    const telefono = factura.client?.phonePrimary || factura.client?.phoneMobile || '';
    const vendedorId = env.DEFAULT_VENDEDOR_ID;
    if (!telefono || !vendedorId) {
      resultado.errores++;
      continue;
    }

    try {
      await registrarPedido(env, {
        cliente_nombre: factura.client?.name ?? 'Cliente Alegra',
        cliente_telefono: telefono,
        productos: (factura.items ?? []).map((i) => `${i.quantity ?? 1}x ${i.name}`).join(', '),
        monto: Number(factura.total) || 0,
        fecha_entrega: factura.dueDate ?? new Date().toISOString().slice(0, 10),
        vendedor_id: vendedorId,
        pos_origen: 'alegra',
        pos_ref_id: posRefId,
      });
      resultado.sincronizados++;
    } catch (err) {
      console.error('Error sincronizando factura Alegra:', posRefId, err instanceof ValidationError ? err.message : err);
      resultado.errores++;
    }
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------

const RANGO_SHEETS = 'Pedidos!A2:I';
// Columnas esperadas: cliente_nombre | telefono | productos | monto | fecha_entrega
//                     | vendedor_id | notas | pos_ref_id | sincronizado

async function syncSheets(env: Env): Promise<ResultadoSync> {
  const resultado = vacio();
  if (!env.SHEETS_ID || !env.SHEETS_API_KEY) return resultado;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEETS_ID}/values/${encodeURIComponent(
    RANGO_SHEETS
  )}?key=${env.SHEETS_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    resultado.errores++;
    return resultado;
  }

  const data = await res.json<{ values?: string[][] }>();
  const filas = data.values ?? [];

  for (let i = 0; i < filas.length; i++) {
    const [
      clienteNombre = '',
      telefono = '',
      productos = '',
      monto = '',
      fechaEntrega = '',
      vendedorId = '',
      notas = '',
      posRefIdCol = '',
      sincronizado = '',
    ] = filas[i] ?? [];

    if (sincronizado) continue;

    const numeroFila = i + 2; // A2 es la primera fila de datos
    const posRefId = posRefIdCol || `sheets-fila-${numeroFila}`;

    const existente = await findPedidoByPosRef(env.DB, 'sheets', posRefId);
    if (existente) {
      resultado.duplicados++;
      continue;
    }

    try {
      await registrarPedido(env, {
        cliente_nombre: clienteNombre,
        cliente_telefono: telefono,
        productos,
        monto: Number(monto),
        fecha_entrega: fechaEntrega,
        vendedor_id: vendedorId || env.DEFAULT_VENDEDOR_ID || '',
        notas,
        pos_origen: 'sheets',
        pos_ref_id: posRefId,
      });
      resultado.sincronizados++;
      await marcarFilaSincronizada(env, numeroFila);
    } catch (err) {
      console.error('Error sincronizando fila de Sheets:', numeroFila, err instanceof ValidationError ? err.message : err);
      resultado.errores++;
    }
  }

  return resultado;
}

async function marcarFilaSincronizada(env: Env, numeroFila: number): Promise<void> {
  const rango = `Pedidos!I${numeroFila}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEETS_ID}/values/${encodeURIComponent(
    rango
  )}?valueInputOption=RAW&key=${env.SHEETS_API_KEY}`;
  // Nota: escribir en Sheets normalmente requiere OAuth2/cuenta de servicio;
  // una API key sola sólo garantiza lectura. Se deja esta llamada lista para
  // cuando SHEETS_API_KEY se reemplace por credenciales con permiso de escritura.
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ range: rango, majorDimension: 'ROWS', values: [['si']] }),
  });
}

// ---------------------------------------------------------------------------
// CSV vía email (Gmail API)
// ---------------------------------------------------------------------------

interface GmailPart {
  filename?: string;
  body?: { attachmentId?: string };
  parts?: GmailPart[];
}

function encontrarAdjuntoCsv(payload: GmailPart | undefined): GmailPart | null {
  if (!payload) return null;
  if (payload.filename?.toLowerCase().endsWith('.csv') && payload.body?.attachmentId) {
    return payload;
  }
  for (const parte of payload.parts ?? []) {
    const encontrado = encontrarAdjuntoCsv(parte);
    if (encontrado) return encontrado;
  }
  return null;
}

function base64UrlDecode(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function parsearCsv(texto: string): Record<string, string>[] {
  const lineas = texto.trim().split(/\r?\n/);
  if (lineas.length < 2) return [];
  const encabezados = lineas[0]!.split(',').map((h) => h.trim());
  return lineas.slice(1).map((linea) => {
    const valores = linea.split(',').map((v) => v.trim());
    const fila: Record<string, string> = {};
    encabezados.forEach((h, i) => {
      fila[h] = valores[i] ?? '';
    });
    return fila;
  });
}

async function syncCsv(env: Env): Promise<ResultadoSync> {
  const resultado = vacio();
  if (!env.GMAIL_TOKEN) return resultado;

  const headers = { Authorization: `Bearer ${env.GMAIL_TOKEN}` };
  const q = encodeURIComponent('(subject:pedidos OR subject:export) has:attachment newer_than:1d');
  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}`, { headers });
  if (!listRes.ok) {
    resultado.errores++;
    return resultado;
  }

  const listData = await listRes.json<{ messages?: { id: string }[] }>();

  for (const msg of listData.messages ?? []) {
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, { headers });
    if (!msgRes.ok) {
      resultado.errores++;
      continue;
    }
    const msgData = await msgRes.json<{ payload?: GmailPart }>();
    const adjunto = encontrarAdjuntoCsv(msgData.payload);
    if (!adjunto?.body?.attachmentId) continue;

    const attRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${adjunto.body.attachmentId}`,
      { headers }
    );
    if (!attRes.ok) {
      resultado.errores++;
      continue;
    }
    const attData = await attRes.json<{ data: string }>();
    const filas = parsearCsv(base64UrlDecode(attData.data));

    for (const fila of filas) {
      const posRefId = fila.pos_ref_id || `${msg.id}-${fila.cliente_telefono}`;
      const existente = await findPedidoByPosRef(env.DB, 'csv', posRefId);
      if (existente) {
        resultado.duplicados++;
        continue;
      }

      try {
        await registrarPedido(env, {
          cliente_nombre: fila.cliente_nombre ?? '',
          cliente_telefono: fila.cliente_telefono ?? '',
          productos: fila.productos ?? '',
          monto: Number(fila.monto),
          fecha_entrega: fila.fecha_entrega ?? '',
          vendedor_id: fila.vendedor_id || env.DEFAULT_VENDEDOR_ID || '',
          notas: fila.notas,
          pos_origen: 'csv',
          pos_ref_id: posRefId,
        });
        resultado.sincronizados++;
      } catch (err) {
        console.error('Error sincronizando fila CSV:', posRefId, err instanceof ValidationError ? err.message : err);
        resultado.errores++;
      }
    }
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Endpoint HTTP + registro en notificaciones_log
// ---------------------------------------------------------------------------

export async function ejecutarSyncYRegistrar(env: Env): Promise<ResultadoSync> {
  const resultado = await syncPos(env);
  await logNotificacion(env.DB, {
    pedido_id: null,
    tipo: 'sync_pos',
    destinatario: env.POS_TIPO ?? 'ninguno',
    mensaje: `Sync POS (${env.POS_TIPO ?? 'ninguno'}): ${resultado.sincronizados} sincronizados, ${resultado.duplicados} duplicados, ${resultado.errores} errores`,
    enviado: true,
  });
  return resultado;
}

export async function handleSyncPos(request: Request, env: Env): Promise<Response> {
  try {
    const resultado = await ejecutarSyncYRegistrar(env);
    return jsonResponse(resultado);
  } catch (err) {
    console.error('Error en sync POS:', err);
    return jsonResponse({ sincronizados: 0, duplicados: 0, errores: 1, error: 'Error interno en sync' }, 500);
  }
}
