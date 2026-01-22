import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const API_KEY = process.env.GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

if (API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-pro" });
} else {
    console.warn("⚠️ GEMINI_API_KEY no configurada. Se usarán saludos estáticos.");
}

export class AIService {

    async generateDailyGreeting(eventos: string[], theme?: string, verse?: string): Promise<string> {
        // Fallback rápido si no hay API Key o modelo
        if (!model) return this.getStaticGreeting();

        try {
            let contextExtra = "";
            if (theme) contextExtra += `- El tema del mes es: "${theme}".\n`;
            if (verse) contextExtra += `- El versículo/lema del mes es: "${verse}".\n`;

            const prompt = `
            Eres un asistente virtual para una comunidad cristiana llamada "Tierra Prometida".
            Tu tarea es generar un saludo corto, cálido y motivador para el mensaje de la agenda del día.
            
            Contexto:
            - Hoy es un nuevo día.
            - Los eventos de hoy son: ${eventos.join(", ")}.
            ${contextExtra}
            
            Instrucciones:
            - El saludo debe ser de 1 o 2 frases máximo.
            - Debe conectar temáticamente con los eventos y, si es posible, con el tema del mes.
            - Usa emojis.
            - NO pongas "Hola" ni "Buenos días" al inicio, ve directo a la frase inspiradora.
            - Tono: Familiar, esperanzador, alegre.
            
            Ejemplo de salida deseada:
            "✨ ¡Caminemos hoy con fe inquebrantable en cada paso que demos!"
            `;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            return text.trim();

        } catch (error) {
            console.error("❌ Error generando saludo con Gemini:", error);
            return this.getStaticGreeting();
        }
    }

    private getStaticGreeting(): string {
        const saludos = [
            "✨ ¡Un día lleno de bendición para todos!",
            "🚀 ¡Ánimo! Hoy es un gran día.",
            "🕊️ Preparemos nuestro corazón para lo que viene.",
            "📅 Aquí está la agenda de hoy:",
            "👋 ¡Esperamos verlos a todos!"
        ];
        return saludos[Math.floor(Math.random() * saludos.length)] || "¡Buen día!";
    }
}

export const aiService = new AIService();
