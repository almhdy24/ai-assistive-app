import axios from "axios";
import { getVisionPrompt } from "./visionPrompts";

const API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const BASE = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export function hasGroqKey() {
  return Boolean(API_KEY);
}

export async function analyzeImageWithGroq({
  image,
  mode = "general",
  language = "en",
  signal,
}) {
  if (!API_KEY) {
    const e = new Error("Groq API key is not configured.");
    e.code = "NO_GROQ_KEY";
    throw e;
  }
  if (!image) throw new Error("No image provided.");

  const base64 = image.includes(",") ? image.split(",")[1] : image;
  const prompt = getVisionPrompt(mode, language);

  const { data } = await axios.post(
    BASE,
    {
      model: MODEL,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
          ],
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      signal,
    }
  );

  return data?.choices?.[0]?.message?.content?.trim() || null;
}
