import { Bot } from "grammy";
import { GoogleSpreadsheet } from "google-spreadsheet";
import * as cron from "node-cron";
import { getCurrentDateInTimezone, parseDateFromSheet, enviarRecordatorioDiario } from "./notifications.js";
import { parseTime, formatTime } from "./time_utils.js";

const TIMEZONE = process.env.TIMEZONE || "America/Mexico_City";

// Variable para guardar la tarea programada del día (para poder cancelarla si se re-programa)
let dailyJob: cron.ScheduledTask | null = null;

export async function scheduleDailySummary(bot: Bot, doc: GoogleSpreadsheet, canalId: string, simulatedDate?: Date) {
    try {
        console.log("🔄 Ejecutando Agendador Inteligente (00:01 AM)...");

        // 1. Obtener eventos de hoy
        const hoy = simulatedDate || getCurrentDateInTimezone();
        if (simulatedDate) {
            // Formato claro para el log: DD/MM/YYYY
            const fechaLog = hoy.toLocaleDateString("es-MX", { day: '2-digit', month: '2-digit', year: 'numeric' });
            console.log(`📅 Simulando fecha: ${fechaLog}`);
        }

        await doc.loadInfo(); // <--- IMPORTANTE: Cargar info antes de acceder a sheets

        // 1. Identificar la hoja correcta según el mes de la fecha
        const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const mesNombre = meses[hoy.getMonth()] || "Enero"; // Fallback seguro

        // Buscar hoja que contenga el nombre del mes
        let sheet = doc.sheetsByIndex.find(s => s.title.toUpperCase().includes(mesNombre.toUpperCase()));

        // Fallback: Si no encuentra por nombre, intentar la hoja 0 (solo si es Enero, o comportamiento legacy)
        if (!sheet) {
            console.log(`⚠️ No se encontró hoja para ${mesNombre}, usando la primera.`);
            sheet = doc.sheetsByIndex[0];
        }

        if (!sheet) return;

        console.log(`📂 Usando hoja: ${sheet.title}`);

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

        if (eventosHoy.length === 0) {
            console.log("📅 No hay eventos para hoy. No se programará recordatorio.");
            return;
        }

        // 2. Buscar la hora más temprana
        let minMinutes = 24 * 60; // Iniciar alto
        let foundTime = false;

        for (const row of eventosHoy) {
            const horaStr = row.get("Hora");
            const minutes = parseTime(horaStr);

            if (minutes !== null) {
                if (minutes < minMinutes) {
                    minMinutes = minutes;
                    foundTime = true;
                }
            }
        }

        // 3. Calcular hora de notificación (1 hora antes)
        let targetMinutes: number;

        if (foundTime) {
            targetMinutes = minMinutes - 60; // 1 hora antes

            // Límite inferior: No despertar antes de las 7:00 AM (opcional, pero recomendado)
            // Si el evento es a las 7:00 AM, el aviso sería a las 6:00 AM.
            // Si el evento es a las 6:00 AM, el aviso sería a las 5:00 AM.
            // Vamos a poner un "floor" de 6:00 AM para no ser molestos, salvo que el usuario quiera.
            // Por ahora, dejémoslo libre pero con default a las 9:00 AM si no hay hora.
        } else {
            targetMinutes = 9 * 60; // 9:00 AM default
        }

        // Convertir targetMinutes a hora y minuto para cron
        // Nota: targetMinutes puede ser negativo si el evento es a las 00:30 AM -> aviso 23:30 PM del día anterior?
        // Asumiremos eventos del día. Si targetMinutes < 0, lo mandamos YA (o a las 00:05).

        if (targetMinutes < 0) targetMinutes = 5; // 00:05 AM

        const targetHour = Math.floor(targetMinutes / 60);
        const targetMinute = targetMinutes % 60;

        const timeStr = `${targetHour}:${targetMinute.toString().padStart(2, '0')}`;
        console.log(`⏰ Evento más temprano a las: ${foundTime ? formatTime(minMinutes) : "Sin hora"}`);
        console.log(`🚀 Recordatorio programado para las: ${timeStr} (${TIMEZONE})`);

        // 4. Programar la tarea
        // Cancelar tarea anterior si existe (por si se corre manual)
        if (dailyJob) {
            dailyJob.stop();
        }

        // VERIFICACIÓN: Si la hora ya pasó hoy, enviar inmediatamente
        const now = getCurrentDateInTimezone();
        const nowHour = now.getHours();
        const nowMinute = now.getMinutes();
        const nowTotalMinutes = nowHour * 60 + nowMinute;

        // Si targetMinutes es menor que ahora, significa que ya pasó la hora
        if (targetMinutes <= nowTotalMinutes) {
            console.log(`⚠️ La hora programada (${timeStr}) ya pasó. Enviando resumen inmediatamente...`);
            enviarRecordatorioDiario(bot, doc, canalId);
            return;
        }

        // Cron format: "MM HH * * *" (se ejecuta hoy a esa hora)
        const cronExpression = `${targetMinute} ${targetHour} * * *`;

        dailyJob = cron.schedule(cronExpression, () => {
            console.log("🔔 Ejecutando recordatorio programado...");
            enviarRecordatorioDiario(bot, doc, canalId);

            // Detener este job para que no corra mañana a la misma hora (mañana se generará uno nuevo)
            if (dailyJob) dailyJob.stop();
        }, {
            timezone: TIMEZONE
        });

    } catch (error) {
        console.error("Error en Agendador Inteligente:", error);
    }
}

// Nueva función para checar eventos estelares (5 días antes)
export async function checkStellarEvents(bot: Bot, doc: GoogleSpreadsheet, canalId: string, simulatedDate?: Date) {
    // Ensure spreadsheet info is loaded before accessing sheets
    await doc.loadInfo();
    try {
        console.log("🌟 Checando Eventos Estelares (5 días antes)...");
        const hoy = simulatedDate || getCurrentDateInTimezone();

        // Calcular fecha objetivo (Hoy + 5 días)
        const targetDate = new Date(hoy);
        targetDate.setDate(hoy.getDate() + 5);
        targetDate.setHours(0, 0, 0, 0);

        const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const mesNombre = meses[targetDate.getMonth()] || "Enero";

        // Buscar hoja del mes objetivo
        const sheet = doc.sheetsByIndex.find(s => s.title.toUpperCase().includes(mesNombre.toUpperCase()));

        if (!sheet) {
            console.log(`⚠️ No se encontró hoja para ${mesNombre} (Estelar).`);
            return;
        }

        await sheet.loadHeaderRow(3);
        const rows = await sheet.getRows();

        for (const row of rows) {
            const evento = row.get("Evento");
            if (!evento || evento === "undefined") continue;

            const fechaEvento = parseDateFromSheet(row, sheet.title);

            // Checar si la fecha coincide con targetDate y si es destacado
            if (fechaEvento && fechaEvento.getTime() === targetDate.getTime()) {
                // Checar si es destacado (Soporte para "Destacado", "Importancia", "Estelar" y acentos)
                const destacadoRaw = row.get("Destacado") || row.get("Importancia") || row.get("Estelar") || row.get("estelar");

                let esDestacado = false;
                if (destacadoRaw) {
                    const val = destacadoRaw.toString().trim().toUpperCase();
                    const valNorm = val.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Quitar acentos
                    esDestacado = valNorm === "SI" || valNorm === "X" || valNorm === "ESTELAR";
                    if (esDestacado) {
                        const horaStr = row.get("Hora")?.toString().trim() || "Hora no especificada";
                        // Formatear fecha con día de la semana en mayúscula
                        const fechaStr = fechaEvento.toLocaleDateString("es-MX", { weekday: 'long', day: 'numeric', month: 'long' });
                        const fechaConMayus = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);
                        const mensaje = `🚀 ¡Atención! Faltan 5 días para:\n\n✨ *${evento}*\n🕒 ${horaStr}\n📅 ${fechaConMayus}\n\n¡Prepárate! 🙌`;
                        await bot.api.sendMessage(canalId, mensaje, { parse_mode: "Markdown" });
                        console.log(`✅ Alerta estelar enviada para: ${evento}`);
                    }
                }
            }
        }

    } catch (error) {
        console.error("Error en Chequeo Estelar:", error);
    }
}