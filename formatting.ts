import { GoogleSpreadsheetRow } from "google-spreadsheet";
import { parseDateFromSheet } from "./notifications.js";
import { getGreeting } from "./greetings_utils.js";

export function getEventEmoji(eventName: string): string {
    const lower = eventName.toLowerCase();

    // 1. ESPIRITUALIDAD / ORACIÓN
    if (lower.includes("oración") || lower.includes("oramos") || lower.includes("intercesión") || lower.includes("vigilia")) return "🙏";

    // 2. FAMILIA / MATRIMONIOS (❤️)
    // "Curso de Enamorados", "Matrimonios", "Bodas"
    if (lower.includes("enamorados") || lower.includes("matrimonios") || lower.includes("parejas") || lower.includes("boda") || lower.includes("familia")) return "❤️";
    // NUEVO: DEPORTES / EVENTOS DEPORTIVOS (⚽)
    // Debe ir ANTES de "Evangelismo" para que gane el balón si el evento se llama "Evangelismo FIFA"
    if (lower.includes("fifa") || lower.includes("fútbol") || lower.includes("futbol") || lower.includes("soccer") || lower.includes("deporte") || lower.includes("copa") || lower.includes("torneo") || lower.includes("mundial")) return "⚽";
    // 3. OBRA SOCIAL / AYUDA HUMANITARIA / REHABILITACIÓN (🤝)
    // "Proyecto Eunice", "Rehabilitación", "Ayuda", "Misiones"
    if (lower.includes("proyecto") || lower.includes("rehabilitación") || lower.includes("adicciones") || lower.includes("humanitaria") || lower.includes("obra") || lower.includes("misiones") || lower.includes("visita") || lower.includes("evangelismo")) return "🤝";

    // 4. JÓVENES / FIESTAS (🔥)
    if (lower.includes("congreso") || lower.includes("jóvenes") || lower.includes("jovenes") || lower.includes("fiesta") || lower.includes("resplandece") || lower.includes("aniversario")) return "🔥";

    // 5. EDUCACIÓN / TALLERES (🎓)
    if (lower.includes("instituto") || lower.includes("seminario") || lower.includes("curso") || lower.includes("clase") || lower.includes("taller") || lower.includes("examen") || lower.includes("escuela") || lower.includes("capacitación")) return "🎓";

    // 6. CENA / COMUNIÓN (🍞)
    if (lower.includes("cena") || lower.includes("comunión") || lower.includes("pan")) return "🍞";

    // 7. MÚSICA (🎵)
    if (lower.includes("música") || lower.includes("musica") || lower.includes("recital") || lower.includes("concierto") || lower.includes("alabanza")) return "🎵";

    // 8. NIÑOS / ABUELITOS (🎈)
    if (lower.includes("niños") || lower.includes("infantil") || lower.includes("abuelitos") || lower.includes("tercera edad")) return "🎈";

    // 9. AVISOS DE CIERRE (🛑)
    if (lower.includes("cerrada") || lower.includes("descanso") || lower.includes("suspensión")) return "🛑";

    // DEFAULT
    return "🔹";
}

export interface ParsedEvent {
    dia: number;
    diaSemana: string;
    nombre: string;
    lugar: string;
    estado: string;
    hora: string;
    descripcion: string;
    fecha: Date;
    monthName?: string | undefined; // Para saber de qué mes vino (útil en cross-month)
    destacado?: boolean; // Si es un evento estelar
}

export function parseRowToEvent(row: GoogleSpreadsheetRow, monthName?: string): ParsedEvent | null {
    const eventoNombre = row.get("Evento");
    if (!eventoNombre || eventoNombre === "undefined") return null;

    const fechaEvento = parseDateFromSheet(row, monthName);
    if (!fechaEvento) return null;

    // Obtener Día de la Semana
    let diaSemana = row.get("Día de la semana");
    if (!diaSemana) {
        const ds = fechaEvento.toLocaleDateString("es-MX", { weekday: 'short' });
        diaSemana = ds.charAt(0).toUpperCase() + ds.slice(1).replace(".", "");
    }
    if (diaSemana.length > 3) diaSemana = diaSemana.substring(0, 3);
    diaSemana = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1).toLowerCase();

    // Detectar si es destacado (Columna "Destacado", "Importancia" o "Estelar")
    const destacadoRaw = row.get("Destacado") || row.get("Importancia") || row.get("Estelar") || row.get("estelar");

    let esDestacado = false;
    if (destacadoRaw) {
        const val = destacadoRaw.toString().trim().toUpperCase();
        // Normalizar acentos (SÍ -> SI)
        const valNorm = val.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        esDestacado = valNorm === "SI" || valNorm === "X" || valNorm === "ESTELAR";
    }

    return {
        dia: fechaEvento.getDate(),
        diaSemana,
        nombre: eventoNombre.trim(),
        lugar: row.get("Lugar"),
        estado: row.get("Estado"),
        hora: row.get("Hora"),
        descripcion: row.get("Descripción"),
        fecha: fechaEvento,
        monthName,
        destacado: !!esDestacado
    };
}

export function formatMonthlyMessage(
    rows: GoogleSpreadsheetRow[],
    metadata: { title: string; description: string; monthName: string },
    mesActual: number
): string {
    let mensaje = "";

    // 1. Encabezado
    if (metadata.title) {
        mensaje += `🗓 *${metadata.title}*\n\n`;
    } else {
        mensaje += `🗓 *AGENDA DE ${metadata.monthName.toUpperCase()}*\n\n`;
    }

    if (metadata.description) {
        mensaje += `_${metadata.description}_\n\n`;
    }

    // Frase estándar
    mensaje += `${getGreeting('monthly', mesActual - 1, metadata.monthName)}\n\n`;

    // 2. Parseo INICIAL (Lineal)
    // Primero leemos todo TAL CUAL viene del Excel
    const eventosRaw: ParsedEvent[] = [];
    for (const row of rows) {
        const parsed = parseRowToEvent(row, metadata.monthName);
        if (parsed) eventosRaw.push(parsed);
    }

    // 3. DETECCIÓN AUTOMÁTICA DE CAMBIO DE MES (ROLLOVER)
    // Si vemos que el día pasa de 30/31 a 1/2 en filas consecutivas, asumimos que es el siguiente mes
    // Esto arregla el bug "Ghost Event" sin editar parseDateFromSheet
    let lastDia = -1;
    let detectedMonthShift = false;

    for (const ev of eventosRaw) {
        // Heurística simple: Si bajamos de >20 a <10, cambiamos de mes
        if (lastDia > 20 && ev.dia < 10) {
            detectedMonthShift = true;
        }

        // Si detectamos cambio, empujamos la fecha un mes adelante
        if (detectedMonthShift) {
            // Clonar fecha para no afectar referencias raras
            const nuevaFecha = new Date(ev.fecha);
            nuevaFecha.setMonth(nuevaFecha.getMonth() + 1);
            ev.fecha = nuevaFecha;
            // No actualizamos diaSemana porque ese sí suele venir bien o se recalcula, 
            // pero parseRowToEvent ya lo hizo con la fecha original. 
            // Si el user puso "Sáb" en excel, se respeta. Si no, habría que recalcular.
            // Por simplicidad, asumimos que el user puso el día correcto en Excel.
        }

        lastDia = ev.dia;
    }

    // 4. Filtrado y Ordenamiento FINAL
    const eventos: ParsedEvent[] = [];
    for (const ev of eventosRaw) {
        // Validar mes: Permitimos mes actual Y el siguiente
        const mesEvento = ev.fecha.getMonth() + 1;
        const mesSiguiente = (mesActual % 12) + 1;

        // El año podría haber cambiado (Dic -> Ene), no lo validamos estricto para simplificar,
        // pero checamos concordancia de meses.
        if (mesEvento !== mesActual && mesEvento !== mesSiguiente) continue;

        eventos.push(ev);
    }

    // Ordenar por FECHA completa
    eventos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    if (eventos.length === 0) {
        return mensaje + "No hay eventos registrados para este mes.";
    }

    // 5. Agrupación por Semanas
    const semanas = [
        { nombre: "Semana 1", inicio: 1, fin: 7, eventos: [] as ParsedEvent[] },
        { nombre: "Semana 2", inicio: 8, fin: 14, eventos: [] as ParsedEvent[] },
        { nombre: "Semana 3", inicio: 15, fin: 21, eventos: [] as ParsedEvent[] },
        { nombre: "Semana 4", inicio: 22, fin: 28, eventos: [] as ParsedEvent[] },
        { nombre: "Semana 5", inicio: 29, fin: 31, eventos: [] as ParsedEvent[] },
    ];

    for (const ev of eventos) {
        // Solo agrupar si pertenece al mes actual. 
        // Ghost events del próximo mes se quedan solo para merging.
        // OJO: mesEvento ya viene corregido por el Rollover.
        if ((ev.fecha.getMonth() + 1) !== mesActual) continue;

        const semana = semanas.find(s => ev.dia >= s.inicio && ev.dia <= s.fin);
        if (semana) semana.eventos.push(ev);
    }

    // --- LÓGICA DE CROSS-WEEK MERGING ---
    const eventosProcesadosGlobal = new Set<ParsedEvent>();

    // 6. Construcción del Mensaje
    for (const semana of semanas) {
        const eventosPendientes = semana.eventos.filter(e => !eventosProcesadosGlobal.has(e));
        if (eventosPendientes.length === 0) continue;

        mensaje += `*${semana.nombre}*\n`;

        for (const ev of semana.eventos) {
            if (eventosProcesadosGlobal.has(ev)) continue;

            const emoji = getEventEmoji(ev.nombre);
            let lugarTexto = "";
            if (ev.lugar && !ev.lugar.toLowerCase().includes("tierra prometida atizapán")) {
                lugarTexto = ` (${ev.lugar})`;
            }

            // --- LÓGICA DE RANGO INFINITO GLOBAL ---
            const rangeEvents: ParsedEvent[] = [ev];
            let currentEv = ev;

            while (true) {
                const nextDate = new Date(currentEv.fecha);
                nextDate.setDate(nextDate.getDate() + 1);

                const nextEv = eventos.find(c =>
                    c !== currentEv &&
                    !eventosProcesadosGlobal.has(c) &&
                    !rangeEvents.includes(c) &&
                    // Comparación estricta de fecha (Día/Mes/Año)
                    c.fecha.getDate() === nextDate.getDate() &&
                    c.fecha.getMonth() === nextDate.getMonth() &&
                    c.nombre === currentEv.nombre &&
                    c.estado === currentEv.estado
                );

                if (nextEv) {
                    rangeEvents.push(nextEv);
                    currentEv = nextEv;
                } else {
                    break;
                }
            }

            // Procesar el resultado del rango
            if (rangeEvents.length > 1) {
                rangeEvents.forEach(e => eventosProcesadosGlobal.add(e));

                const lastEvent = rangeEvents[rangeEvents.length - 1]!;
                const conector = rangeEvents.length === 2 ? "y" : "al";

                // Sufijo de mes
                let lastEventDateStr = `${lastEvent.diaSemana} ${lastEvent.dia}`;
                if ((lastEvent.fecha.getMonth() + 1) !== mesActual) {
                    const mesNombre = lastEvent.fecha.toLocaleDateString("es-MX", { month: 'short' }).replace(".", "");
                    const mesCap = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);
                    lastEventDateStr += ` (${mesCap})`;
                }

                if (ev.estado === "Cancelado") {
                    mensaje += `❌ ${ev.diaSemana} ${ev.dia} ${conector} ${lastEventDateStr}: (CANCELADO) ${ev.nombre}${lugarTexto}\n`;
                } else {
                    mensaje += `${emoji} ${ev.diaSemana} ${ev.dia} ${conector} ${lastEventDateStr}: *${ev.nombre}*${lugarTexto}\n`;
                }
            } else {
                // CASO SIMPLE
                eventosProcesadosGlobal.add(ev);

                let eventDateStr = `${ev.diaSemana} ${ev.dia}`;
                if ((ev.fecha.getMonth() + 1) !== mesActual) {
                    const mesNombre = ev.fecha.toLocaleDateString("es-MX", { month: 'short' }).replace(".", "");
                    const mesCap = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);
                    eventDateStr += ` (${mesCap})`;
                }

                if (ev.estado === "Cancelado") {
                    mensaje += `❌ ${eventDateStr}: (CANCELADO) ${ev.nombre}${lugarTexto}\n`;
                } else {
                    const horaStr = ev.hora ? ` - ${ev.hora}` : "";
                    mensaje += `${emoji} ${eventDateStr}: *${ev.nombre}*${lugarTexto}${horaStr}\n`;
                }
            }
        }
        mensaje += "\n";
    }

    mensaje += `_"Preparemos nuestro corazón para lo que Dios hará."_`;
    return mensaje;
}

// ============== REFACTOR DE SEMANAL =================
export function formatWeeklyMessage(
    eventos: ParsedEvent[],
    startDate: Date,
    endDate: Date,
    monthIndex: number,
    monthName?: string,
    isLastWeek?: boolean
): string {
    let mensaje = `${getGreeting('weekly', monthIndex, monthName)}\n\n`;

    const mesHeader = monthName ? ` (${monthName.toUpperCase()})` : "";
    const lastWeekLegend = isLastWeek ? " (última semana del mes)" : "";
    mensaje += `📅 *Semana del ${startDate.getDate()} al ${endDate.getDate()}${mesHeader}*${lastWeekLegend}\n\n`;

    // Filtrar y Ordenar
    const eventosFiltrados = eventos.filter(e => e.fecha >= startDate && e.fecha <= endDate);
    eventosFiltrados.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    if (eventosFiltrados.length === 0) {
        return mensaje + "No hay eventos programados para esta semana.";
    }

    // --- LÓGICA DE RANGO INFINITO (Portado al Semanal) ---
    const eventsProcessed = new Set<ParsedEvent>();

    for (const ev of eventosFiltrados) {
        if (eventsProcessed.has(ev)) continue;

        const emoji = getEventEmoji(ev.nombre);
        let lugarTexto = "";
        if (ev.lugar && !ev.lugar.toLowerCase().includes("tierra prometida atizapán")) {
            lugarTexto = ` (${ev.lugar})`;
        }

        // Buscar Rangos (dentro de esta semana solamente)
        const rangeEvents: ParsedEvent[] = [ev];
        let currentEv = ev;

        while (true) {
            const nextDate = new Date(currentEv.fecha);
            nextDate.setDate(nextDate.getDate() + 1);

            const nextEv = eventosFiltrados.find(c =>
                c !== currentEv &&
                !eventsProcessed.has(c) &&
                !rangeEvents.includes(c) &&
                c.fecha.getDate() === nextDate.getDate() && // Día siguiente
                c.fecha.getMonth() === nextDate.getMonth() && // Mismo mes (o siguiente, date object lo maneja)
                c.nombre === currentEv.nombre &&
                c.estado === currentEv.estado
            );

            if (nextEv) {
                rangeEvents.push(nextEv);
                currentEv = nextEv;
            } else {
                break;
            }
        }

        // Imprimir Rango o Simple
        if (rangeEvents.length > 1) {
            rangeEvents.forEach(e => eventsProcessed.add(e));
            const lastEvent = rangeEvents[rangeEvents.length - 1]!;
            const conector = rangeEvents.length === 2 ? "y" : "al";

            // En semanal, el mes suele ser obvio, pero si cambia de mes en medio de la semana,
            // sería bueno indicarlo.
            let lastEventDateStr = `${lastEvent.diaSemana} ${lastEvent.dia}`;
            // Si el mes del último día es distinto del de inicio O distinto del mes 'header' (opcional)
            // Por consistencia con mensual:
            if (lastEvent.fecha.getMonth() !== ev.fecha.getMonth()) {
                const mesNombre = lastEvent.fecha.toLocaleDateString("es-MX", { month: 'short' }).replace(".", "");
                const mesCap = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);
                lastEventDateStr += ` (${mesCap})`;
            }

            if (ev.estado === "Cancelado") {
                mensaje += `❌ ${ev.diaSemana} ${ev.dia} ${conector} ${lastEventDateStr}: (CANCELADO) ${ev.nombre}${lugarTexto}\n`;
            } else {
                mensaje += `${emoji} ${ev.diaSemana} ${ev.dia} ${conector} ${lastEventDateStr}: *${ev.nombre}*${lugarTexto}\n`;
            }
        } else {
            // Caso Simple
            eventsProcessed.add(ev);

            if (ev.estado === "Cancelado") {
                mensaje += `❌ ${ev.diaSemana} ${ev.dia}: (CANCELADO) ${ev.nombre}${lugarTexto}\n`;
            } else {
                const horaStr = ev.hora ? ` - ${ev.hora}` : "";
                mensaje += `${emoji} ${ev.diaSemana} ${ev.dia}: *${ev.nombre}*${lugarTexto}${horaStr}\n`;
            }
        }
    }

    return mensaje;
}

export function formatTelegramToWhatsapp(text: string): string {
    let formatted = text;

    // 1. Negritas: **texto** -> *texto*
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '*$1*');

    // 2. Cursivas: __texto__ -> _texto_
    formatted = formatted.replace(/__(.*?)__/g, '_$1_');

    // 3. Tachado: ~~texto~~ -> ~texto~
    formatted = formatted.replace(/~~(.*?)~~/g, '~$1~');

    // 4. Listas: Asegurar espacio después del guion
    formatted = formatted.replace(/^-\s*/gm, '- ');

    return formatted;
}