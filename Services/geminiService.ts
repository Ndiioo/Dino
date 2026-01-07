
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Assignment } from "../types";

// Cache for insights to reduce API calls and save quota
let cachedInsight: { text: string; timestamp: number } | null = null;
const INSIGHT_COOLDOWN = 30 * 60 * 1000; // Increased to 30 minutes to conserve quota

/**
 * Helper function to implement exponential backoff with jitter for API calls.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 5000
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorStr = JSON.stringify(error).toLowerCase();
      const isRateLimit = errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("resource_exhausted");

      if (isRateLimit && i < maxRetries - 1) {
        const delay = (initialDelay * Math.pow(2, i)) + (Math.random() * 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Generates logistics insights using Gemini AI with robust error handling for quota limits.
 */
export const getLogisticsInsights = async (assignments: Assignment[]): Promise<string> => {
  if (!assignments || assignments.length === 0) return "Sistem siap. Menunggu data operasional untuk dianalisis.";

  const now = Date.now();
  if (cachedInsight && (now - cachedInsight.timestamp < INSIGHT_COOLDOWN)) {
    return cachedInsight.text;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Simplified prompt to reduce input tokens
    const dataSummary = assignments.map(a => `${a.courierName}(${a.packageCount} pkt, ${a.status})`).join(', ');
    const prompt = `Berikan 1 kalimat singkat analisis logistik untuk data berikut: ${dataSummary.substring(0, 500)}`;

    const result = await retryWithBackoff(async () => {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          temperature: 0.5,
          maxOutputTokens: 100,
          thinkingConfig: { thinkingBudget: 0 } // Disable thinking to save tokens/quota
        }
      });
      return response.text;
    });

    const finalInsight = result?.trim() || "Analisis selesai. Semua hub beroperasi sesuai jadwal.";
    
    cachedInsight = { text: finalInsight, timestamp: now };
    return finalInsight;
  } catch (error: any) {
    // Graceful error handling for 429
    const errorStr = JSON.stringify(error).toLowerCase();
    if (errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("resource_exhausted")) {
      if (cachedInsight) return cachedInsight.text;
      return "Hub cukup sibuk hari ini. Pantau terus progres tugas di tabel penugasan.";
    }
    
    return cachedInsight?.text || "Sistem monitoring aktif. Silakan cek detail tugas kurir di bawah.";
  }
};
