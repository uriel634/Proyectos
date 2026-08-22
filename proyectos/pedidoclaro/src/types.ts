export interface Env {
  DB: D1Database;

  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_WHATSAPP_FROM: string;

  ALMACEN_TELEFONO: string;
  DUENO_TELEFONO: string;

  ALEGRA_EMAIL?: string;
  ALEGRA_TOKEN?: string;

  SHEETS_ID?: string;
  SHEETS_API_KEY?: string;

  GMAIL_TOKEN?: string;

  POS_TIPO?: 'alegra' | 'sheets' | 'csv';

  // Vendedor usado cuando un pedido sincronizado desde un POS externo
  // no trae vendedor asignado (los POS externos no siempre tienen ese concepto).
  DEFAULT_VENDEDOR_ID?: string;
}
