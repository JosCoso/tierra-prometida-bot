/**
 * Parsea una cadena de texto con hora (ej: "18:00", "6:00 PM", "9 AM")
 * y devuelve los minutos desde la medianoche (0 - 1439).
 * Retorna null si no puede parsear la hora.
 */
export function parseTime(timeStr: string): number | null {
    if (!timeStr) return null;

    const cleanStr = timeStr.trim().toUpperCase();

    // Regex para formatos comunes:
    // 1. "18:00", "6:30" (24h o sin AM/PM explícito)
    // 2. "6:00 PM", "9 AM" (12h con AM/PM)
    // 3. "18 hrs", "18:00 hrs"

    // Intentar extraer horas y minutos
    // Normalizar: quitar puntos de a.m./p.m. y espacios extra
    const normalized = cleanStr.replace(/\./g, "").replace(/\s+/g, " ");

    // Intentar extraer horas y minutos
    const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|HRS|H)?/i);

    if (!match) return null;

    let hours = parseInt(match[1]!, 10);
    let minutes = match[2] ? parseInt(match[2], 10) : 0;
    const modifier = match[3] ? match[3].toUpperCase() : null;

    // Validaciones básicas
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    // Ajuste AM/PM
    if (modifier === "PM" && hours < 12) {
        hours += 12;
    } else if (modifier === "AM" && hours === 12) {
        hours = 0;
    }

    // Si no hay modificador, asumimos 24h si es > 12, o si es ambiguo (ej "6:00") lo tratamos como tal.
    // NOTA: "6:00" sin AM/PM podría ser 6 AM. "18:00" es 6 PM.
    // Si el usuario pone "6", asumimos 6 AM. Si pone "6 PM", es 18:00.

    return hours * 60 + minutes;
}

/**
 * Convierte minutos desde medianoche a formato legible "HH:MM AM/PM"
 */
export function formatTime(minutes: number): string {
    if (minutes < 0 || minutes >= 1440) return "Invalid Time";

    let hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const ampm = hours >= 12 ? "PM" : "AM";

    if (hours > 12) hours -= 12;
    if (hours === 0) hours = 12;

    return `${hours}:${mins.toString().padStart(2, '0')} ${ampm}`;
}
