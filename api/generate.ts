
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";


export const config = {
  api: {
    bodyParser: {
      sizeLimit: "6mb",
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "API key not configured on server" });
  }

  const { imageDataUrl, prompt } = req.body;

  if (!imageDataUrl || !prompt) {
    return res.status(400).json({ error: "Missing imageDataUrl or prompt" });
  }

  // Parse the data URL
  const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
  if (!match) {
    return res.status(400).json({ error: "Invalid imageDataUrl format" });
  }
  const [, mimeType, base64Data] = match;

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            { text: prompt },
          ],
        },
      });

      const imagePart = response.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData
      );

      if (imagePart?.inlineData) {
        return res.status(200).json({
          mimeType: imagePart.inlineData.mimeType,
          data: imagePart.inlineData.data,
        });
      }

      // Gemini responded with text instead of an image
      return res.status(422).json({
        error: "no_image",
        text: response.text ?? "No response",
      });
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      const isInternal = msg.includes('"code":500') || msg.includes("INTERNAL");

      if (isInternal && attempt < maxRetries) {
        await new Promise((r) =>
          setTimeout(r, 1000 * Math.pow(2, attempt - 1))
        );
        continue;
      }
      break;
    }
  }

  const errMsg =
    lastError instanceof Error ? lastError.message : String(lastError);
  return res.status(500).json({ error: errMsg });
}