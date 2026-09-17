import { useHaptics } from "../hooks/useHaptics";
import { pick } from "../i18n/translations";

export default function VoiceBar({
  t,
  listening,
  speaking,
  supported,
  onClick,
}) {
  const haptics = useHaptics();

  let key = "voiceCommand";
  let cls = "voice-bar";

  if (!supported) {
    key = "speechUnavailable";
    cls += " voice-bar--unsupported";
  } else if (speaking) {
    key = "speaking";
    cls += " voice-bar--speaking";
  } else if (listening) {
    key = "listening";
    cls += " voice-bar--listening";
  }

  const value = t ? t[key] : null;
  const arLabel = pick(value, "ar");
  const enLabel = pick(value, "en");

  const handleClick = () => {
    haptics.tap();
    if (typeof onClick === "function") onClick();
  };

  return (
    <button
      type="button"
      className={cls}
      onClick={handleClick}
      disabled={!supported || speaking}
      aria-label={arLabel + " / " + enLabel}
    >
      <span className="voice-bar-icon" aria-hidden="true">
        {listening ? "●" : "◉"}
      </span>
      <span className="voice-bar-text">{arLabel}</span>
      {enLabel && <span className="voice-bar-sub">{enLabel}</span>}
    </button>
  );
}
