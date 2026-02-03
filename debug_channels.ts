
import axios from "axios";
import "dotenv/config";

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

if (!TOKEN || !PHONE_ID) {
    console.error("❌ Faltan credenciales en .env");
    process.exit(1);
}

const baseUrl = `https://graph.facebook.com/v21.0/${PHONE_ID}`;

async function probeEndpoint(endpoint: string, description: string) {
    try {
        console.log(`\n🔍 Probando: ${description} (/${endpoint})...`);
        const url = `https://graph.facebook.com/v21.0/${PHONE_ID}/${endpoint}`;
        const response = await axios.get(url, {
            headers: { "Authorization": `Bearer ${TOKEN}` }
        });
        console.log(`✅ ¡Éxito!`, JSON.stringify(response.data, null, 2));
    } catch (error: any) {
        console.log(`❌ Falló (${endpoint}):`, error.response?.data?.error?.message || error.message);
    }
}

async function run() {
    console.log("🕵️‍♂️ Explorando invitaciones de canales...");

    // Intento 1: Endpoints probables para invitaciones
    await probeEndpoint("newsletter_admin_invitations", "Invitaciones Admin (Newsletter)");
    await probeEndpoint("channel_invites", "Invitaciones Canal");

    // Intento 2: Listar canales donde ya es miembro (por si ya se aceptó sola?)
    await probeEndpoint("newsletters", "Canales (Newsletters)");
    await probeEndpoint("subscribed_newsletters", "Canales Suscritos");
}

run();
