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
    // FREEZE: Desactivado temporalmente por solicitud del usuario
    // import("./scheduler.js").then(m => m.checkStellarEvents(bot, doc, CANAL_ID));
}, cronOptions);

console.log(`Bot iniciado. Zona horaria: ${TIMEZONE}`);
console.log("Programación: Mensual (Día 1), Semanal (Lun) y Diario (Todos los días) a las 9am");

// 5. EJECUCIÓN AL INICIO (Recuperación de fallos)
// Ejecutar el agendador al arrancar para:
// a) Programar el recordatorio de hoy si aún no pasa.
// b) Enviarlo inmediatamente si ya pasó y el bot estaba apagado.
scheduleDailySummary(bot, doc, CANAL_ID);

// Configurar comandos de prueba


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
    // Determinar destino: En producción al Canal, en desarrollo al chat actual
    const targetChatId = process.env.NODE_ENV === 'development' ? ctx.chat?.id : CANAL_ID;

    if (targetChatId) {
        await bot.api.sendMessage(targetChatId, texto, { parse_mode: "Markdown" });
        if (process.env.NODE_ENV === 'development') {
            await ctx.reply("✅ Información enviada a este chat (Modo Desarrollo).");
        } else {
            await ctx.reply("✅ Información enviada al canal (Modo Producción).");
        }
    }
});

// Importar funciones de menú
import { showSpecificMenu, showMonthActions, showWeeksMenu, showDaysMenu, showMenu as showInteractiveMenu } from "./interactive_menu.js";

// --- HANDLERS DEL MENÚ INTERACTIVO ---

// 0. Demos Rápidas
bot.callbackQuery("demo_mes", async (ctx) => {
    await ctx.answerCallbackQuery("Generando resumen de Enero...");
    const targetChatId = process.env.NODE_ENV === 'development' ? ctx.chat?.id : CANAL_ID;
    if (!targetChatId) return;

    await enviarResumenMensual(bot, doc, targetChatId, "Enero");

    const msg = process.env.NODE_ENV === 'development'
        ? "✅ Demo Mensual (Enero) enviada a este chat (Dev)."
        : "✅ Demo Mensual (Enero) enviada al canal.";
    await ctx.reply(msg);
});

bot.callbackQuery("demo_semana", async (ctx) => {
    await ctx.answerCallbackQuery("Generando resumen semanal...");
    const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();
    const range = getWeekDateRange(targetYear, 0, 1); // Semana 1 Enero
    if (range) {
        const targetChatId = process.env.NODE_ENV === 'development' ? ctx.chat?.id : CANAL_ID;
        if (targetChatId) {
            await enviarResumenSemanal(bot, doc, targetChatId, range.start);
            const msg = process.env.NODE_ENV === 'development'
                ? `✅ Demo Semanal enviada a este chat (Dev).`
                : `✅ Demo Semanal enviada al canal.`;
            await ctx.reply(msg);
        }
    } else {
        await ctx.reply("❌ Error al calcular la semana simulada.");
    }
});

bot.callbackQuery("demo_dia", async (ctx) => {
    await ctx.answerCallbackQuery("Generando resumen diario...");
    const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();
    const simulatedDate = new Date(targetYear, 0, 4); // 4 Enero
    const targetChatId = process.env.NODE_ENV === 'development' ? ctx.chat?.id : CANAL_ID;
    if (!targetChatId) return;

    await enviarRecordatorioDiario(bot, doc, targetChatId, simulatedDate);
    const msg = process.env.NODE_ENV === 'development'
        ? "✅ Demo Diaria enviada a este chat (Dev)."
        : "✅ Demo Diaria enviada al canal.";
    await ctx.reply(msg);
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
    const targetChatId = process.env.NODE_ENV === 'development' ? ctx.chat?.id : CANAL_ID;
    if (!targetChatId) return;

    // Fire-and-forget para evitar timeouts
    enviarResumenMensual(bot, doc, targetChatId, month)
        .then(() => {
            const msg = process.env.NODE_ENV === 'development'
                ? `✅ Resumen Mensual (${month}) enviado a este chat.`
                : `✅ Resumen Mensual (${month}) enviado al canal.`;
            ctx.reply(msg);
        })
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
        const targetChatId = process.env.NODE_ENV === 'development' ? ctx.chat?.id : CANAL_ID;
        if (!targetChatId) return;

        // Fire-and-forget
        enviarResumenSemanal(bot, doc, targetChatId, range.start)
            .then(() => {
                const msg = process.env.NODE_ENV === 'development'
                    ? `✅ Resumen Semanal (${month}) enviado a este chat.`
                    : `✅ Resumen Semanal (${month}) enviado al canal.`;
                ctx.reply(msg);
            })
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
    const targetChatId = process.env.NODE_ENV === 'development' ? ctx.chat?.id : CANAL_ID;
    if (!targetChatId) return;

    // NO esperar a que termine (fire-and-forget) para evitar timeout del webhook de Telegram
    // Telegram reintenta si no respondemos 200 OK rápido, lo que causa mensajes duplicados.
    enviarRecordatorioDiario(bot, doc, targetChatId, simulatedDate)
        .then(() => {
            const msg = process.env.NODE_ENV === 'development'
                ? `✅ Resumen Diario (${day} ${month}) enviado a este chat.`
                : `✅ Resumen Diario (${day} ${month}) enviado al canal.`;
            ctx.reply(msg);
        })
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


// 2. COMANDO: "[Mes] Semana [N]" o "/semana [N] [Mes]"


// 3. COMANDO: "[Día] de [Mes]" o "/dia [Día] [Mes]"


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
// --- TELEGRAM WEBHOOK ---
// IMPORTANTE: En DESARROLLO usamos Long Polling, así que NO activamos el webhook receiver de Telegram
// para evitar conflictos. En PRODUCCION sí.
import { webhookCallback } from "grammy";

if (process.env.NODE_ENV !== 'development') {
    app.post("/telegram", webhookCallback(bot, "express"));
}

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

            // 1. Manejo de mensajes no soportados (Stickers, Encuestas, etc.)
            if (message.type === "unsupported" || message.type === "system") {
                console.log(`⚠️ [WHATSAPP] Mensaje especial/no-soportado recibido:`, JSON.stringify(message, null, 2));

                // Si es una invitación a canal, suele venir aquí o como tipo 'system' hoy en día,
                // pero imprimimos todo para descubrir la estructura exacta.
                return res.sendStatus(200);
            }

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

        // Si estamos en desarrollo, iniciar Polling para no depender de Webhook público
        if (process.env.NODE_ENV === 'development') {
            console.log("🚀 MODO DESARROLLO DETECTADO: Limpiando Webhook e iniciando Long Polling...");
            // Es crucial borrar el webhook antes de iniciar polling, o Telegram dará error
            await bot.api.deleteWebhook();
            bot.start();
        }
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
