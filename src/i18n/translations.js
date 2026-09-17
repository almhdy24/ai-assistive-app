/* ==========================================================================
   translations.js — bilingual strings for the whole app.
   ========================================================================== */

export const translations = {
  appName: { ar: "المساعد البصري الذكي", en: "AI Assistive App" },

  skipToContent: {
    ar: "تخطَّ إلى المحتوى الرئيسي",
    en: "Skip to main content",
  },

  home: { ar: "الرئيسية", en: "Home" },

  homeWelcome: {
    ar: "الصفحة الرئيسية. اختر خدمة أو انطق اسمها.",
    en: "Home. Choose a feature or say its name.",
  },

  chooseFeatureHint: {
    ar: "اضغط على خدمة أو انطق اسمها.",
    en: "Tap a feature or say its name.",
  },

  tellMeWhatYouNeed: {
    ar: "حدثني عما تحتاج",
    en: "Tell me what you need.",
  },

  objectDetection: { ar: "ما أمامي", en: "See Around Me" },
  readText: { ar: "قراءة النص", en: "Read Text" },
  sceneDescription: { ar: "وصف المكان", en: "Describe Scene" },
  navigation: { ar: "المساعدة في التنقل", en: "Navigation" },

  objectDetectionDescription: {
    ar: "فهم ما يوجد أمامك وحولك.",
    en: "Understand what is in front of and around you.",
  },
  readTextDescription: {
    ar: "قراءة النصوص الظاهرة على اللافتات والمستندات والأشياء.",
    en: "Read visible text from signs, documents and objects.",
  },
  sceneDescriptionDescription: {
    ar: "وصف المكان والأشخاص والتفاصيل المهمة من حولك.",
    en: "Describe the place, people and important details around you.",
  },
  navigationDescription: {
    ar: "تقديم إرشادات بصرية عن المخاطر والمسارات المحتملة.",
    en: "Get visual guidance about hazards and possible paths.",
  },

  voiceCommand: {
    ar: "تحدث بالعربية أو الإنجليزية",
    en: "Speak in Arabic or English",
  },
  listening: { ar: "جاري الاستماع…", en: "Listening…" },
  processing: { ar: "جاري المعالجة…", en: "Processing…" },
  speaking: { ar: "جاري التحدث…", en: "Speaking…" },

  camera: { ar: "الكاميرا", en: "Camera" },
  cameraActive: {
    ar: "الكاميرا تعمل. تحدث الآن.",
    en: "Camera active. Speak now.",
  },
  cameraStarting: {
    ar: "جارٍ تشغيل الكاميرا…",
    en: "Starting camera…",
  },
  startCamera: { ar: "تشغيل الكاميرا", en: "Start Camera" },
  stopCamera: { ar: "إيقاف الكاميرا", en: "Stop Camera" },
  capture: { ar: "التقاط", en: "Capture" },
  analyze: { ar: "تحليل", en: "Analyze" },
  analyzeAgain: { ar: "تحليل مرة أخرى", en: "Analyze Again" },
  retake: { ar: "إعادة الالتقاط", en: "Retake" },
  imageCaptured: { ar: "تم التقاط الصورة", en: "Image captured" },
  result: { ar: "النتيجة", en: "Result" },
  scanning: {
    ar: "جارٍ تحليل ما أمامك.",
    en: "Analyzing what is in front of you.",
  },

  cameraPermission: {
    ar: "يجب السماح باستخدام الكاميرا. من فضلك اسمح ثم حاول مرة أخرى.",
    en: "Camera permission is required. Please allow it and try again.",
  },
  cameraNotFound: {
    ar: "لا توجد كاميرا على هذا الجهاز.",
    en: "No camera was found on this device.",
  },
  cameraInUse: {
    ar: "الكاميرا مستخدمة من تطبيق آخر. أغلق التطبيق الآخر وحاول مرة أخرى.",
    en: "The camera is being used by another app. Close it and try again.",
  },
  cameraConstraints: {
    ar: "الكاميرا لا تدعم الإعدادات المطلوبة. جارٍ إعادة المحاولة.",
    en: "The camera does not support the requested settings. Trying again.",
  },
  cameraUnsupported: {
    ar: "هذا المتصفح لا يدعم الوصول إلى الكاميرا.",
    en: "This browser does not support camera access.",
  },
  cameraUnknown: {
    ar: "تعذّر تشغيل الكاميرا. حاول مرة أخرى.",
    en: "The camera could not be started. Please try again.",
  },

  microphonePermission: {
    ar: "يجب السماح باستخدام الميكروفون للأوامر الصوتية.",
    en: "Microphone permission is required for voice commands.",
  },
  microphonePermissionAction: {
    ar: "افتح إعدادات المتصفح واسمح باستخدام الميكروفون لهذا الموقع، ثم اضغط الزر لإعادة المحاولة.",
    en: "Open the browser site settings, allow the microphone for this site, then press the button to retry.",
  },
  microphoneRetry: {
    ar: "طلب إذن الميكروفون",
    en: "Request microphone permission",
  },
  speechUnavailable: {
    ar: "التعرف الصوتي غير مدعوم في هذا المتصفح.",
    en: "Voice recognition is not supported by this browser.",
  },
  synthesisUnavailable: {
    ar: "قراءة النص الصوتية غير مدعومة في هذا المتصفح.",
    en: "Text-to-speech is not supported by this browser.",
  },

  networkRequired: {
    ar: "يحتاج تحليل الصور إلى اتصال بالإنترنت.",
    en: "An internet connection is required for AI visual analysis.",
  },
  analysisFailed: {
    ar: "تعذر إكمال تحليل الصورة.",
    en: "The visual analysis could not be completed.",
  },
  rateLimited: {
    ar: "تجاوزت حد الطلبات. انتظر لحظة ثم حاول مرة أخرى.",
    en: "Too many requests. Wait a moment and try again.",
  },
  quotaExceeded: {
    ar: "انتهى حصة الاستخدام المجاني لليوم. حاول غداً أو راجع مفتاح API.",
    en: "Daily free quota exceeded. Try again tomorrow or check your API key.",
  },
  invalidKey: {
    ar: "مفتاح Gemini غير صحيح. تحقق من ملف .env.local.",
    en: "Invalid Gemini API key. Check your .env.local file.",
  },
  tryAgain: { ar: "حاول مرة أخرى", en: "Try Again" },

  notUnderstoodHome: {
    ar: "لم أفهم. قل مثلاً: ماذا أمامي، اقرأ النص، صف المكان، أو ساعدني في التنقل.",
    en: "I didn't understand. Try saying: what is in front of me, read text, describe scene, or navigate.",
  },
  notUnderstoodPage: {
    ar: "لم أفهم. قل: كرر، أو الرئيسية، أو اسم خدمة أخرى.",
    en: "I didn't understand. Say: repeat, home, or name a feature.",
  },
  offlineWarning: {
    ar: "لا يوجد اتصال بالإنترنت. تحليل الصور يحتاج إنترنت.",
    en: "No internet connection. Image analysis requires internet.",
  },
  onlineRestored: {
    ar: "عاد الاتصال بالإنترنت.",
    en: "Internet connection restored.",
  },

  back: { ar: "رجوع", en: "Back" },
  repeat: { ar: "إعادة", en: "Repeat" },
  stop: { ar: "إيقاف", en: "Stop" },

  visualQuestion: { ar: "اسأل عما تراه.", en: "Ask what you see." },

  navigationWarning: {
    ar: "الإرشادات البصرية معلومات مساعدة وليست نظاماً مضموناً للسلامة.",
    en: "Visual guidance is informational. Do not rely on it as a guaranteed safety system.",
  },

  installTitle: { ar: "تثبيت التطبيق", en: "Install app" },
  installHint: {
    ar: "ثبّت التطبيق للوصول الأسرع والعمل بدون إنترنت.",
    en: "Install the app for faster access and offline use.",
  },
  installNow: { ar: "تثبيت", en: "Install" },
  installLater: { ar: "لاحقاً", en: "Later" },
};

/* -------------------------------------------------------------------------- */

export const voiceGuides = {
  modePrompts: {
    general: {
      ar: "قل: ماذا أمامي.",
      en: "Say: what is in front of me.",
    },
    text: { ar: "قل: اقرأ النص.", en: "Say: read text." },
    scene: { ar: "قل: صف المكان.", en: "Say: describe the scene." },
    navigation: {
      ar: "قل: ساعدني في التنقل.",
      en: "Say: help me navigate.",
    },
    right: {
      ar: "قل: ماذا على يميني.",
      en: "Say: what is on my right.",
    },
    left: {
      ar: "قل: ماذا على يساري.",
      en: "Say: what is on my left.",
    },
  },
  cameraReady: { ar: "الكاميرا جاهزة.", en: "Camera ready." },
  afterResult: {
    ar: "قل: كرر، أو: تحليل مرة أخرى، أو: الرئيسية.",
    en: "Say: repeat, analyze again, or: home.",
  },
  listeningPrompt: { ar: "جاري الاستماع…", en: "Listening…" },
  tapToAnalyze: {
    ar: "اضغط الزر للتحليل، أو انطق الأمر.",
    en: "Tap the button to analyze, or speak the command.",
  },
};

/* -------------------------------------------------------------------------- */

/**
 * Safe accessor for bilingual values.
 * Accepts strings, { ar, en } objects, or nullish values.
 */
export function pick(value, language = "ar") {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    return value[language] ?? value.ar ?? value.en ?? "";
  }
  return "";
}

export function getLanguageDirection(language) {
  return language === "ar" ? "rtl" : "ltr";
}
