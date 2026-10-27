import axios from "axios";
import { getVisionPrompt } from "./visionPrompts";
import { analyzeImageWithGroq, hasGroqKey } from "./groq";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 25000;
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
const RESULT_CACHE_TTL_MS = 60 * 1000;

const PREFERRED_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-pro",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
];

let cachedModel = null;
let cachedModelAt = 0;
const resultCache = new Map();
const inFlightRequests = new Map();

function debugGemini(label, details) {
  if (import.meta.env.DEV) {
    console.info(`[gemini-debug] ${label}`, details);
  }
}

function getModelCacheKey(image, mode, language) {
  return `${mode}:${language}:${image.slice(-256)}`;
}

function pruneResultCache() {
  const now = Date.now();
  for (const [key, value] of resultCache.entries()) {
    if (now - value.cachedAt > RESULT_CACHE_TTL_MS) {
      resultCache.delete(key);
    }
  }
}

async function discoverModel(signal) {
  try {
    const { data } = await axios.get(`${BASE}/models`, {
      params: { key: API_KEY },
      signal,
      timeout: REQUEST_TIMEOUT_MS,
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
  }

  return null;
}

async function getPreferredModel(signal) {
  const now = Date.now();

  if (cachedModel && now - cachedModelAt < MODEL_CACHE_TTL_MS) {
    return cachedModel;
  }

  const discovered = await discoverModel(signal);
  cachedModel = discovered || "gemini-2.5-flash";
  cachedModelAt = now;
  return cachedModel;
}

async function callModel(model, base64, prompt, signal) {
  debugGemini("generateContent request", {
    model,
    payloadSize: base64.length,
    promptLength: prompt.length,
  });

  const { data } = await axios.post(
    `${BASE}/models/${model}:generateContent`,
    {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 800,
        candidateCount: 1,
      },
    },
    {
      params: { key: API_KEY },
      signal,
      timeout: REQUEST_TIMEOUT_MS,
    }
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

function httpError(status, language) {
  const map = {
    400: {
      ar: "طلب غير صالح. تحقق من الصورة والموديل وإعدادات الطلب.",
      en: "Invalid request. Check the image, model, and request payload.",
      code: "INVALID_REQUEST",
    },
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
  const cacheKey = getModelCacheKey(base64, mode, language);
  pruneResultCache();

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < RESULT_CACHE_TTL_MS) {
    return cached.value;
  }

  const requestPromise = (async () => {
    const model = await getPreferredModel(signal);
    const queue = [model, ...PREFERRED_MODELS.filter((m) => m !== model)];
    let lastStatus = 404;

    for (const candidate of queue) {
      try {
        const text = await callModelWithRetry(candidate, base64, prompt, signal);

        if (text) {
          resultCache.set(cacheKey, { value: text, cachedAt: Date.now() });
          cachedModel = candidate;
          cachedModelAt = Date.now();
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

          debugGemini("provider error", {
            status,
            model: candidate,
            error: err.response?.data,
          });

          if (status === 400) {
            console.error("Gemini rejected the request:", {
              status,
              model: candidate,
              error: err.response?.data,
              payloadSize: base64.length,
            });
            throw httpError(status, language);
          }

          if (status === 404) {
            if (cachedModel === candidate) {
              cachedModel = null;
              cachedModelAt = 0;
            }
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
              if (groqText) {
                resultCache.set(cacheKey, { value: groqText, cachedAt: Date.now() });
                return groqText;
              }
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
  })();

  inFlightRequests.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

export function clearGeminiResultCache() {
  resultCache.clear();
}
