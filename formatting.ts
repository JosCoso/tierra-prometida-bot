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

    // Frase estándar (Dinámica según el mes)
    mensaje += `${getGreeting('monthly', mesActual - 1, metadata.monthName)}\n\n`;

    // 2. Filtrar y procesar eventos (Normalización)
    const eventos = [];
    for (const row of rows) {
        const eventoNombre = row.get("Evento");
        if (!eventoNombre || eventoNombre === "undefined") continue;

        // Validar mes
        const mesRow = parseInt(row.get("Mes"), 10);
        if (!isNaN(mesRow) && mesRow !== mesActual) continue;

        // Validar día
        const dia = parseInt(row.get("Día"), 10);
        if (isNaN(dia)) continue;

        // Obtener Día de la Semana (Lun, Mar, etc.)
        let diaSemana = row.get("Día de la semana");
        if (!diaSemana) {
            // Si no está en el Excel, intentamos calcularlo
            const fecha = parseDateFromSheet(row, metadata.monthName);
            if (fecha) {
                const ds = fecha.toLocaleDateString("es-MX", { weekday: 'short' });
                diaSemana = ds.charAt(0).toUpperCase() + ds.slice(1).replace(".", "");
            } else {
                diaSemana = "Día";
            }
        }

        // Formato corto de 3 letras (Jue, Vie)
        if (diaSemana.length > 3) diaSemana = diaSemana.substring(0, 3);
        diaSemana = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1).toLowerCase();

        eventos.push({
            dia,
            diaSemana,
            nombre: eventoNombre.trim(), // Quitamos espacios extra
            lugar: row.get("Lugar"),
            estado: row.get("Estado"),
            row
        });
    }

    // Ordenar por día numérico
    eventos.sort((a, b) => a.dia - b.dia);

    if (eventos.length === 0) {
        return mensaje + "No hay eventos registrados para este mes.";
    }

    // 3. Agrupación por Semanas (Bloques Visuales)
    const semanas = [
        { nombre: "Semana 1", inicio: 1, fin: 7, eventos: [] as any[] },
        { nombre: "Semana 2", inicio: 8, fin: 14, eventos: [] as any[] },
        { nombre: "Semana 3", inicio: 15, fin: 21, eventos: [] as any[] },
        { nombre: "Semana 4", inicio: 22, fin: 28, eventos: [] as any[] },
        { nombre: "Semana 5", inicio: 29, fin: 31, eventos: [] as any[] },
    ];

    for (const ev of eventos) {
        const semana = semanas.find(s => ev.dia >= s.inicio && ev.dia <= s.fin);
        if (semana) semana.eventos.push(ev);
    }

    // 4. Construcción del Mensaje (Lógica de Fusión)
    for (const semana of semanas) {
        if (semana.eventos.length === 0) continue;

        mensaje += `*${semana.nombre}*\n`;

        let i = 0;
        while (i < semana.eventos.length) {
            const current = semana.eventos[i];

            // Detectar secuencia de eventos idénticos (Días consecutivos)
            let j = i + 1;
            while (j < semana.eventos.length) {
                const next = semana.eventos[j];
                if (next.nombre === current.nombre &&
                    next.estado === current.estado &&
                    next.dia === semana.eventos[j - 1].dia + 1) { // Checa si es el día siguiente exacto
                    j++;
                } else {
                    break;
                }
            }

            // Lógica común para Lugar (Evita repetirlo si es la iglesia base)
            let lugarTexto = "";
            if (current.lugar && !current.lugar.toLowerCase().includes("tierra prometida atizapán")) {
                lugarTexto = ` (${current.lugar})`;
            }

            // CASO A: Rango de fechas (Congresos, Cierres)
            if (j > i + 1) {
                const last = semana.eventos[j - 1];
                const emoji = getEventEmoji(current.nombre);

                // Si son EXACTAMENTE 2 días: "Vie 11 y Sáb 12"
                if (j - i === 2) {
                    const second = semana.eventos[i + 1];
                    if (current.estado === "Cancelado") {
                        mensaje += `❌ ${current.diaSemana} ${current.dia} y ${second.diaSemana} ${second.dia}: (CANCELADO) ${current.nombre}${lugarTexto}\n`;
                    } else {
                        mensaje += `${emoji} ${current.diaSemana} ${current.dia} y ${second.diaSemana} ${second.dia}: *${current.nombre}*${lugarTexto}\n`;
                    }
                }
                // Si son 3 o más días: "Del Vie 11 al Dom 13"
                else {
                    if (current.estado === "Cancelado") {
                        mensaje += `❌ Del ${current.diaSemana} ${current.dia} al ${last.diaSemana} ${last.dia}: (CANCELADO) ${current.nombre}${lugarTexto}\n`;
                    } else {
                        mensaje += `${emoji} Del ${current.diaSemana} ${current.dia} al ${last.diaSemana} ${last.dia}: *${current.nombre}*${lugarTexto}\n`;
                    }
                }

                i = j; // Saltamos los eventos ya procesados
            }
            // CASO B: Evento único
            else {
                const emoji = getEventEmoji(current.nombre);

                if (current.estado === "Cancelado") {
                    mensaje += `❌ ${current.diaSemana} ${current.dia}: (CANCELADO) ${current.nombre}${lugarTexto}\n`;
                } else {
                    // Formato limpio sin hora
                    mensaje += `${emoji} ${current.diaSemana} ${current.dia}: *${current.nombre}*${lugarTexto}\n`;
                }
                i++;
            }
        }
        mensaje += "\n"; // Espacio entre semanas
    }

    // 5. Cierre Inspirador (Toque Humano)
    mensaje += `_"Preparemos nuestro corazón para lo que Dios hará."_`;

    return mensaje;
}

export function formatWeeklyMessage(
    eventos: ParsedEvent[],
    startDate: Date,
    endDate: Date,
    monthIndex: number,
    monthName?: string,
    isLastWeek?: boolean
): string {
    let mensaje = `${getGreeting('weekly', monthIndex, monthName)}\n\n`;

    // 1. Encabezado con Mes (si está disponible)
    const mesHeader = monthName ? ` (${monthName.toUpperCase()})` : "";
    const lastWeekLegend = isLastWeek ? " (última semana del mes)" : "";
    mensaje += `📅 *Semana del ${startDate.getDate()} al ${endDate.getDate()}${mesHeader}*${lastWeekLegend}\n\n`;

    // Filtrar por rango de fechas (ya vienen parseados, pero filtramos por si acaso)
    const eventosFiltrados = eventos.filter(e => e.fecha >= startDate && e.fecha <= endDate);

    eventosFiltrados.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    if (eventosFiltrados.length === 0) {
        return mensaje + "No hay eventos programados para esta semana.";
    }

    // 2. Agrupar por Día
    let currentDay = -1;

    for (const evento of eventosFiltrados) {
        // Si es un nuevo día, imprimir encabezado
        if (evento.dia !== currentDay) {
            mensaje += `📅 *${evento.diaSemana} ${evento.dia}*\n`;
            currentDay = evento.dia;
        }

        const emoji = getEventEmoji(evento.nombre);

        // Lógica de Lugar (Condicional)
        let lugarTexto = "";
        if (evento.lugar && !evento.lugar.toLowerCase().includes("tierra prometida atizapán")) {
            lugarTexto = ` (${evento.lugar})`;
        }

        // Detalles del evento (Sin repetir día)
        if (evento.estado === "Cancelado") {
            mensaje += `❌ (CANCELADO) ${evento.nombre}${lugarTexto}\n`;
        } else {
            mensaje += `${emoji} ${evento.nombre}${lugarTexto}\n`;
        }

        // Hora (Siempre mostrar si existe)
        if (evento.hora) {
            mensaje += `   ⏰ ${evento.hora}\n`;
        }

        // Descripción (Si existe)
        if (evento.descripcion) {
            mensaje += `   ${evento.descripcion}\n`;
        }

        mensaje += "\n";
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
    // Telegram a veces acepta "-Item", WhatsApp prefiere "- Item"
    formatted = formatted.replace(/^-\s*/gm, '- ');

    return formatted;
}