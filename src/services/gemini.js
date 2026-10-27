import axios from "axios";
import { getVisionPrompt } from "./visionPrompts";
import { analyzeImageWithGroq, hasGroqKey } from "./groq";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Keep a conservative, production-safe list. Avoid speculative 3.x names.
// If the API key doesn't support one of these, discovery will skip it.
const PREFERRED_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
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

    const VISION_RE = /flash|pro|vision|gemini/i;
    const supportsVision = (m) =>
      m.supportedGenerationMethods?.includes("generateContent") &&
      VISION_RE.test(m.name);

    for (const id of PREFERRED_MODELS) {
      if (models.find((m) => m.name === `models/${id}` && supportsVision(m))) {
        return id;
      }
    }

    const fallback = models.find(supportsVision);
    if (fallback) return fallback.name.replace("models/", "");
  } catch (err) {
    if (axios.isCancel(err) || err.name === "CanceledError") throw err;
    // Discovery failed — fall through to direct probe below
  }

  return null;
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
    400: {
      ar: "طلب غير صالح. تحقق من الصورة والموديل والمحاولات السابقة.",
      en: "Invalid request. Check the image, selected model, and request details.",
      code: "INVALID_REQUEST",
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

  const discovered = cachedModel ?? (await discoverModel(signal));
  const queue = discovered
    ? [discovered, ...PREFERRED_MODELS.filter((m) => m !== discovered)]
    : [...PREFERRED_MODELS];

  let lastStatus = 404;

  for (const model of queue) {
    try {
      const text = await callModelWithRetry(model, base64, prompt, signal);

      if (text) {
        cachedModel = model;
        return text;
      }

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

        if (status === 400) {
          console.error("Gemini rejected the request:", {
            status,
            model,
            error: err.response?.data,
          });
          throw httpError(status, language);
        }

        if (status === 404) {
          if (cachedModel === model) cachedModel = null;
          continue;
        }

        if (status >= 500) {
          continue;
        }

        if ((status === 429 || bodyStatus === "RESOURCE_EXHAUSTED") && hasGroqKey()) {
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
            console.warn(
              "Groq fallback failed:",
              groqErr.response?.status,
              groqErr.response?.data || groqErr.message
            );
          }
        }

        throw httpError(status, language);
      }

      throw err;
    }
  }

  throw httpError(lastStatus, language);
}
