const ZONA_MEXICO = 'America/Mexico_City';

function formatearFecha(fecha: Date): string {
  // en-CA formatea como YYYY-MM-DD, que es lo que usa el resto del sistema.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_MEXICO }).format(fecha);
}

export function fechaHoyMexico(): string {
  return formatearFecha(new Date());
}

export function fechaAyerMexico(): string {
  return formatearFecha(new Date(Date.now() - 24 * 60 * 60 * 1000));
}
