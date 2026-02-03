import { Context, InlineKeyboard } from "grammy";

export async function showMenu(ctx: Context) {
    const keyboard = new InlineKeyboard()
        .text("📅 Semana", "demo_semana").text("☀️ Día", "demo_dia").row()
        .text("🗓 Mes", "demo_mes").text("📂 Específico", "menu_specific").row()
        .text("ℹ️ Información", "menu_info").row()
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

// --- CONSTANTES DE INFORMACIÓN ESTÁTICA ---

const TEXTO_HORARIOS = `
🕒 *HORARIOS SEMANALES* 🕒

*DOMINGO*
• 8:45 y 11:00 am: Asamblea familiar.
_(Semillero de la Fe, Tierra Kids y Conectados en ambos servicios)_
• 11:00 am: Líderes de grupos de oración.
• 11:00 am: Matrimonios Unidos (1er y 3er domingo).
• 1:00 pm: Renovación - Crecimiento - Vencedores.
• 1:00 pm: NEOS Service (jóvenes).

*JUEVES*
• 10:00 am: Oración de poder.
• 6:00 pm: Rehabilitación.

*VIERNES*
• 10:00 am: MujeresTPrometida.
_(Contamos con clases para niños)_

*SÁBADO*
• 11:00 am: Sé Sano.
_(Contamos con clases para niños)_
`;

const TEXTO_GRUPOS = `
👥 *TENEMOS UN LUGAR PARA TI (GRUPOS)* 👥

🌱 *SEMILLERO DE LA FE*
Es un espacio dedicado a los más pequeños de la familia, de 0 a 4 años con sus grupos: semillitas, plantitas, arbolitos y frutitas, te llevará de la mano en los primeros pasos de tu bebé.

🎈 *TIERRA KIDS*
Es el lugar donde los niños y niñas entre 4 y 11 años pueden conocer más de Dios por medio de alabanza, convivencia y clases específicas para su edad.

🔗 *CONECTADOS*
Es el sitio dedicado para todos nuestros adolescentes de 12 a 17 años, donde pueden expresarse, forjar lazos de amistad y crecer en la fe.

🔥 *NEOS*
Este es el punto de encuentro e intimidad con Dios para los jóvenes entre 18 y 30 años que buscan conocer más de Él.

🛡️ *SIERVOS INÚTILES*
Somos los hombres valientes y esforzados que quieren más del Señor y buscan llevar su mensaje de salvación a todo lugar.

🌸 *MUJERESTPROMETIDA*
Somos un grupo de Mujeres Amigas Motivadas a Amar Siempre. Anhelamos cambios en nuestras vidas, familias, trabajos y sociedad, que sólo con la ayuda de Jesucristo y estudiando la Biblia es posible.

❤️‍🩹 *REHABILITACIÓN*
Es el grupo de ayuda para quienes han sufrido alguna adicción y buscan una vida de libertad y plenitud en el Señor.

📖 *RENOVACIÓN*
Si has decidido seguir a Cristo, este es el primer curso para crecer en tu fe, aprender a leer la Biblia y prepararte para el bautismo en agua.
`;


// 5. Menú de Información
export async function showInfoMenu(ctx: Context) {
    const keyboard = new InlineKeyboard()
        .text("🕒 Horarios", "info_schedule").row()
        .text("👥 Ministerios", "info_groups").row()
        .text("🔙 Volver", "menu_main");

    await safeEditMessageText(ctx, "ℹ️ *Sección Informativa*\n¿Qué deseas consultar?", {
        reply_markup: keyboard,
        parse_mode: "Markdown"
    });
}

// 6. Mostrar Horarios
export async function showScheduleText(ctx: Context) {
    const keyboard = new InlineKeyboard().text("🔙 Volver", "menu_info");
    await safeEditMessageText(ctx, TEXTO_HORARIOS, {
        reply_markup: keyboard,
        parse_mode: "Markdown"
    });
}

// 7. Mostrar Grupos
export async function showGroupsText(ctx: Context) {
    const keyboard = new InlineKeyboard().text("🔙 Volver", "menu_info");
    await safeEditMessageText(ctx, TEXTO_GRUPOS, {
        reply_markup: keyboard,
        parse_mode: "Markdown"
    });
}
