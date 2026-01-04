export const MONTHLY_GREETINGS = [
    "📅 *¡NUEVO MES, NUEVAS BENDICIONES!*",
    "✨ *¡BIENVENIDO, NUEVO MES EN FAMILIA!*",
    "🚀 *¡ARRANCAMOS EL MES CON TODO!*",
    "🕊️ *¡MES DE VICTORIA Y BENDICIÓN!*",
    "💒 *¡NUESTRA AGENDA MENSUAL ESTÁ LISTA!*",
    "🌟 *¡LO QUE DIOS HARÁ ESTE MES SERÁ GRANDE!*"
];

export const WEEKLY_GREETINGS = [
    "📅 *AGENDA DE LA SEMANA*",
    "✨ *¡ASÍ SE VE NUESTRA SEMANA!*",
    "🚀 *¡PREPARÉMONOS PARA ESTA SEMANA!*",
    "👋 *¡HOLA, FAMILIA! ESTA ES LA AGENDA SEMANAL:*",
    "🕊️ *¡SEMANA DE BENDICIÓN! AQUÍ LOS DETALLES:*",
    "💒 *¡NOS VEMOS EN CASA ESTA SEMANA!*"
];

/**
 * Obtiene un saludo determinista basado en el índice del mes (0-11).
 * Esto asegura que el saludo sea el mismo durante todo el mes, pero cambie al siguiente.
 */
export function getGreeting(type: 'monthly' | 'weekly', monthIndex: number, monthName?: string): string {
    const phrases = type === 'monthly' ? MONTHLY_GREETINGS : WEEKLY_GREETINGS;
    // Usamos el operador módulo (%) para rotar las frases si hay más meses que frases
    const index = monthIndex % phrases.length;
    let greeting = phrases[index] || phrases[0] || "¡Hola!";

    if (monthName && type === 'monthly') {
        // Quitamos el asterisco final si existe para meter el mes dentro de las negritas
        if (greeting.endsWith("*")) {
            greeting = greeting.slice(0, -1) + ` (${monthName.toUpperCase()})*`;
        } else {
            greeting += ` (${monthName.toUpperCase()})`;
        }
    }

    return greeting;
}
