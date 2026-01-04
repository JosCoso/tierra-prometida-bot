import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import "dotenv/config";

const creds = require("./credentials.json");

const serviceAccountAuth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);

async function debug() {
    await doc.loadInfo();
    console.log(`Doc Title: ${doc.title}`);

    const sheet = doc.sheetsByIndex.find(s => s.title.toUpperCase().includes("FEBRERO"));
    if (!sheet) {
        console.log("❌ No se encontró la hoja FEBRERO");
        return;
    }

    console.log(`✅ Hoja encontrada: ${sheet.title}`);
    await sheet.loadHeaderRow(3); // Asumimos headers en fila 3
    console.log(`Cabeceras: ${sheet.headerValues.join(", ")}`);

    const rows = await sheet.getRows();
    console.log(`Filas encontradas: ${rows.length}`);

    if (rows.length > 0) {
        const row = rows[0];
        console.log("--- Primera Fila ---");
        console.log(`Evento: ${row.get("Evento")}`);
        console.log(`Día: ${row.get("Día")}`);
        console.log(`Mes: ${row.get("Mes")}`);
        console.log(`Estado: ${row.get("Estado")}`);
    } else {
        console.log("⚠️ La hoja parece vacía (sin filas de datos)");
    }
}

debug();
