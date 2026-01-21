import axios from "axios";
import "dotenv/config";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.warn("⚠️ Faltan credenciales de WhatsApp (WHATSAPP_TOKEN o WHATSAPP_PHONE_ID). El servicio no funcionará.");
}

export class WhatsAppService {
    private baseUrl: string;

    constructor() {
        this.baseUrl = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`;
    }

    async sendMessage(to: string, text: string) {
        if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
            console.error("❌ No se puede enviar mensaje: Faltan credenciales de WhatsApp.");
            return;
        }

        try {
            const data = {
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: { body: text }
            };

            const config = {
                headers: {
                    "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json"
                }
            };

            const response = await axios.post(this.baseUrl, data, config);
            console.log(`✅ Mensaje de WhatsApp enviado a ${to}: ${response.status}`);
            return response.data;
        } catch (error: any) {
            console.error("❌ Error enviando mensaje de WhatsApp:", error.response?.data || error.message);
            // No lanzamos error para no interrumpir el flujo principal
        }
    }
}

export const whatsappService = new WhatsAppService();
