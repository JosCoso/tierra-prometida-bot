import { Bot, InlineKeyboard, InputFile } from "grammy";
import { GoogleSpreadsheet } from "google-spreadsheet";
import "dotenv/config";
import * as path from "path";
import { formatMonthlyMessage, formatWeeklyMessage, parseRowToEvent, ParsedEvent } from "./formatting.js";
import { getVotes } from "./rsvp_storage.js";
import { getGreeting, getTimeBasedGreeting } from "./greetings_utils.js";
import { whatsappService } from "./whatsapp_service.js";

// ID del Canal de WhatsApp (o número de destino si fuera chat directo - Plan B)
// Helper para determinar el destino de WhatsApp (Prioridad: Canal > Teléfono Directo)
function getWhatsAppTarget() {
    // Leer dinámicamente para asegurar que tenemos el valor más reciente
    const channelId = process.env.WHATSAPP_CHANNEL_ID;
    const targetPhone = process.env.WHATSAPP_TARGET_PHONE;

    console.log(`🔍 Debug WhatsApp Target: ChannelID=${channelId}, TargetPhone=${targetPhone}`);

    // Si channelId es un string vacío, lo ignoramos.
    if (channelId && channelId.trim() !== "") return channelId;
    if (targetPhone && targetPhone.trim() !== "") return targetPhone;

    return null;
}


const TIMEZONE = process.env.TIMEZONE || "America/Mexico_City";

// Helper para obtener la fecha actual en la zona horaria deseada (YYYY-MM-DD)
export function getCurrentDateInTimezone(): Date {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === "year")?.value;
    const month = parts.find(p => p.type === "month")?.value;
    const day = parts.find(p => p.type === "day")?.value;

    // Retorna fecha a las 00:00:00 del día en la zona horaria
    return new Date(`${year}-${month}-${day}T00:00:00`);
}

// Helper para parsear fecha del Excel (usando columnas Mes y Día)
export function parseDateFromSheet(row: any, sheetTitle?: string): Date | null {
    let valMes = row.get("Mes");
    const valDia = row.get("Día");

    // Si no hay columna "Mes", intentar obtenerlo del título de la hoja (ej: "ENERO")
    if (!valMes && sheetTitle) {
        // Buscar si el título contiene algún nombre de mes
        const meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
        const tituloUpper = sheetTitle.toUpperCase();
        const mesEncontrado = meses.find(m => tituloUpper.includes(m));
        if (mesEncontrado) {
            valMes = getMonthNumber(mesEncontrado);
        }
    }

    if (!valMes || !valDia) return null;

    const mesStr = String(valMes);
    const diaStr = String(valDia);

    const mes = parseInt(mesStr, 10);
    const dia = parseInt(diaStr, 10);

    if (isNaN(mes) || isNaN(dia)) return null;

    // Usar año objetivo del .env o el actual por defecto
    const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();

    // Crear fecha (Mes es 0-indexed en JS, así que restamos 1)
    // Usamos string format para asegurar que no haya líos de timezone al crearla
    const fechaStr = `${targetYear}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T00:00:00`;
    return new Date(fechaStr);
}

export function getMonthNumber(monthName: string): number {
    const m = monthName.toLowerCase().trim();
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return months.indexOf(m) + 1;
}

export function getWeekDateRange(year: number, monthIndex: number, weekNumber: number) {
    const firstDayOfMonth = new Date(year, monthIndex, 1);
    const lastDayOfMonth = new Date(year, monthIndex + 1, 0);

    // 1. Encontrar el Lunes de la semana que contiene al 1ro del mes
    const dayOfWeek = firstDayOfMonth.getDay(); // 0=Sun, 1=Mon...
    const distToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    let start = new Date(firstDayOfMonth);
    start.setDate(firstDayOfMonth.getDate() + distToMonday);

    // 2. Avanzar 'weekNumber - 1' semanas
    start.setDate(start.getDate() + (weekNumber - 1) * 7);

    // 3. Calcular fin de la semana (Domingo)
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    // Validar si la semana sigue siendo relevante para el mes solicitado
    // (Si el inicio de la semana ya pasó el fin de mes, entonces esa semana no pertenece al mes)
    if (start > lastDayOfMonth) return null;

    // NOTA: Ya no recortamos 'end' con 'lastDayOfMonth' para mostrar la semana completa
    // aunque cruce al siguiente mes (o venga del anterior).

    return {
        start,
        end,
        isLastWeek: end.getDate() === lastDayOfMonth.getDate() || (end > lastDayOfMonth && start <= lastDayOfMonth)
    };
}

// A) Resumen Semanal (Lunes)
export async function enviarResumenSemanal(bot: Bot, doc: GoogleSpreadsheet, canalId: string | number, simulatedDate?: Date) {
    try {
        console.log("Generando resumen semanal...");
        await doc.loadInfo();

        // 1. Calcular rango de la semana (Lunes a Domingo)
        const hoy = simulatedDate || getCurrentDateInTimezone();
        if (simulatedDate) {
            const fechaLog = hoy.toLocaleDateString("es-MX", { day: '2-digit', month: '2-digit', year: 'numeric' });
            console.log(`📅 Simulando fecha para resumen semanal: ${fechaLog}`);
        }

        const dayOfWeek = hoy.getDay(); // 0=Sun, 1=Mon...
        // Ajustar para que la semana empiece en Lunes (si hoy es Domingo 0, dist es -6)
        const distToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const startOfWeek = new Date(hoy);
        startOfWeek.setDate(hoy.getDate() + distToMonday);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        // 2. Identificar meses involucrados
        const startMonthIndex = startOfWeek.getMonth();
        const endMonthIndex = endOfWeek.getMonth();

        const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const startMonthName = meses[startMonthIndex] || "Enero";
        const endMonthName = meses[endMonthIndex] || "Enero";

        // 3. Obtener eventos de las hojas necesarias
        const allEvents: ParsedEvent[] = [];

        // Función auxiliar para cargar y parsear eventos de un mes
        const loadEventsForMonth = async (monthName: string) => {
            const sheet = doc.sheetsByIndex.find(s => s.title.toUpperCase().includes(monthName.toUpperCase()));
            if (!sheet) return;

            await sheet.loadHeaderRow(3);
            const rows = await sheet.getRows();

            for (const row of rows) {
                const evt = parseRowToEvent(row, monthName);
                if (evt) allEvents.push(evt);
            }
        };

        await loadEventsForMonth(startMonthName);

        // Si la semana cruza de mes, cargar también el siguiente
        if (startMonthIndex !== endMonthIndex) {
            await loadEventsForMonth(endMonthName);
        }

        // 4. Formatear mensaje
        // Si cruza meses, el nombre del mes en el header puede ser compuesto o solo el inicial
        // Para simplificar, si cruza, no ponemos mes en el título principal o ponemos ambos
        const headerMonthName = startMonthIndex !== endMonthIndex ? `${startMonthName}/${endMonthName}` : startMonthName;
        const isLastWeek = endOfWeek.getDate() === new Date(endOfWeek.getFullYear(), endOfWeek.getMonth() + 1, 0).getDate();

        const mensaje = formatWeeklyMessage(
            allEvents,
            startOfWeek,
            endOfWeek,
            startMonthIndex,
            headerMonthName,
            isLastWeek
        );

        if (mensaje.includes("No hay eventos")) {
            console.log("No hay eventos esta semana.");
        } else {
            await bot.api.sendMessage(canalId, mensaje, { parse_mode: "Markdown" });
            console.log("Resumen semanal enviado a Telegram.");

            const waTarget = getWhatsAppTarget();
            if (waTarget) {
                // Enviar al Canal de WhatsApp o Directo
                await whatsappService.sendMessage(waTarget, mensaje);
                console.log(`Resumen semanal enviado a WhatsApp (${waTarget}).`);
            } else {
                console.log("⚠️ No se envió a WhatsApp: No hay destino configurado (Channel ID o Target Phone).");
            }


        }

    } catch (error) {
        console.error("Error en resumen semanal:", error);
    }
}

// B) Recordatorio Diario (Hoy)
export async function enviarRecordatorioDiario(bot: Bot, doc: GoogleSpreadsheet, canalId: string | number, simulatedDate?: Date) {
    try {
        console.log("Verificando eventos de hoy...");
        await doc.loadInfo();
        const hoy = simulatedDate || getCurrentDateInTimezone();
        if (simulatedDate) {
            const fechaLog = hoy.toLocaleDateString("es-MX", { day: '2-digit', month: '2-digit', year: 'numeric' });
            console.log(`📅 Simulando fecha para recordatorio: ${fechaLog}`);
        }

        // 1. Identificar la hoja correcta según el mes
        const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const mesNombre = meses[hoy.getMonth()] || "Enero";

        let sheet = doc.sheetsByIndex.find(s => s.title.toUpperCase().includes(mesNombre.toUpperCase()));
        if (!sheet) {
            console.log(`⚠️ No se encontró hoja para ${mesNombre}, usando la primera.`);
            sheet = doc.sheetsByIndex[0];
        }
        if (!sheet) return;

        // Ajuste para nueva estructura: headers en fila 3
        await sheet.loadHeaderRow(3);
        const rows = await sheet.getRows();

        let eventosHoy: any[] = [];

        for (const row of rows) {
            const evento = row.get("Evento");
            if (!evento || evento === "undefined") continue;

            const fechaEvento = parseDateFromSheet(row, sheet.title);

            // Comparamos timestamps para ver si es exactamente el mismo día
            if (fechaEvento && fechaEvento.getTime() === hoy.getTime()) {
                eventosHoy.push(row);
            }
        }

        if (eventosHoy.length > 0) {
            // Generar saludo con IA
            const { aiService } = await import("./ai_service.js");
            const nombresEventos = eventosHoy.map(row => row.get("Evento"));

            // Intentar obtener metadatos del mes (Título y Versículo)
            let theme = "";
            let verse = "";
            try {
                // sheet ya está cargado arriba
                await sheet.loadCells('A2:B2');
                theme = sheet.getCell(1, 0).value?.toString() || "";
                verse = sheet.getCell(1, 1).value?.toString() || "";
            } catch (e) {
                console.warn("⚠️ No se pudieron cargar metadatos del mes para IA:", e);
            }

            const saludoIA = await aiService.generateDailyGreeting(nombresEventos, theme, verse);

            const diaNum = hoy.getDate();
            // mesNombre ya fue calculado arriba
            const tiempoSaludo = getTimeBasedGreeting(hoy);
            let mensaje = `☀️ *${tiempoSaludo} HOY EN TIERRA PROMETIDA:*\n\n${saludoIA}\n\n📅 *${diaNum} de ${mesNombre}*\n\n`;
            for (const row of eventosHoy) {
                mensaje += ` *${row.get("Evento")}*\n`;
                if (row.get("Hora")) mensaje += `   ⏰ Hora: ${row.get("Hora")}\n`;
                if (row.get("Lugar")) mensaje += `   📍 Lugar: ${row.get("Lugar")}\n`;
                if (row.get("Descripción")) mensaje += `    ${row.get("Descripción")}\n`;
                mensaje += "\n";
            }
            const sentMessage = await bot.api.sendMessage(canalId, mensaje, { parse_mode: "Markdown" });

            const waTarget = getWhatsAppTarget();
            if (waTarget) {
                await whatsappService.sendMessage(waTarget, mensaje);
            } else {
                console.log("⚠️ No se envió a WhatsApp: No hay destino configurado.");
            }



            // Agregar botón de RSVP
            // Inicialmente 0 votos o lo que haya en storage (aunque será nuevo mensaje, será 0)
            const keyboard = new InlineKeyboard()
                .text(`✋ Asistiré (0)`, `rsvp:attend`);

            await bot.api.editMessageReplyMarkup(canalId, sentMessage.message_id, { reply_markup: keyboard });

            console.log(`Recordatorio enviado para ${eventosHoy.length} eventos.`);
        } else {
            console.log("No hay eventos para hoy.");
        }

    } catch (error) {
        console.error("Error en recordatorio diario:", error);
    }
}

// Helper para obtener frase del mes (DEPRECATED: Se usa metadata del sheet ahora)
export function getMonthlyPhrase(monthName: string): string {
    // ... (mantener por si acaso o borrar si ya no se usa en absoluto)
    return "";
}

// D. Obtener Eventos por Mes (Helper para API y Mensajes)
export async function getEventsForMonth(doc: GoogleSpreadsheet, mesNombre?: string) {
    try {
        await doc.loadInfo();
        let sheet;
        let mesActual;
        const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

        if (mesNombre) {
            sheet = doc.sheetsByIndex.find(s => s.title.toUpperCase().includes(mesNombre.toUpperCase()));
            mesActual = getMonthNumber(mesNombre);
        } else {
            const hoy = getCurrentDateInTimezone();
            mesActual = hoy.getMonth() + 1;
            const nombreMes = nombresMeses[mesActual - 1] || "Mes Actual";
            sheet = doc.sheetsByIndex.find(s => s.title.toUpperCase().includes(nombreMes.toUpperCase()));
            if (!sheet) {
                sheet = doc.sheetsByIndex[0];
            }
        }

        if (!sheet) {
            return { rows: [], metadata: { title: "", description: "", monthName: mesNombre || "Mes" }, mesNumero: mesActual };
        }

        // Cargar metadatos (Título y Descripción) de filas 1-2
        await sheet.loadCells('A2:B2');
        const tituloPersonalizado = sheet.getCell(1, 0).value?.toString() || "";
        const descripcionPersonalizada = sheet.getCell(1, 1).value?.toString() || "";

        // Cargar headers de fila 3
        await sheet.loadHeaderRow(3);
        const rows = await sheet.getRows();

        return {
            rows,
            metadata: {
                title: tituloPersonalizado, // Alias para compatibilidad
                description: descripcionPersonalizada, // Alias para compatibilidad
                lema: tituloPersonalizado,
                versiculo: descripcionPersonalizada,
                monthName: nombresMeses[mesActual - 1] || "Mes"
            },
            mesNumero: mesActual,
            sheetTitle: sheet.title
        };
    } catch (error) {
        console.error("Error obteniendo eventos por mes:", error);
        throw error;
    }
}

// C) Resumen Mensual (Día 1 del mes)
export async function enviarResumenMensual(bot: Bot, doc: GoogleSpreadsheet, canalId: string | number, mesNombre?: string) {
    try {
        console.log("Generando resumen mensual...");

        const { rows, metadata, mesNumero } = await getEventsForMonth(doc, mesNombre);
        if (rows.length === 0 && !metadata.title) {
            console.log("No se encontró la hoja o no hay datos.");
            return;
        }

        const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

        // --- ENVIAR IMAGEN DE PORTADA DEL MES ---
        try {
            // Construir nombre de archivo: "01_ENERO.png", "02_FEBRERO.png", etc.
            // mesActual es 1-based (1 para Enero)
            const numMesStr = String(mesNumero).padStart(2, '0');
            const nombreMesUpper = (nombresMeses[mesNumero - 1] || "MES").toUpperCase();
            const filename = `${numMesStr}_${nombreMesUpper}.png`;

            // Asumiendo que 'images' está en la raíz del proyecto
            const imagePath = path.resolve(process.cwd(), "images", filename);

            console.log(`📸 Buscando imagen mensual: ${imagePath}`);

            // Enviamos la foto antes del texto (Telegram)
            await bot.api.sendPhoto(canalId, new InputFile(imagePath));
            console.log(`✅ Imagen ${filename} enviada a Telegram.`);

            // Enviar a WhatsApp también
            const waTargetImg = getWhatsAppTarget();
            if (waTargetImg) {
                await whatsappService.sendImage(waTargetImg, imagePath);
                console.log(`✅ Imagen ${filename} enviada a WhatsApp.`);
            }
        } catch (imgError) {
            console.warn(`⚠️ No se pudo enviar imagen mensual: ${imgError}`);
            // Continuamos con el texto aunque falle la imagen
        }
        // ----------------------------------------


        // Usar el módulo de formato unificado
        const mensaje = formatMonthlyMessage(
            rows,
            metadata,
            mesNumero
        );

        await bot.api.sendMessage(canalId, mensaje, { parse_mode: "Markdown" });

        const waTarget = getWhatsAppTarget();
        if (waTarget) {
            await whatsappService.sendMessage(waTarget, mensaje);
        } else {
            console.log("⚠️ No se envió a WhatsApp: No hay destino configurado.");
        }

        console.log("Resumen mensual enviado.");

    } catch (error) {
        console.error("Error en resumen mensual:", error);
    }
}
