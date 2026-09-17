/* Arabic command matching with word-level + phrase-level fallback. */

const DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g;

export function normalizeArabic(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(/[إأآٱا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\u0600-\u06FF\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const m = Array.from({ length: a.length + 1 }, (_, i) =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) m[i][0] = i;
  for (let j = 0; j <= b.length; j++) m[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(
        m[i - 1][j] + 1,
        m[i][j - 1] + 1,
        m[i - 1][j - 1] + cost
      );
    }
  }
  return m[a.length][b.length];
}

function similarity(a, b) {
  const max = Math.max(a.length, b.length);
  if (!max) return 0;
  return 1 - levenshtein(a, b) / max;
}

/* ------------------------------------------------------------------ */
/* Command dictionary                                                  */
/* ------------------------------------------------------------------ */

const RAW = {
  "visual-question": [
    "ماذا امامي", "ماذا يوجد امامي", "ما امامي", "شو امامي",
    "شو قدامي", "ايه قدامي", "ايه امامي", "ماذا ترى", "شو شايف",
    "ايه اللي قدامي", "ماذا تري", "وضح ما امامي", "صف ما امامي",
    "ماذا قدامي", "شو في قدامي", "شو في امامي", "ايه اللي امامي",
    "عايز اعرف ايه قدامي", "قولي ايه قدامي",
  ],
  right: [
    "يمين", "على اليمين", "في اليمين", "ماذا على يميني",
    "شو على يميني", "ايه على يميني", "يميني", "اليمين",
  ],
  left: [
    "يسار", "على اليسار", "في اليسار", "ماذا على يساري",
    "شو على يساري", "ايه على يساري", "يساري", "اليسار",
    "شمال", "الشمال", "على الشمال", "في الشمال",
  ],
  "read-text": [
    "اقرا النص", "اقرا نص", "اقرا لي النص", "قراءه النص",
    "قراءة النص", "اقرا", "اقرالي", "ماذا مكتوب",
    "ما المكتوب", "شو مكتوب", "ايه مكتوب", "اقرا الكلام",
    "قراءة الكلام", "اقرا اللافته", "اقرا اللوحة",
    "اللي مكتوب", "قولي المكتوب", "قولي اللي مكتوب",
  ],
  "scene-description": [
    "صف المكان", "صف لي المكان", "اوصف المكان", "اوصف لي المكان",
    "وصف المكان", "صف المشهد", "وصف المشهد", "صف لي ما ترى",
    "اوصف ما امامي", "صف اللي حولي", "اوصف اللي حولي",
    "ما شكل المكان", "وصف لي", "اوصف لي",
    "وين انا", "فين انا", "ايه المكان ده",
    "صف البيئة", "صف المنطقة", "احكيلي عن المكان",
    "ما هذا المكان", "ايه هو المكان", "ما المكان",
    "وصف حولي", "ايه اللي حولي", "شو اللي حولي",
  ],
  navigation: [
    "ساعدني في التنقل", "المساعده في التنقل", "التنقل", "تنقل",
    "ملاحه", "الملاحه", "ساعدني على التنقل", "امشي",
    "ساعدني امشي", "ارشدني", "ساعدني في المشي",
    "كيف امشي", "ممكن امشي", "في عوائق",
    "وجهني", "دلني", "ساعدني اتحرك",
  ],
  "object-detection": [
    "اكتشاف الاشياء", "اكتشف الاشياء", "التعرف على الاشياء",
    "تعرف على الاشياء", "اكتشاف", "كشف", "شوف الاشياء",
    "ايه الاشياء", "الاشياء",
  ],
  analyze: [
    "تحليل مره اخرى", "تحليل مجدد", "تحليل جديد",
    "حلل مجددا", "حلل", "التقاط جديد", "صوره جديده",
    "التقط صوره", "حلل لي", "حلل من جديد",
    "اعد التحليل", "تحليل",
  ],
  repeat: [
    "كرر", "اعد", "اعيد", "اعد لي", "كرر لي", "مره اخرى",
    "مره تانيه", "قول تاني", "كرر النتيجه", "عيد", "تاني",
  ],
  stop: [
    "اسكت", "توقف", "قف", "وقف", "بس", "خلاص", "كفايه",
    "هدوء", "سكوت", "اسكتي", "بلاش كلام",
  ],
  home: [
    "الرئيسيه", "الصفحه الرئيسيه", "ارجع للرئيسيه",
    "روح للرئيسيه", "هوم", "الصفحه الرئيسيه",
  ],
  back: ["رجوع", "ارجع", "ارجع لورا", "الخلف", "لورا", "رجع"],
  "lang-en": [
    "انجليزي", "انجليزيه", "بالانجليزي", "بالانجليزيه",
    "تبديل للانجليزي", "غير للانجليزيه", "تغيير اللغه الانجليزيه",
    "تحدث انجليزي", "اتكلم انجليزي",
  ],
  "lang-ar": [
    "عربي", "عربيه", "بالعربي", "بالعربيه",
    "تبديل للعربي", "غير للعربيه", "تغيير اللغه العربيه",
    "تحدث عربي", "اتكلم عربي", "اللغه العربيه",
  ],
};

/* Pre-normalise dictionary once */
const COMMANDS = Object.fromEntries(
  Object.entries(RAW).map(([k, list]) => [k, list.map(normalizeArabic)])
);

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

const PHRASE_MIN = 0.62;
const WORD_MIN = 0.78;

/**
 * Split into words, drop single-letter noise.
 */
function words(text) {
  return normalizeArabic(text)
    .split(" ")
    .filter((w) => w.length > 1);
}

/**
 * Two-tier matcher:
 *   1. Whole-phrase similarity
 *   2. Bag-of-words: how many words match a phrase's words
 */
export function matchArabicCommand(transcript) {
  if (!transcript) return null;

  const norm = normalizeArabic(transcript);
  if (!norm) return null;

  let best = null;
  const inputWords = words(transcript);

  for (const [type, phrases] of Object.entries(COMMANDS)) {
    for (const phrase of phrases) {
      /* 1. Whole phrase */
      if (norm.includes(phrase)) {
        return { type, raw: transcript, score: 1, matched: phrase };
      }

      const phraseSim = similarity(norm, phrase);
      const phraseDist = levenshtein(norm, phrase);

      if (phraseSim >= PHRASE_MIN && phraseDist <= 5) {
        if (!best || phraseSim > best.score) {
          best = { type, raw: transcript, score: phraseSim, matched: phrase };
        }
        continue;
      }

      /* 2. Word-level: every word in the phrase appears (fuzzy) */
      const phraseWords = phrase.split(" ");

      if (phraseWords.length >= 2 && inputWords.length >= 2) {
        let matched = 0;
        for (const pw of phraseWords) {
          const hit = inputWords.some(
            (iw) => iw === pw || similarity(iw, pw) >= WORD_MIN
          );
          if (hit) matched++;
        }

        const wordScore = matched / phraseWords.length;

        if (wordScore >= 0.75) {
          if (!best || wordScore > best.score) {
            best = {
              type,
              raw: transcript,
              score: wordScore,
              matched: phrase,
            };
          }
        }
      }
    }
  }

  return best;
}
