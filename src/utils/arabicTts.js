/**
 * Arabic TTS quality utilities.
 *
 * Device Arabic voices vary a lot. This module picks the best available
 * voice, tunes rate/pitch for natural Arabic delivery, and splits text
 * into breath-sized chunks so long responses don't sound robotic.
 */

/* ------------------------------------------------------------------ */
/* Voice scoring                                                       */
/* ------------------------------------------------------------------ */

/**
 * Arabic voices we know are clear, in preference order.
 * Covers Microsoft (Windows/Edge), Google (Android/Chrome), Apple (iOS/macOS),
 * Samsung and generic Android system voices.
 */
const PREFERRED_AR = [
  // Microsoft neural — best quality
  "microsoft hamed",
  "microsoft zariyah",
  "microsoft salma",
  "microsoft shakir",
  // Google Arabic (Android) — various naming conventions
  "google العربية",
  "google arabic",
  "google ar",
  "ar-001",          // Android Google TTS internal id
  "ar-xa",           // Google Wavenet Arabic
  // Apple voices
  "maged",
  "majed",
  "laila",
  "tarik",
  "hoda",
  "zeina",
  // Samsung / generic Android
  "samsung arabic",
  "arabic (saudi arabia)",
  "arabic (egypt)",
  "arabic",
  "عربي",
  "ar-sa",
  "ar-eg",
];

const PREFERRED_EN = [
  "google us english",
  "microsoft aria",
  "microsoft jenny",
  "microsoft guy",
  "samantha",
  "alex",
  "daniel",
  "karen",
];

function scoreVoice(voice, preferred) {
  const name = (voice.name || "").toLowerCase();
  const idx = preferred.findIndex((p) => name.includes(p));
  const base = idx >= 0 ? (preferred.length - idx) * 10 : 0;

  // Prefer local (on-device) voices — less latency, works offline
  const localBonus = voice.localService ? 2 : 0;

  // Slight bonus for Saudi Arabic dialect (standard, best for TTS)
  const dialectBonus =
    (voice.lang || "").toLowerCase() === "ar-sa" ? 3 : 0;

  return base + localBonus + dialectBonus;
}

export function pickBestVoice(language) {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;

  const all = window.speechSynthesis.getVoices();
  if (!all.length) return null;

  const target = language === "ar" ? "ar" : "en";
  const preferred = language === "ar" ? PREFERRED_AR : PREFERRED_EN;

  const candidates = all.filter((v) =>
    (v.lang || "").toLowerCase().startsWith(target)
  );

  // No matching language voice — return null so the browser uses its default
  // (better than silence; Android system TTS will still attempt to speak)
  if (!candidates.length) return null;

  return candidates
    .map((v) => ({ voice: v, score: scoreVoice(v, preferred) }))
    .sort((a, b) => b.score - a.score)[0].voice;
}

/* ------------------------------------------------------------------ */
/* Text normalisation                                                  */
/* ------------------------------------------------------------------ */

const AR_ORDINALS = {
  0: "صفر", 1: "واحد", 2: "اثنان", 3: "ثلاثة", 4: "أربعة",
  5: "خمسة", 6: "ستة", 7: "سبعة", 8: "ثمانية", 9: "تسعة",
  10: "عشرة", 11: "أحد عشر", 12: "اثنا عشر", 13: "ثلاثة عشر",
  14: "أربعة عشر", 15: "خمسة عشر", 16: "ستة عشر", 17: "سبعة عشر",
  18: "ثمانية عشر", 19: "تسعة عشر", 20: "عشرون", 30: "ثلاثون",
  40: "أربعون", 50: "خمسون", 60: "ستون", 70: "سبعون",
  80: "ثمانون", 90: "تسعون", 100: "مئة",
};

function numberToArabicWords(n) {
  if (n < 0) return "سالب " + numberToArabicWords(-n);
  if (n === 0) return "صفر";
  if (n <= 20) return AR_ORDINALS[n] || String(n);

  if (n < 100) {
    const tens = Math.floor(n / 10) * 10;
    const ones = n % 10;
    if (ones === 0) return AR_ORDINALS[tens];
    return AR_ORDINALS[ones] + " و" + AR_ORDINALS[tens];
  }

  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    const h = hundreds === 1 ? "مئة" : AR_ORDINALS[hundreds] + " مئة";
    return rest === 0 ? h : h + " و" + numberToArabicWords(rest);
  }

  return String(n).split("").map((d) => AR_ORDINALS[+d]).join(" ");
}

function normaliseNumbers(text, language) {
  if (language !== "ar") return text;
  return text.replace(/\b(\d+)\b/g, (_, d) => {
    const n = parseInt(d, 10);
    if (isNaN(n) || n > 9999) return d;
    return numberToArabicWords(n);
  });
}

function cleanText(text) {
  return String(text)
    .replace(/[*_`~#>|]/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/\.{3,}/g, "، ")
    .replace(/—|–/g, "، ")
    .replace(/[!]/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sentence-only split — matches the known-good standalone code that works on
 * Huawei EMUI. Combining sentences into breath-sized chunks (chunkForSpeech)
 * causes the audio session to be reused too quickly on Huawei, producing
 * "screaming" distortion. One utterance per sentence, no combining.
 */
export function chunkBySentence(text, language = "ar") {
  const clean = cleanText(normaliseNumbers(text, language));
  if (!clean) return [];
  return clean
    .split(/(?<=[.!?؟\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Split into breath-sized chunks.
 * Arabic: 110 chars max — shorter chunks = better natural pausing + stays under Android 13s cap.
 * English: 130 chars max — 160 was too close to the 13s Android TTS budget limit.
 */
export function chunkForSpeech(text, language = "ar", maxLen) {
  const limit = maxLen ?? (language === "ar" ? 110 : 130);
  const clean = cleanText(normaliseNumbers(text, language));
  if (!clean) return [];

  const sentences = clean
    .split(/(?<=[.!?؟\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = [];
  let buffer = "";

  for (const sentence of sentences) {
    if (!buffer) {
      buffer = sentence;
    } else if ((buffer + " " + sentence).length <= limit) {
      buffer += " " + sentence;
    } else {
      chunks.push(buffer);
      buffer = sentence;
    }

    while (buffer.length > limit) {
      const cut = buffer.lastIndexOf("،", limit);
      if (cut < 30) break;
      chunks.push(buffer.slice(0, cut + 1).trim());
      buffer = buffer.slice(cut + 1).trim();
    }
  }

  if (buffer) chunks.push(buffer);
  return chunks;
}

/* ------------------------------------------------------------------ */
/* Speaking parameters                                                 */
/* ------------------------------------------------------------------ */

export function getSpeakParams(language, voice) {
  const name = (voice?.name || "").toLowerCase();

  if (language === "ar") {
    let rate = 0.92;
    let pitch = 0.95;

    if (name.includes("google") || name.includes("ar-001") || name.includes("ar-xa")) {
      rate = 0.90;
      pitch = 1.0;
    }

    if (name.includes("microsoft")) {
      rate = 0.95;
      pitch = 1.0;
    }

    if (name.includes("maged") || name.includes("majed") || name.includes("laila")) {
      rate = 0.92;
      pitch = 1.0;
    }

    return { rate, pitch, volume: 1 };
  }

  // English
  let rate = 0.95;
  if (name.includes("google")) rate = 0.93;
  if (name.includes("microsoft")) rate = 1.0;

  return { rate, pitch: 1, volume: 1 };
}
