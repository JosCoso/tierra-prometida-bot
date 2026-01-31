
import axios from "axios";

// Credenciales de PRODUCCIÓN (Hardcoded solo para este test temporal o pasadas por env)
const TOKEN = process.env.PROD_TOKEN;
const PHONE_ID = process.env.PROD_PHONE_ID;
const TO_PHONE = process.env.PROD_TO_PHONE || "52556484215"; // Tu número personal de pruebas

async function sendTestMessage() {
    if (!TOKEN || !PHONE_ID) {
        console.error("❌ Faltan credenciales PROD_TOKEN o PROD_PHONE_ID");
        return;
    }

    const url = `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`;

    console.log(`📤 Enviando mensaje de prueba a ${TO_PHONE}...`);
    console.log(`📱 Phone ID: ${PHONE_ID}`);

    try {
        const response = await axios.post(
            url,
            {
                messaging_product: "whatsapp",
                to: TO_PHONE,
                type: "text",
                text: { body: "🔔 Prueba de configuración de PRODUCCIÓN exitosa. ¡Hola desde el nuevo número!" }
            },
            {
                headers: {
                    "Authorization": `Bearer ${TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );
        console.log("✅ ¡Éxito! Respuesta de Meta:", JSON.stringify(response.data, null, 2));
    } catch (error: any) {
        console.error("❌ Error al enviar:", error.response?.data || error.message);
    }
}

sendTestMessage();
