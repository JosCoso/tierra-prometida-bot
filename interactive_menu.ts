import { Context, InlineKeyboard } from "grammy";

export async function showMenu(ctx: Context) {
    const keyboard = new InlineKeyboard()
        .text("📅 Semana", "demo_semana").text("☀️ Día", "demo_dia").row()
        .text("🗓 Mes", "demo_mes").text("📂 Específico", "menu_specific").row()
        .text("❌ Cancelar", "cancel");

    await ctx.reply("🤖 *Menú Interactivo*\nSelecciona una opción:", {
        reply_markup: keyboard,
        parse_mode: "Markdown",
    });
}

// Helper para ignorar errores de "message is not modified"
async function safeEditMessageText(ctx: Context, text: string, extra: any) {
    try {
        await ctx.editMessageText(text, extra);
    } catch (error: any) {
        if (error.description && error.description.includes("message is not modified")) {
            // Ignorar este error, es inofensivo
            return;
        }
        throw error; // Re-lanzar otros errores
    }
}

// 1. Menú de Meses
export async function showSpecificMenu(ctx: Context) {
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const keyboard = new InlineKeyboard();

    meses.forEach((mes, index) => {
        keyboard.text(mes.substring(0, 3), `month:${mes}`);
        if ((index + 1) % 4 === 0) keyboard.row();
    });

    keyboard.row().text("🔙 Volver", "menu_main");

    // Editar mensaje existente si es posible, sino enviar nuevo
    if (ctx.callbackQuery?.message) {
        await safeEditMessageText(ctx, "🗓 Selecciona un Mes:", { reply_markup: keyboard });
    } else {
        await ctx.reply("🗓 Selecciona un Mes:", { reply_markup: keyboard });
    }
}

// 2. Acciones del Mes
export async function showMonthActions(ctx: Context, month: string) {
    const keyboard = new InlineKeyboard()
        .text("📅 Resumen Mensual", `act_month:${month}`).row()
        .text("🗓 Elegir Semana", `sel_week:${month}`).row()
        .text("☀️ Elegir Día", `sel_day:${month}`).row()
        .text("🔙 Volver", "menu_specific");

    await safeEditMessageText(ctx, `⚙️ Opciones para *${month}*:`, {
        reply_markup: keyboard,
        parse_mode: "Markdown"
    });
}

// 3. Elegir Semana
export async function showWeeksMenu(ctx: Context, month: string) {
    const keyboard = new InlineKeyboard();
    // 5 semanas
    for (let i = 1; i <= 5; i++) {
        keyboard.text(`Semana ${i}`, `act_week:${month}:${i}`);
        if (i % 2 === 0) keyboard.row(); // 2 por fila
    }
    keyboard.row().text("🔙 Volver", `month:${month}`);

    await safeEditMessageText(ctx, `🗓 Selecciona la semana de *${month}*:`, {
        reply_markup: keyboard,
        parse_mode: "Markdown"
    });
}

// 4. Elegir Día
export async function showDaysMenu(ctx: Context, month: string) {
    const keyboard = new InlineKeyboard();
    // 31 días
    for (let i = 1; i <= 31; i++) {
        keyboard.text(`${i}`, `act_day:${month}:${i}`);
        if (i % 7 === 0) keyboard.row(); // 7 por fila
    }
    keyboard.row().text("🔙 Volver", `month:${month}`);

    await safeEditMessageText(ctx, `☀️ Selecciona el día de *${month}*:`, {
        reply_markup: keyboard,
        parse_mode: "Markdown"
    });
}
