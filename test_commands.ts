import { Bot } from "grammy";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { enviarResumenSemanal, enviarRecordatorioDiario, enviarResumenMensual, getMonthNumber, getWeekDateRange } from "./notifications.js";
import { scheduleDailySummary } from "./scheduler.js";

export function setupTestCommands(bot: Bot, doc: GoogleSpreadsheet, canalId: string) {
    // Comando para forzar el resumen semanal ahorita
    // Comando para forzar el resumen semanal (HOY o fecha simulada por SEMANA)
    bot.command("test_semana", async (ctx) => {
        const text = ctx.message?.text || "";
        const args = text.split(" ").slice(1); // ["2", "Enero"]

        let simulatedDate: Date | undefined;

        if (args.length >= 2) {
            const numeroSemana = parseInt(args[0]!, 10);
            const mesNombre = args[1] || "";
            const mesNum = getMonthNumber(mesNombre);

            if (!isNaN(numeroSemana) && mesNum > 0) {
                const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();

                // Calcular el rango de esa semana para obtener el día de inicio (Lunes)
                // getWeekDateRange devuelve { start, end, isLastWeek }
                // Necesitamos importar getWeekDateRange de notifications.ts
                const range = getWeekDateRange(targetYear, mesNum - 1, numeroSemana);

                if (range) {
                    simulatedDate = range.start; // Usamos el lunes de esa semana como fecha simulada
                    await ctx.reply(`📅 Simulando resumen para la Semana ${numeroSemana} de ${mesNombre} (Fecha base: ${simulatedDate.toLocaleDateString()})...`);
                } else {
                    await ctx.reply(`❌ No encontré la semana ${numeroSemana} en ${mesNombre}.`);
                    return;
                }
            } else {
                await ctx.reply("❌ Formato incorrecto. Usa: /test_semana [NumSemana] [Mes] (ej: /test_semana 2 Febrero)");
                return;
            }
        } else {
            await ctx.reply("📅 Generando resumen semanal de esta semana (HOY)...");
        }

        await enviarResumenSemanal(bot, doc, canalId, simulatedDate);
    });

    // Alias: /simular_lunes (Ahora acepta SEMANA para consistencia)
    bot.command("simular_lunes", async (ctx) => {
        const text = ctx.message?.text || "";
        const args = text.split(" ").slice(1); // ["2", "Febrero"]

        let simulatedDate: Date | undefined;

        if (args.length >= 2) {
            const numeroSemana = parseInt(args[0]!, 10);
            const mesNombre = args[1] || "";
            const mesNum = getMonthNumber(mesNombre);

            if (!isNaN(numeroSemana) && mesNum > 0) {
                const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();

                const range = getWeekDateRange(targetYear, mesNum - 1, numeroSemana);

                if (range) {
                    simulatedDate = range.start;
                    await ctx.reply(`🔮 Simulando Lunes de la Semana ${numeroSemana} de ${mesNombre} (Fecha: ${simulatedDate.toLocaleDateString()})...`);
                } else {
                    await ctx.reply(`❌ No encontré la semana ${numeroSemana} en ${mesNombre}.`);
                    return;
                }
            } else {
                await ctx.reply("❌ Formato incorrecto. Usa: /simular_lunes [NumSemana] [Mes] (ej: /simular_lunes 2 Febrero)");
                return;
            }
        } else {
            await ctx.reply("🔮 Simulando que es Lunes HOY...");
        }

        await enviarResumenSemanal(bot, doc, canalId, simulatedDate);
    });

    // Comando para forzar el recordatorio diario (HOY o fecha simulada)
    bot.command("test_dia", async (ctx) => {
        const text = ctx.message?.text || "";
        const args = text.split(" ").slice(1); // ["15", "Abril"]

        let simulatedDate: Date | undefined;

        if (args.length >= 2) {
            const dia = parseInt(args[0]!, 10);
            const mesNombre = args[1] || "";
            const mesNum = getMonthNumber(mesNombre);

            if (!isNaN(dia) && mesNum > 0) {
                const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();
                simulatedDate = new Date(`${targetYear}-${String(mesNum).padStart(2, '0')}-${String(dia).padStart(2, '0')}T00:00:00`);
                await ctx.reply(`☀️ Simulando recordatorio diario para: ${dia} de ${mesNombre}...`);
            } else {
                await ctx.reply("❌ Formato incorrecto. Usa: /test_dia [Día] [Mes] (ej: /test_dia 15 Abril)");
                return;
            }
        } else {
            await ctx.reply("☀️ Revisando y enviando recordatorios de HOY...");
        }

        await enviarRecordatorioDiario(bot, doc, canalId, simulatedDate);
    });

    // Comando para forzar el resumen mensual ahorita
    bot.command("test_mes", async (ctx) => {
        const text = ctx.message?.text || "";
        const args = text.split(" ").slice(1);
        const mesNombre = args[0]; // Puede ser undefined

        if (mesNombre) {
            await ctx.reply(`Generando y enviando resumen mensual de prueba para ${mesNombre}...`);
        } else {
            await ctx.reply("Generando y enviando resumen mensual de prueba (Mes Actual)...");
        }

        await enviarResumenMensual(bot, doc, canalId, mesNombre);
    });

    // Comando para probar el Agendador Inteligente
    bot.command("test_scheduler", async (ctx) => {
        const text = ctx.message?.text || "";
        const args = text.split(" ").slice(1); // ["15", "Abril"]

        let simulatedDate: Date | undefined;

        if (args.length >= 2) {
            const dia = parseInt(args[0]!, 10);
            const mesNombre = args[1] || "";
            const mesNum = getMonthNumber(mesNombre);

            if (!isNaN(dia) && mesNum > 0) {
                const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();
                // Crear fecha a las 00:00:00
                simulatedDate = new Date(`${targetYear}-${String(mesNum).padStart(2, '0')}-${String(dia).padStart(2, '0')}T00:00:00`);
                await ctx.reply(`🔄 Ejecutando Agendador simulando fecha: ${dia} de ${mesNombre}...`);
            } else {
                await ctx.reply("❌ Formato incorrecto. Usa: /test_scheduler [Día] [Mes] (ej: /test_scheduler 15 Abril)");
                return;
            }
        } else {
            await ctx.reply("🔄 Ejecutando Agendador simulando HOY (00:01 AM)...");
        }

        await scheduleDailySummary(bot, doc, canalId, simulatedDate);
        await ctx.reply("✅ Lógica ejecutada. Revisa la consola para ver a qué hora se programó.");
    });

    // Comando para probar Eventos Estelares (5 días antes)
    bot.command("test_estelar", async (ctx) => {
        const text = ctx.message?.text || "";
        const args = text.split(" ").slice(1); // ["29", "Enero"]

        let simulatedDate: Date | undefined;

        if (args.length >= 2) {
            const dia = parseInt(args[0]!, 10);
            const mesNombre = args[1] || "";
            const mesNum = getMonthNumber(mesNombre);

            if (!isNaN(dia) && mesNum > 0) {
                const targetYear = process.env.TARGET_YEAR ? parseInt(process.env.TARGET_YEAR, 10) : new Date().getFullYear();
                // Fecha base (HOY simulado), el bot buscará 5 días ADELANTE de esta fecha
                simulatedDate = new Date(`${targetYear}-${String(mesNum).padStart(2, '0')}-${String(dia).padStart(2, '0')}T00:00:00`);
                await ctx.reply(`🌟 Simulando chequeo estelar desde: ${dia} de ${mesNombre} (Buscará eventos el ${dia + 5})...`);
            } else {
                await ctx.reply("❌ Formato incorrecto. Usa: /test_estelar [Día] [Mes] (ej: /test_estelar 29 Enero)");
                return;
            }
        } else {
            await ctx.reply("🌟 Simulando chequeo estelar desde HOY...");
        }

        // Importar checkStellarEvents de scheduler.ts (necesitamos exportarla primero)
        // Como ya la exporté en el paso anterior, solo la llamo aquí.
        // Pero necesito importarla arriba.
        const { checkStellarEvents } = await import("./scheduler.js");
        await checkStellarEvents(bot, doc, canalId, simulatedDate);
        await ctx.reply("✅ Chequeo estelar finalizado.");
    });

    // Comando para ver lista de demostraciones
    bot.command("demostraciones", async (ctx) => {
        const texto = `
📊 *Demo rápida del Bot* 📊

🔹 /test_dia               – Simula el recordatorio diario.
🔹 /test_semana 2 agosto   – Simula el resumen semanal (semana 2 de agosto).
🔹 /test_mes 03 agosto     – Simula el resumen mensual (3 de agosto).
🔹 /test_estelar 15 diciembre – Simula el aviso de 5 días antes (evento estelar).

Puedes cambiar la fecha que prefieras para probar cualquier día/semana/mes.`;
        await ctx.reply(texto, { parse_mode: "Markdown" });
    });
}
