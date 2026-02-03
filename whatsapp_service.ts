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
            const { formatTelegramToWhatsapp } = await import("./formatting.js");
            const cleanText = formatTelegramToWhatsapp(text);

            const data = {
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: { body: cleanText }
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

    async sendChannelMessage(channelId: string, text: string) {
        if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
            console.error("❌ No se puede enviar mensaje al canal: Faltan credenciales.");
            return;
        }

        console.log(`📤 Intentando enviar mensaje al canal ${channelId}...`);
        return this.sendMessage(channelId, text);
    }

    async sendImage(to: string, filePath: string, caption?: string) {
        if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
            console.error("❌ No se puede enviar imagen: Faltan credenciales.");
            return;
        }

        try {
            // 1. Subir la imagen a WhatsApp
            const mediaId = await this.uploadMedia(filePath);
            if (!mediaId) return;

            // 2. Enviar el mensaje con la imagen
            const data = {
                messaging_product: "whatsapp",
                to: to,
                type: "image",
                image: { id: mediaId },
                ...(caption && { caption: caption })
            };

            const config = {
                headers: {
                    "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json"
                }
            };

            const response = await axios.post(this.baseUrl, data, config);
            console.log(`✅ Imagen enviada a WhatsApp (${to}): ${response.status}`);
            return response.data;

        } catch (error: any) {
            console.error("❌ Error enviando imagen de WhatsApp:", error.response?.data || error.message);
        }
    }

    private async uploadMedia(filePath: string): Promise<string | null> {
        try {
            console.log(`📤 Subiendo imagen a WhatsApp: ${filePath}`);
            const fs = await import("fs");
            const fd = new FormData();

            // Node 20+ supports File/Blob from buffers or fileFromPath?
            // Safer to use Blob with fs.readFileSync for now to avoid stream complexity with native FormData
            const fileBuffer = fs.readFileSync(filePath);
            const blob = new Blob([fileBuffer], { type: "image/png" }); // Asumimos PNG por ahora (nuestras imágenes son PNG)

            fd.append("file", blob, "image.png");
            fd.append("messaging_product", "whatsapp");

            const uploadUrl = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/media`;

            const response = await fetch(uploadUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${WHATSAPP_TOKEN}`
                },
                body: fd
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Upload failed: ${response.status} ${err}`);
            }

            const json: any = await response.json();
            console.log(`✅ Media subido. ID: ${json.id}`);
            return json.id;

        } catch (error) {
            console.error("❌ Error subiendo media a WhatsApp:", error);
            return null;
        }
    }
}

export const whatsappService = new WhatsAppService();
