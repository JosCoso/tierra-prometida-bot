import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const STORAGE_FILE = path.join(process.cwd(), "rsvp_data.json");

interface RsvpData {
    [messageId: string]: string[]; // Array of userIds
}

// Cargar datos al inicio
let rsvpData: RsvpData = {};

try {
    if (fs.existsSync(STORAGE_FILE)) {
        const rawData = fs.readFileSync(STORAGE_FILE, "utf-8");
        rsvpData = JSON.parse(rawData);
    }
} catch (error) {
    console.error("Error cargando rsvp_data.json:", error);
    rsvpData = {};
}

function saveData() {
    try {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(rsvpData, null, 2));
    } catch (error) {
        console.error("Error guardando rsvp_data.json:", error);
    }
}

export function getVotes(messageId: number): number {
    const key = String(messageId);
    return rsvpData[key] ? rsvpData[key].length : 0;
}

export function toggleVote(messageId: number, userId: number): { count: number, added: boolean } {
    const key = String(messageId);
    const uid = String(userId);

    if (!rsvpData[key]) {
        rsvpData[key] = [];
    }

    const index = rsvpData[key].indexOf(uid);
    let added = false;

    if (index === -1) {
        // Agregar voto
        rsvpData[key].push(uid);
        added = true;
    } else {
        // Quitar voto
        rsvpData[key].splice(index, 1);
        added = false;
    }

    saveData();

    return {
        count: rsvpData[key].length,
        added
    };
}
