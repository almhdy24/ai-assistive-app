import { matchArabicCommand } from "./arabicCommands";

/* ------------------------------------------------------------------ */
/* English dictionary                                                  */
/* ------------------------------------------------------------------ */

const EN_COMMANDS = {
  "visual-question": [
    "what is in front of me",
    "what's in front of me",
    "what is ahead",
    "what do you see",
    "what can you see",
    "describe what you see",
    "what is around me",
  ],
  right: ["right", "on the right", "to the right"],
  left: ["left", "on the left", "to the left"],
  "read-text": [
    "read text",
    "read the text",
    "read this",
    "read it",
    "what does it say",
    "read the writing",
  ],
  "scene-description": [
    "describe the scene",
    "describe the place",
    "describe this place",
    "scene description",
  ],
  navigation: [
    "navigation",
    "help me navigate",
    "guide me",
    "navigation assist",
  ],
  "object-detection": [
    "object detection",
    "detect objects",
    "detect",
  ],
  repeat: ["repeat", "say that again", "say it again"],
  stop: ["stop", "be quiet", "quiet", "stop listening"],
  home: ["home", "go home", "main page"],
  back: ["back", "go back"],
};

const ARABIC_RE = /[\u0600-\u06FF]/;

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Parse a voice transcript.
 *
 * Routes to the Arabic fuzzy matcher when the transcript contains
 * Arabic script; otherwise uses simple English substring matching.
 */
export function parseVoiceCommand(input) {
  const raw = (input || "").trim();
  if (!raw) return { type: "unknown", raw, language: "ar" };

  /* Arabic */
  if (ARABIC_RE.test(raw)) {
    const match = matchArabicCommand(raw);
    if (match) {
      return {
        type: match.type,
        raw,
        language: "ar",
        score: match.score,
        matched: match.matched,
      };
    }
    return { type: "unknown", raw, language: "ar" };
  }

  /* English */
  const lower = raw.toLowerCase();
  for (const [type, phrases] of Object.entries(EN_COMMANDS)) {
    if (phrases.some((p) => lower.includes(p))) {
      return { type, raw, language: "en" };
    }
  }

  return { type: "unknown", raw, language: "en" };
}

/* Re-exported for the language selector */
export { normalizeArabic } from "./arabicCommands";
