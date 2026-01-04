import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import * as fs from "fs";
import "dotenv/config";

async function debugSheet() {
    console.log("Iniciando debug...");
    console.log("SPREADSHEET_ID:", process.env.SPREADSHEET_ID ? "OK" : "MISSING");

    try {
        const credsRaw = fs.readFileSync("./credentials.json", "utf-8");
        const creds = JSON.parse(credsRaw);
        console.log("Credenciales cargadas OK");

        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID!, serviceAccountAuth);
        await doc.loadInfo();
        console.log(`Título del documento: ${doc.title}`);

        // Buscar hoja de ABRIL
        const sheet = doc.sheetsByIndex.find(s => s.title.toUpperCase().includes("ABRIL"));
        if (!sheet) {
            console.log("❌ No se encontró la hoja de ABRIL");
            console.log("Hojas disponibles:", doc.sheetsByIndex.map(s => s.title).join(", "));
            return;
        }

        console.log(`✅ Hoja encontrada: ${sheet.title}`);

        // Cargar metadata
        await sheet.loadCells('A2:B2');
        console.log("Título (A2):", sheet.getCell(1, 0).value);
        console.log("Descripción (B2):", sheet.getCell(1, 1).value);

        await sheet.loadHeaderRow(3);
        console.log("Cabeceras:", sheet.headerValues);
        const rows = await sheet.getRows();
        console.log(`Filas encontradas: ${rows.length}`);

        rows.forEach((row, index) => {
            const dia = row.get("Día");
            if (dia == 2 || dia == "2") {
                console.log(`[${index + 1}] Día: ${dia} | Evento: ${row.get("Evento")}`);
            }
        });
    } catch (error) {
        console.error("Error durante el debug:", error);
    }
}

debugSheet();
