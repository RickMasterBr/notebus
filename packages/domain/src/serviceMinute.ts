/** Minuto de serviço (D-016) → "HH:MM". Passa de 24:00 para viagens após a meia-noite. */
export function formatServiceMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
