import axios from "axios";
import { getVisionPrompt } from "./visionPrompts";
import { analyzeImageWithGroq, hasGroqKey } from "./groq";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Tried in order — all support vision + generateContent
const PREFERRED_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-2.5-flash",
];

let cachedModel = null;

/* ------------------------------------------------------------------ */
/* Model discovery                                                     */
/* ------------------------------------------------------------------ */

async function discoverModel(signal) {
  try {
    const { data } = await axios.get(`${BASE}/models`, {
      params: { key: API_KEY },
      signal,
      timeout: 8000,
    });

    const models = data?.models ?? [];

    // Only consider models that explicitly support generateContent
    // AND look like vision-capable models (flash / pro / vision keywords)
    const VISION_RE = /flash|pro|vision|gemini/i;
    const supportsVision = (m) =>
      m.supportedGenerationMethods?.includes("generateContent") &&
      VISION_RE.test(m.name);

    // Prefer models in our ranked list first
    for (const id of PREFERRED_MODELS) {
      if (models.find((m) => m.name === `models/${id}` && supportsVision(m))) {
        return id;
      }
    }

    // Any vision-capable model from the API as last resort
    const fallback = models.find(supportsVision);
    if (fallback) return fallback.name.replace("models/", "");
  } catch (err) {
    if (axios.isCancel(err) || err.name === "CanceledError") throw err;
    // Discovery failed — fall through to direct probe below
  }

  return null; // signal: no discovery result, probe directly
}

/* ------------------------------------------------------------------ */
/* Single request (with one retry for transient 5xx)                  */
/* ------------------------------------------------------------------ */

async function callModel(model, base64, prompt, signal) {
  const { data } = await axios.post(
    `${BASE}/models/${model}:generateContent`,
    {
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 800,
        candidateCount: 1,
      },
    },
    { params: { key: API_KEY }, signal }
  );

  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim() || null
  );
}

async function callModelWithRetry(model, base64, prompt, signal) {
  try {
    return await callModel(model, base64, prompt, signal);
  } catch (err) {
    if (axios.isCancel(err) || err.name === "CanceledError") throw err;
    // One retry for transient server errors (500/502/503/504)
    if (err.response?.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500));
      return callModel(model, base64, prompt, signal);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Error mapping                                                       */
/* ------------------------------------------------------------------ */

function httpError(status, language) {
  const map = {
    401: {
      ar: "مفتاح API غير صالح. تحقق من ملف .env.local.",
      en: "Invalid API key. Check your .env.local file.",
      code: "INVALID_KEY",
    },
    403: {
      ar: "انتهت حصة الاستخدام المجاني. حاول غداً أو راجع مفتاح API.",
      en: "Daily free quota exceeded. Try again tomorrow or check your API key.",
      code: "QUOTA_EXCEEDED",
    },
    429: {
      ar: "تجاوزت حد الطلبات. انتظر لحظة ثم حاول مرة أخرى.",
      en: "Too many requests. Wait a moment and try again.",
      code: "RATE_LIMITED",
    },
    503: {
      ar: "الخادم مشغول مؤقتاً. حاول مرة أخرى.",
      en: "Server temporarily busy. Please try again.",
      code: "SERVER_BUSY",
    },
  };
  const entry = map[status];
  const e = new Error(
    entry
      ? (entry[language] ?? entry.en)
      : language === "ar"
      ? `خطأ من الخادم (${status}).`
      : `Server error (${status}).`
  );
  e.httpStatus = status;
  e.code = entry?.code ?? "API_ERROR";
  return e;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function analyzeImage({
  image,
  mode = "general",
  language = "en",
  signal,
}) {
  if (!API_KEY) {
    const e = new Error(
      language === "ar"
        ? "مفتاح Gemini غير مُهيأ."
        : "Gemini API key is not configured."
    );
    e.code = "NO_API_KEY";
    throw e;
  }

  if (!image) throw new Error("No image provided.");

  if (!navigator.onLine) {
    const e = new Error("NETWORK_REQUIRED");
    e.code = "NETWORK_REQUIRED";
    throw e;
  }

  const base64 = image.includes(",") ? image.split(",")[1] : image;
  const prompt = getVisionPrompt(mode, language);

  // Build a queue: discovered model first, then full preferred list as fallback.
  // This means even if discovery fails entirely, every known model is tried.
  const discovered = cachedModel ?? (await discoverModel(signal));
  const queue = discovered
    ? [discovered, ...PREFERRED_MODELS.filter((m) => m !== discovered)]
    : [...PREFERRED_MODELS];

  let lastStatus = 404;

  for (const model of queue) {
    try {
      const text = await callModelWithRetry(model, base64, prompt, signal);

      if (text) {
        cachedModel = model; // remember what worked for next call
        return text;
      }

      // Empty response — model responded but gave nothing useful
      throw new Error(
        language === "ar"
          ? "لم يُرجع الموديل أي نتيجة."
          : "Model returned no result."
      );
    } catch (err) {
      if (axios.isCancel(err) || err.name === "CanceledError") throw err;

      if (err.response) {
        const status = err.response.status;
        const bodyStatus = err.response.data?.error?.status;
        lastStatus = status;

        if (status === 404) {
          // Model doesn't exist — wipe cache and try the next one
          if (cachedModel === model) cachedModel = null;
          continue;
        }

        if (status >= 500) {
          // Transient server error — try next model after retry already failed
          continue;
        }

        // Gemini quota/rate-limit → fall back to Groq Vision if configured
        if (
          (status === 429 || bodyStatus === "RESOURCE_EXHAUSTED") &&
          hasGroqKey()
        ) {
          try {
            const groqText = await analyzeImageWithGroq({
              image: base64,
              mode,
              language,
              signal,
            });
            if (groqText) return groqText;
          } catch (groqErr) {
            if (axios.isCancel(groqErr) || groqErr.name === "CanceledError") {
              throw groqErr;
            }
            // Groq also failed — surface the original Gemini error
          }
        }

        // 401, 403, 429, other 4xx — stop immediately
        throw httpError(status, language);
      }

      // Network / timeout — propagate
      throw err;
    }
  }

  // Every model in the queue returned 404
  throw httpError(lastStatus, language);
}
