import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";

import Home from "./pages/Home";
import ObjectDetection from "./pages/ObjectDetection";
import ReadText from "./pages/ReadText";
import SceneDescription from "./pages/SceneDescription";
import Navigation from "./pages/Navigation";
import VoiceLanguageSelector from "./pages/VoiceLanguageSelector";

import { translations, pick } from "./i18n/translations";
import { parseVoiceCommand } from "./utils/voiceCommands";
import { matchLanguageIntent } from "./utils/languageDetect";
import { useDualSpeech, speechSupported } from "./hooks/useDualSpeech";
import { useWakeLock } from "./hooks/useWakeLock";
import { focusElement, announceStatus, SPEAK_PRIORITY } from "./utils/a11y";

function readSavedLanguage() {
  try {
    const v = localStorage.getItem("language");
    return v === "ar" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

export default function App() {
  const t = translations;

  // Initialise from localStorage so returning users skip the selector
  const [primaryLanguage, setPrimaryLanguage] = useState(readSavedLanguage);
  const [voiceCommand, setVoiceCommand] = useState(null);
  const [languageIntent, setLanguageIntent] = useState(null);

  const handleSelectLanguage = useCallback((lang) => {
    // Stop any in-flight TTS and recognition before rebuilding for the new language
    window.dispatchEvent(new CustomEvent("ai-assistive:stop-speak"));
    try {
      localStorage.setItem("language", lang);
    } catch {
      /* quota / private mode */
    }
    setPrimaryLanguage(lang);
    setLanguageIntent(null);
    setVoiceCommand(null);
  }, []);

  const handleCommand = useCallback(
    (transcript, detectedLanguage) => {
      if (!primaryLanguage) {
        const intent = matchLanguageIntent(transcript);
        setLanguageIntent({ intent, transcript, id: Date.now() });
        return;
      }
      const cmd = parseVoiceCommand(transcript);
      setVoiceCommand({
        ...cmd,
        id: Date.now(),
        transcript,
        language: detectedLanguage,
      });
    },
    [primaryLanguage]
  );

  const {
    listening,
    speaking,
    speak,
    stopSpeaking,
    stopAll,
    toggleListening,
    lastCommandLanguage,
    startRecognition,
  } = useDualSpeech({
    enabled: true,
    onCommand: handleCommand,
    // null during language-selection so both recognizers run for detection
    language: primaryLanguage,
  });

  useWakeLock(true);

  /* Bridge window events → speech engine */
  const speakRef = useRef(speak);
  speakRef.current = speak;

  const stopSpeakingRef = useRef(stopSpeaking);
  stopSpeakingRef.current = stopSpeaking;

  const startRecognitionRef = useRef(startRecognition);
  startRecognitionRef.current = startRecognition;

  /* Network status — announce offline/online changes */
  useEffect(() => {
    if (!primaryLanguage) return;
    const lang = primaryLanguage;
    const onOffline = () =>
      speakRef.current(pick(t.offlineWarning, lang), {
        priority: SPEAK_PRIORITY.NORMAL,
        language: lang,
      });
    const onOnline = () =>
      speakRef.current(pick(t.onlineRestored, lang), {
        priority: SPEAK_PRIORITY.NORMAL,
        language: lang,
      });
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [primaryLanguage, t]);

  /* Visibility — restart recognition when app returns to foreground */
  useEffect(() => {
    if (!primaryLanguage) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setTimeout(() => startRecognitionRef.current?.(), 300);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [primaryLanguage]);

  useEffect(() => {
    const onSpeak = (e) => {
      const { text, priority, language } = e.detail ?? {};
      if (text) speakRef.current(text, { priority, language });
    };
    const onStop = () => stopAll();
    const onCancel = () => stopSpeakingRef.current();

    const onSetLang = (e) => {
      const { language } = e.detail ?? {};
      if (language === "ar" || language === "en") handleSelectLanguage(language);
    };

    window.addEventListener("ai-assistive:speak", onSpeak);
    window.addEventListener("ai-assistive:stop-speak", onStop);
    window.addEventListener("ai-assistive:cancel-speak", onCancel);
    window.addEventListener("ai-assistive:set-language", onSetLang);
    return () => {
      window.removeEventListener("ai-assistive:speak", onSpeak);
      window.removeEventListener("ai-assistive:stop-speak", onStop);
      window.removeEventListener("ai-assistive:cancel-speak", onCancel);
      window.removeEventListener("ai-assistive:set-language", onSetLang);
    };
  }, [stopAll, handleSelectLanguage]);

  const isRtl = primaryLanguage !== "en";
  const htmlLang = primaryLanguage || "ar";

  return (
    <BrowserRouter>
      <div
        dir={isRtl ? "rtl" : "ltr"}
        lang={htmlLang}
        className="app-root"
      >
        <a href="#main-content" className="skip-link">
          {isRtl
            ? "تخطَّ إلى المحتوى الرئيسي"
            : "Skip to main content"}
        </a>

        {!primaryLanguage ? (
          <VoiceLanguageSelector
            onSelect={handleSelectLanguage}
            speak={speak}
            intent={languageIntent}
          />
        ) : (
          <>
            <RouteFocusManager />
            <Routes>
              <Route
                path="/"
                element={
                  <Home
                    t={t}
                    onVoiceCommand={toggleListening}
                    listening={listening}
                    speaking={speaking}
                    speechSupported={speechSupported}
                    voiceCommand={voiceCommand}
                    lastCommandLanguage={lastCommandLanguage}
                  />
                }
              />
              <Route
                path="/object-detection"
                element={
                  <ObjectDetection
                    t={t}
                    voiceCommand={voiceCommand}
                    lastCommandLanguage={lastCommandLanguage}
                  />
                }
              />
              <Route
                path="/read-text"
                element={
                  <ReadText
                    t={t}
                    voiceCommand={voiceCommand}
                    lastCommandLanguage={lastCommandLanguage}
                  />
                }
              />
              <Route
                path="/scene-description"
                element={
                  <SceneDescription
                    t={t}
                    voiceCommand={voiceCommand}
                    lastCommandLanguage={lastCommandLanguage}
                  />
                }
              />
              <Route
                path="/navigation"
                element={
                  <Navigation
                    t={t}
                    voiceCommand={voiceCommand}
                    lastCommandLanguage={lastCommandLanguage}
                  />
                }
              />
            </Routes>
          </>
        )}
      </div>
    </BrowserRouter>
  );
}

function RouteFocusManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => {
      const main = document.getElementById("main-content");
      if (main) {
        main.setAttribute("tabindex", "-1");
        focusElement(main);
      }
      const heading = main?.querySelector("h1, h2");
      if (heading?.textContent) {
        announceStatus(heading.textContent.trim(), "polite");
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
