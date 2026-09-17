const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const LATIN_RANGE = /[A-Za-z]/;

export function detectLanguage(text) {
  if (!text) return "ar";
  const hasAr = ARABIC_RANGE.test(text);
  const hasEn = LATIN_RANGE.test(text);
  if (hasAr && hasEn) return "mixed";
  if (hasAr) return "ar";
  if (hasEn) return "en";
  return "ar";
}

export function primaryLanguage(text, fallback = "ar") {
  const lang = detectLanguage(text);
  if (lang !== "mixed") return lang;
  const ar = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const en = (text.match(/[A-Za-z]/g) || []).length;
  return ar >= en ? "ar" : "en";
}

/* ---------------------------------------------------------------- */
/* Language-intent matcher — used by the voice language selector    */
/* ---------------------------------------------------------------- */

const AR_INTENT = /عرب|عربي|العربية|بالعربي|arabic|arabi/i;
const EN_INTENT = /english|إنجليز|انجليز|انجلش|إنجلش|englizi/i;

export function matchLanguageIntent(transcript) {
  if (!transcript) return null;
  const t = transcript.trim();

  /* English words take priority — "English" is often picked up by
     the Arabic engine as "إنجليزي" but occasionally as "English"
     too. Either way, we want to select English. */
  if (EN_INTENT.test(t)) return "en";
  if (AR_INTENT.test(t)) return "ar";
  return null;
}
