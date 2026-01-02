import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import "dotenv/config";
import { parseTime, formatTime } from "./time_utils.js";

async function inspectHours() {
    try {
        const creds = require("./credentials.json");
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID!, serviceAccountAuth);
        await doc.loadInfo();

        console.log(`📄 Documento: ${doc.title}`);

        // Revisar la primera hoja (o buscar Enero/Abril si prefieres)
        const sheet = doc.sheetsByIndex[0];
        if (!sheet) {
            console.log("❌ No se encontró ninguna hoja.");
            return;
        }
        console.log(`📑 Hoja: ${sheet.title}`);

        await sheet.loadHeaderRow(3); // Asumiendo headers en fila 3
        console.log(`📋 Columnas encontradas: ${sheet.headerValues.join(", ")}`);
        const rows = await sheet.getRows();

        console.log(`\n🔍 Revisando columna 'Hora' (${rows.length} filas):`);

        const uniqueHours = new Set<string>();

        rows.forEach((row, index) => {
            const hora = row.get("Hora");
            const evento = row.get("Evento");

            if (evento && hora) {
                uniqueHours.add(hora);
                // Imprimir muestra de los primeros 10 o si tiene formato raro
                if (index < 5) {
                    console.log(`   - Fila ${index + 4}: "${hora}" (${evento})`);
                }
            }
        });

        console.log("\n📊 Resumen de formatos encontrados y su interpretación:");
        uniqueHours.forEach(h => {
            const parsed = parseTime(h);
            const formatted = parsed !== null ? formatTime(parsed) : "❌ Invalid";
            console.log(`   • "${h}" -> ${formatted} (${parsed} min)`);
        });

    } catch (error) {
        console.error("Error:", error);
    }
}

inspectHours();
