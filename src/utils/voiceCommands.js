import { matchArabicCommand } from "./arabicCommands";

/* ------------------------------------------------------------------ */
/* English dictionary                                                  */
/* ------------------------------------------------------------------ */

const EN_COMMANDS = {
  "visual-question": [
    "what is in front of me",
    "what's in front of me",
    "what is ahead",
    "what's ahead",
    "what do you see",
    "what can you see",
    "describe what you see",
    "what is around me",
    "what's around me",
    "what is this",
    "what's this",
    "look around",
    "what is here",
    "see around",
  ],
  right: [
    "right", "on the right", "to the right",
    "what is on my right", "what's on my right",
    "look right", "check right",
  ],
  left: [
    "left", "on the left", "to the left",
    "what is on my left", "what's on my left",
    "look left", "check left",
  ],
  "read-text": [
    "read text",
    "read the text",
    "read this",
    "read it",
    "what does it say",
    "read the writing",
    "read the sign",
    "read the label",
    "what is written",
    "what's written",
    "scan text",
  ],
  "scene-description": [
    "describe the scene",
    "describe scene",
    "describe the place",
    "describe this place",
    "describe where i am",
    "describe my surroundings",
    "scene description",
    "where am i",
    "what is this place",
    "what's this place",
    "describe the room",
    "describe the area",
    "look around me",
    "scene",
  ],
  navigation: [
    "navigation",
    "navigate",
    "help me navigate",
    "guide me",
    "navigation assist",
    "help me walk",
    "how do i get through",
    "can i walk",
    "path ahead",
    "is it safe",
    "hazards",
    "what is blocking",
  ],
  "object-detection": [
    "object detection",
    "detect objects",
    "detect",
    "identify objects",
    "what objects",
  ],
  analyze: [
    "analyze again", "analyse again", "new analysis",
    "scan again", "retake", "take another", "new photo",
    "take a new photo", "analyze", "analyse",
  ],
  repeat: [
    "repeat", "say that again", "say it again",
    "again", "one more time", "replay",
  ],
  stop: [
    "stop", "be quiet", "quiet", "stop listening",
    "silence", "cancel", "enough",
  ],
  home: ["home", "go home", "main page", "main menu", "start"],
  back: ["back", "go back", "return"],
  "lang-en": [
    "english", "switch to english", "change to english",
    "use english", "speak english", "in english",
  ],
  "lang-ar": [
    "arabic", "switch to arabic", "change to arabic",
    "use arabic", "speak arabic", "in arabic",
  ],
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
