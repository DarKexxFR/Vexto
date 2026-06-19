/** French-locale formatting helpers shared across screens. */

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("fr-FR");
}

/** "1,25 kg" — two decimals, comma separator. */
export function formatKg(kg: number): string {
  return `${kg.toFixed(2).replace(".", ",")} kg`;
}

/** Display CO2 in g below 1 kg, otherwise in kg. */
export function formatCo2(kg: number): string {
  if (kg < 1) return `${formatInt(kg * 1000)} g`;
  return formatKg(kg);
}

export function formatKm(km: number): string {
  return `${km.toFixed(1).replace(".", ",")} km`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h} h ${String(m).padStart(2, "0")}`;
}
