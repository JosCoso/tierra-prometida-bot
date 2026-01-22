import { Bot, GrammyError, HttpError } from "grammy";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import * as cron from "node-cron";
import express from "express";


import { createRequire } from "module";
const require = createRequire(import.meta.url);
import "dotenv/config";

// 1. CONFIGURACIÓN INICIAL
const botToken = process.env.BOT_TOKEN;
const canalId = process.env.CANAL_ID;
const spreadsheetId = process.env.SPREADSHEET_ID;

if (!botToken || !canalId || !spreadsheetId) {
    throw new Error("Faltan variables de entorno. Por favor revisa el archivo .env");
}

const bot = new Bot(botToken);
const CANAL_ID = canalId;
const SPREADSHEET_ID = spreadsheetId;

// Carga de tus credenciales JSON (puedes copiar los valores del archivo aquí o importar el archivo)
// Carga de credenciales: Intenta variable de entorno primero (Render), sino archivo local (Dev)
let creds;
if (process.env.GOOGLE_CREDENTIALS) {
    creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} else {
    creds = require("./credentials.json");
}

const serviceAccountAuth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

// 2. LÓGICA DE FECHAS Y ZONA HORARIA
const TIMEZONE = process.env.TIMEZONE || "America/Mexico_City";

import { enviarResumenSemanal, enviarRecordatorioDiario, enviarResumenMensual, parseDateFromSheet, getMonthlyPhrase, getMonthNumber, getWeekDateRange } from "./notifications.js";
import { setupTestCommands } from "./test_commands.js";
import { formatMonthlyMessage, formatWeeklyMessage, parseRowToEvent, ParsedEvent } from "./formatting.js";
import { scheduleDailySummary } from "./scheduler.js";
import { toggleVote } from "./rsvp_storage.js";
import { showMenu } from "./interactive_menu.js";

// 3. FUNCIONES DE NOTIFICACIÓN
// (Movidas a notifications.ts)

// 4. PROGRAMACIÓN (CRON)
// Hora de servidor. Como queremos 9:00 AM hora México, y el servidor puede estar en UTC,
// lo ideal es configurar el timezone en la tarea cron.

const cronOptions = {
    scheduled: true,
    timezone: TIMEZONE
};

// Resumen Mensual: Día 1 de cada mes a las 9:00 AM
cron.schedule("0 9 1 * *", () => {
    enviarResumenMensual(bot, doc, CANAL_ID);
}, cronOptions);

// Resumen Semanal: Lunes a las 9:00 AM
cron.schedule("0 9 * * 1", () => {
    enviarResumenSemanal(bot, doc, CANAL_ID);
}, cronOptions);

// Agendador Inteligente: Corre a las 00:01 AM para programar el recordatorio del día
cron.schedule("1 0 * * *", () => {
    scheduleDailySummary(bot, doc, CANAL_ID);
    // También checar eventos estelares (5 días antes)
    import("./scheduler.js").then(m => m.checkStellarEvents(bot, doc, CANAL_ID));
}, cronOptions);

console.log(`Bot iniciado. Zona horaria: ${TIMEZONE}`);
console.log("Programación: Mensual (Día 1), Semanal (Lun) y Diario (Todos los días) a las 9am");

// Configurar comandos de prueba
setupTestCommands(bot, doc, CANAL_ID);

// Handler para el botón de RSVP
// Handler para el botón de RSVP
bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;
    if (data === "rsvp:attend") {
        const userId = ctx.from.id;
        const messageId = ctx.callbackQuery.message?.message_id;

        if (messageId) {
            const { count, added } = toggleVote(messageId, userId);

            // Actualizar el texto del botón
            await ctx.editMessageReplyMarkup({
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `✋ Asistiré (${count})`, callback_data: "rsvp:attend" }]
                    ]
                }
            });

            // Responder al callback para quitar el relojito de carga
            const text = added ? "✅ ¡Te esperamos!" : "❌ Asistencia cancelada";
            await ctx.answerCallbackQuery({ text });
        }
    } else {
        // Si no es RSVP, pasar al siguiente handler (Demo, etc.)
        await next();
    }
});

// Configurar Menú Persistente
await bot.api.setMyCommands([
    { command: "menu", description: "🤖 Menú Interactivo" },
    { command: "semana", description: "📅 Resumen Semanal (Actual)" },
    { command: "dia", description: "☀️ Eventos de Hoy" },
    { command: "todo", description: "🗓 Calendario del Mes" },
    { command: "simular_lunes", description: "🔮 Simular Lunes (Test)" },
    { command: "ayuda", description: "ℹ️ Ayuda y Comandos" },
]);

// Handler para el botón de Demo
bot.callbackQuery("demo_commands", async (ctx) => {
    await ctx.answerCallbackQuery("Generando demo...");

    const texto = `
📊 *Demo rápida del Bot* 📊

🔹 /test_dia               – Simula el recordatorio diario.
🔹 /test_semana 2 agosto   – Simula el resumen semanal (semana 2 de agosto).
🔹 /test_mes 03 agosto     – Simula el resumen mensual (3 de agosto).
🔹 /test_estelar 15 diciembre – Simula el aviso de 5 días antes (evento estelar).

Puedes cambiar la fecha que prefieras para probar cualquier día/semana/mes.`;

    // Enviar al canal o al chat donde se pidió?
    // El usuario dijo: "el bot va a mandar al canal de telegram informacion"
    // Pero si es un botón de menú personal, tal vez debería ser al usuario.
    // Sin embargo, la solicitud explícita fue "mandar al canal".
    // Usaremos CANAL_ID.
    if (CANAL_ID) {
        await bot.api.sendMessage(CANAL_ID, texto, { parse_mode: "Markdown" });
        await ctx.reply("✅ Información de demo enviada al canal.");
    }
});

// Importar funciones de menú
import { showSpecificMenu, showMonthActions, showWeeksMenu, showDaysMenu, showMenu as showInteractiveMenu } from "./interactive_menu.js";

// --- HANDLERS DEL MENÚ INTERACTIVO ---

// 0. Demos Rápidas
bot.callbackQuery("demo_mes", async (ctx) => {
    await ctx.answerCallbackQuery("Generando resumen de Enero...");
    await enviarResumenMensual(bot, doc, CANAL_ID, "Enero");
    await ctx.reply("✅ Demo Mensual (Enero) enviada al canal.");
});

bot.callbackQuery("demo_semana", async (ctx) => {
    await ctx.answerCallbackQuery("Generando resumen semanal...");
    const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();
    const range = getWeekDateRange(targetYear, 0, 1); // Semana 1 Enero
    if (range) {
        await enviarResumenSemanal(bot, doc, CANAL_ID, range.start);
        await ctx.reply(`✅ Demo Semanal (Semana 1 Enero) enviada al canal.`);
    } else {
        await ctx.reply("❌ Error al calcular la semana simulada.");
    }
});

bot.callbackQuery("demo_dia", async (ctx) => {
    await ctx.answerCallbackQuery("Generando resumen diario...");
    const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();
    const simulatedDate = new Date(targetYear, 0, 4); // 4 Enero
    await enviarRecordatorioDiario(bot, doc, CANAL_ID, simulatedDate);
    await ctx.reply("✅ Demo Diaria (4 de Enero) enviada al canal.");
});

// 1. Menú Principal -> Específico
bot.callbackQuery("menu_specific", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSpecificMenu(ctx);
});

// 2. Volver al Menú Principal
bot.callbackQuery("menu_main", async (ctx) => {
    await ctx.answerCallbackQuery();
    // Editar mensaje para volver al menú principal
    await ctx.editMessageText("🤖 *Menú Interactivo*\nSelecciona una opción:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📅 Semana", callback_data: "demo_semana" }, { text: "☀️ Día", callback_data: "demo_dia" }],
                [{ text: "🗓 Mes", callback_data: "demo_mes" }, { text: "📂 Específico", callback_data: "menu_specific" }],
                [{ text: "❌ Cancelar", callback_data: "cancel" }]
            ]
        },
        parse_mode: "Markdown"
    });
});

// 3. Selección de Mes (month:Enero)
bot.callbackQuery(/^month:(.+)$/, async (ctx) => {
    const match = ctx.match;
    if (!match || typeof match[1] !== 'string') return;
    const month = match[1];
    await ctx.answerCallbackQuery();
    await showMonthActions(ctx, month);
});

// 4. Acción: Resumen Mensual (act_month:Enero)
bot.callbackQuery(/^act_month:(.+)$/, async (ctx) => {
    const match = ctx.match;
    if (!match || typeof match[1] !== 'string') return;
    const month = match[1];
    await ctx.answerCallbackQuery(`Generando resumen de ${month}...`);
    // Fire-and-forget para evitar timeouts
    enviarResumenMensual(bot, doc, CANAL_ID, month)
        .then(() => ctx.reply(`✅ Resumen Mensual (${month}) enviado al canal.`))
        .catch(err => ctx.reply(`❌ Error: ${err.message || err}`));
});

// 5. Selección de Semana (sel_week:Enero) -> Muestra semanas 1-5
bot.callbackQuery(/^sel_week:(.+)$/, async (ctx) => {
    const match = ctx.match;
    if (!match || typeof match[1] !== 'string') return;
    const month = match[1];
    await ctx.answerCallbackQuery();
    await showWeeksMenu(ctx, month);
});

// 6. Acción: Resumen Semanal (act_week:Enero:2)
bot.callbackQuery(/^act_week:(.+):(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (!match || typeof match[1] !== 'string' || typeof match[2] !== 'string') return;
    const month = match[1];
    const weekNum = parseInt(match[2], 10);
    await ctx.answerCallbackQuery(`Generando semana ${weekNum} de ${month}...`);

    const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();
    const mesNum = getMonthNumber(month); // 1-based

    // getWeekDateRange usa 0-based month index
    const range = getWeekDateRange(targetYear, mesNum - 1, weekNum);

    if (range) {
        // Fire-and-forget
        enviarResumenSemanal(bot, doc, CANAL_ID, range.start)
            .then(() => ctx.reply(`✅ Resumen Semanal (Semana ${weekNum} ${month}) enviado al canal.`))
            .catch(err => ctx.reply(`❌ Error: ${err.message || err}`));
    } else {
        await ctx.reply(`❌ No se pudo calcular la semana ${weekNum} de ${month}.`);
    }
});

// 7. Selección de Día (sel_day:Enero) -> Muestra días 1-31
bot.callbackQuery(/^sel_day:(.+)$/, async (ctx) => {
    const match = ctx.match;
    if (!match || typeof match[1] !== 'string') return;
    const month = match[1];
    await ctx.answerCallbackQuery();
    await showDaysMenu(ctx, month);
});

// 8. Acción: Resumen Diario (act_day:Enero:15)
bot.callbackQuery(/^act_day:(.+):(\d+)$/, async (ctx) => {
    const match = ctx.match;
    if (!match || typeof match[1] !== 'string' || typeof match[2] !== 'string') return;
    const month = match[1];
    const day = parseInt(match[2], 10);
    await ctx.answerCallbackQuery(`Generando día ${day} de ${month}...`);

    const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();
    const mesNum = getMonthNumber(month); // 1-based

    // Crear fecha (mes es 0-based en Date constructor)
    const simulatedDate = new Date(targetYear, mesNum - 1, day);

    // NO esperar a que termine (fire-and-forget) para evitar timeout del webhook de Telegram
    // Telegram reintenta si no respondemos 200 OK rápido, lo que causa mensajes duplicados.
    enviarRecordatorioDiario(bot, doc, CANAL_ID, simulatedDate)
        .then(() => ctx.reply(`✅ Resumen Diario (${day} de ${month}) enviado al canal.`))
        .catch((err) => {
            console.error("❌ Error en background enviarRecordatorioDiario:", err);
            ctx.reply(`❌ Error enviando resumen: ${err.message || err}`);
        });
});

bot.callbackQuery("cancel", async (ctx) => {
    await ctx.answerCallbackQuery("Cancelado");
    await ctx.deleteMessage();
});





// Comando de Menú de Ayuda

// Comando de Menú de Ayuda
// Comando de Menú de Ayuda
bot.command("menu", async (ctx) => {
    await showMenu(ctx);
});

// Comando de Ayuda
bot.command("ayuda", async (ctx) => {
    const helpText = `
🤖 *Comandos Disponibles:*

🔹 */menu* - Abre el menú interactivo
🔹 */semana [N] [Mes]* - Resumen de una semana
🔹 */dia [N] [Mes]* - Eventos de un día
🔹 */todo [Mes]* - Calendario del mes

Ejemplos:
- /semana 2 Enero
- /dia 4 Enero
- /todo Enero
`;
    await ctx.reply(helpText, { parse_mode: "Markdown" });
});

// --- MENÚ INTERACTIVO A LA CARTA ---

// Helper para encontrar la hoja por nombre de mes (ej: "ENERO", "FEBRERO")
async function getSheetByMonthName(monthName: string) {
    await doc.loadInfo();
    const normalizedMonth = monthName.trim().toUpperCase();
    // Busca una hoja que contenga el nombre del mes (ej: "ENERO" o "MES ENERO")
    const sheet = doc.sheetsByIndex.find(s => s.title.toUpperCase().includes(normalizedMonth));
    return sheet;
}

// 1. COMANDO: "Todo [Mes]" o "/todo [Mes]"
bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text || "";

    // Regex para "Todo [Mes]" o "/todo [Mes]"
    const matchTodo = text.match(/^(?:todo|\/todo)\s+(\w+)/i);
    if (matchTodo && matchTodo[1]) {
        const mesSolicitado = matchTodo[1];
        const sheet = await getSheetByMonthName(mesSolicitado);

        if (!sheet) {
            return ctx.reply(`❌ No encontré una pestaña para el mes "${mesSolicitado}".Asegúrate de que exista en el Google Sheet.`);
        }

        // 1. Cargar metadatos (Título y Descripción) de filas 1-2
        await sheet.loadCells('A2:B2');
        const tituloPersonalizado = sheet.getCell(1, 0).value?.toString() || "";
        const descripcionPersonalizada = sheet.getCell(1, 1).value?.toString() || "";

        // 2. Cargar headers de fila 3
        await sheet.loadHeaderRow(3);
        const rows = await sheet.getRows();

        const mesNum = getMonthNumber(mesSolicitado);

        // Usar el nuevo módulo de formato
        const mensaje = formatMonthlyMessage(
            rows,
            {
                title: tituloPersonalizado,
                description: descripcionPersonalizada,
                monthName: mesSolicitado
            },
            mesNum
        );

        return ctx.reply(mensaje, { parse_mode: "Markdown" });
    }

    // Continuar con otros handlers si no hubo match
    await next();
});

// 2. COMANDO: "[Mes] Semana [N]" o "/semana [N] [Mes]"
bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text || "";

    // Dos formatos: "Enero Semana 2" O "/semana 2 Enero"
    let mesSolicitado = "";
    let numeroSemana = 0;

    const matchFormato1 = text.match(/^(\w+)\s+semana\s+(\d+)/i); // "Enero Semana 2"
    const matchFormato2 = text.match(/^\/semana\s+(\d+)\s+(\w+)/i); // "/semana 2 Enero"

    if (matchFormato1 && matchFormato1[1] && matchFormato1[2]) {
        mesSolicitado = matchFormato1[1];
        numeroSemana = parseInt(matchFormato1[2], 10);
    } else if (matchFormato2 && matchFormato2[1] && matchFormato2[2]) {
        numeroSemana = parseInt(matchFormato2[1], 10);
        mesSolicitado = matchFormato2[2];
    } else {
        return next(); // No es este comando
    }




    // Calcular fechas de la semana solicitada usando lógica de calendario (Lun-Dom)
    const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();
    const mesNum = getMonthNumber(mesSolicitado);

    const range = getWeekDateRange(targetYear, mesNum - 1, numeroSemana);

    if (!range) {
        return ctx.reply(`❌ No encontré la semana ${numeroSemana} en ${mesSolicitado}. Puede que el mes tenga menos semanas.`);
    }

    // 2. Identificar meses involucrados
    const startMonthIndex = range.start.getMonth();
    const endMonthIndex = range.end.getMonth();

    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const startMonthName = meses[startMonthIndex] || "Enero";
    const endMonthName = meses[endMonthIndex] || "Enero";

    // 3. Obtener eventos de las hojas necesarias
    const eventos: ParsedEvent[] = [];

    // Función auxiliar (similar a notifications.ts)
    const loadEventsForMonth = async (monthName: string) => {
        const sheet = doc.sheetsByIndex.find(s => s.title.toUpperCase().includes(monthName.toUpperCase()));
        if (!sheet) return;

        await sheet.loadHeaderRow(3);
        const rows = await sheet.getRows();

        for (const row of rows) {
            const evt = parseRowToEvent(row, monthName);
            if (evt) eventos.push(evt);
        }
    };

    await loadEventsForMonth(startMonthName);

    if (startMonthIndex !== endMonthIndex) {
        await loadEventsForMonth(endMonthName);
    }

    const headerMonthName = startMonthIndex !== endMonthIndex ? `${startMonthName}/${endMonthName}` : startMonthName;

    const mensaje = formatWeeklyMessage(
        eventos,
        range.start,
        range.end,
        startMonthIndex,
        headerMonthName,
        range.isLastWeek // Flag para "última semana"
    );

    return ctx.reply(mensaje, { parse_mode: "Markdown" });
});

// 3. COMANDO: "[Día] de [Mes]" o "/dia [Día] [Mes]"
bot.on("message:text", async (ctx) => {
    const text = ctx.message.text || "";

    // Dos formatos: "4 de Enero" O "/dia 4 Enero"
    let mesSolicitado = "";
    let diaSolicitado = 0;

    const matchFormato1 = text.match(/^(\d+)\s+de\s+(\w+)/i); // "4 de Enero"
    const matchFormato2 = text.match(/^\/dia\s+(\d+)\s+(\w+)/i); // "/dia 4 Enero"

    if (matchFormato1 && matchFormato1[1] && matchFormato1[2]) {
        diaSolicitado = parseInt(matchFormato1[1], 10);
        mesSolicitado = matchFormato1[2];
    } else if (matchFormato2 && matchFormato2[1] && matchFormato2[2]) {
        diaSolicitado = parseInt(matchFormato2[1], 10);
        mesSolicitado = matchFormato2[2];
    } else {
        return; // No es ningún comando conocido, ignorar.
    }

    const sheet = await getSheetByMonthName(mesSolicitado);
    if (!sheet) {
        return ctx.reply(`❌ No encontré una pestaña para el mes "${mesSolicitado}".`);
    }

    // Cargar headers de fila 3
    await sheet.loadHeaderRow(3);
    const rows = await sheet.getRows();
    let eventosDelDia: any[] = [];

    for (const row of rows) {
        const evento = row.get("Evento");
        if (!evento || evento === "undefined") continue;

        const dia = parseInt(row.get("Día"), 10);
        if (dia === diaSolicitado) {
            eventosDelDia.push(row);
        }
    }

    if (eventosDelDia.length === 0) {
        return ctx.reply(`El ${diaSolicitado} de ${mesSolicitado} no tiene actividades registradas.`);
    }

    let mensaje = `🔔 *Simulacro para el ${diaSolicitado} de ${mesSolicitado}:*\nEl día de hoy tendremos las siguientes actividades:\n\n`;

    for (const row of eventosDelDia) {
        const evento = row.get("Evento");
        const hora = row.get("Hora") || "Sin hora";
        const descripcion = row.get("Descripción");
        const estado = row.get("Estado");

        if (estado === "Cancelado") {
            mensaje += `❌ (CANCELADO) - ${evento}\n`;
        } else {
            mensaje += `📍 *${hora}* ${evento}\n`;
            if (row.get("Lugar")) mensaje += `   📍 Lugar: ${row.get("Lugar")}\n`;
            if (descripcion) mensaje += `   ℹ️ Detalles: ${descripcion}\n`;
        }
        mensaje += "\n";
    }

    return ctx.reply(mensaje, { parse_mode: "Markdown" });
});

// COMANDO DE DEBUG
bot.command("debug_sheet", async (ctx) => {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex.find(s => s.title.toUpperCase().includes("ENERO"));

        let msg = `📄 Título Doc: ${doc.title}\n`;
        if (!sheet) {
            msg += "❌ No se encontró hoja ENERO\n";
            msg += `Hojas: ${doc.sheetsByIndex.map(s => s.title).join(", ")}`;
        } else {
            msg += `✅ Hoja encontrada: ${sheet.title}\n`;
            await sheet.loadHeaderRow();
            msg += `Cabeceras: ${sheet.headerValues.join(", ")}\n`;

            const rows = await sheet.getRows();
            msg += `Filas: ${rows.length}\n`;

            if (rows.length > 0) {
                const row = rows[0];
                if (row) {
                    msg += `Fila 1 (Evento): ${row.get("Evento")}\n`;
                    msg += `Fila 1 (Día): ${row.get("Día")}\n`;
                    msg += `Fila 1 (Mes): ${row.get("Mes")}\n`;
                    msg += `Fila 1 (Estado): ${row.get("Estado")}\n`;
                }
            }
        }
        ctx.reply(msg);
    } catch (e) {
        ctx.reply(`Error debug: ${e}`);
    }
});

// 5. SERVER & WEBHOOKS (Telegram + WhatsApp)
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Bot is running 🚀");
});

// --- TELEGRAM WEBHOOK ---
// Configurar webhook de Telegram en la ruta /telegram
// IMPORTANTE: Debes configurar el webhook manualmente una vez:
// https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<TU-DOMINIO>/telegram
import { webhookCallback } from "grammy";
app.post("/telegram", webhookCallback(bot, "express"));

// --- WHATSAPP WEBHOOK ---
// Webhook de Verificación (Meta te pedirá esto al configurar)
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // Define tu propio token de verificación en .env (ej: "botconnect_verify")
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "botconnect_secret";

    if (mode && token) {
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            console.log("✅ Webhook verificado correctamente.");
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// Webhook para recibir mensajes de WhatsApp
app.post("/webhook", (req, res) => {
    const body = req.body;

    // LOG CRUCIAL: Imprimir todo el evento para depurar (ver invitaciones, estados, etc.)
    console.log("📨 [WHATSAPP_WEBHOOK] Payload:", JSON.stringify(body, null, 2));

    // Verificar que sea un evento de WhatsApp
    if (body.object) {
        if (body.entry &&
            body.entry[0].changes &&
            body.entry[0].changes[0] &&
            body.entry[0].changes[0].value.messages &&
            body.entry[0].changes[0].value.messages[0]
        ) {
            const message = body.entry[0].changes[0].value.messages[0];
            const from = message.from; // Número de teléfono
            const text = message.text?.body; // Texto del mensaje

            console.log(`📩 Mensaje de texto recibido de (${from}): ${text}`);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// Iniciar servidor
app.listen(PORT, async () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Bot iniciado. Zona horaria: ${TIMEZONE}`);
    console.log(`Programación: Mensual (Día 1), Semanal (Lun) y Diario (Todos los días) a las 9am`);

    // Opcional: Imprimir info del bot al arrancar
    try {
        const botInfo = await bot.api.getMe();
        console.log(`🤖 Bot de Telegram conectado: @${botInfo.username}`);
    } catch (e) {
        console.error("⚠️ Error al conectar con Telegram (revisa el Token):", e);
    }
});

// Manejo de errores global
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`❌ Error mientras se manejaba el update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
        console.error("Error de Grammy:", e.description);
    } else if (e instanceof HttpError) {
        console.error("No se pudo contactar a Telegram:", e);
    } else {
        console.error("Error desconocido:", e);
    }
});
