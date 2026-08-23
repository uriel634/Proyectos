import type { Env } from '../types';

export interface ResultadoEnvio {
  enviado: boolean;
  error?: string;
}

export async function enviarWhatsApp(env: Env, to: string, body: string): Promise<ResultadoEnvio> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  const params = new URLSearchParams({
    From: `whatsapp:${env.TWILIO_WHATSAPP_FROM}`,
    To: `whatsapp:${to}`,
    Body: body,
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const texto = await res.text();
      return { enviado: false, error: `Twilio respondió ${res.status}: ${texto}` };
    }

    return { enviado: true };
  } catch (err) {
    return { enviado: false, error: err instanceof Error ? err.message : 'Error desconocido al llamar a Twilio' };
  }
}
