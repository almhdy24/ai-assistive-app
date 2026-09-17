import { Link } from "react-router-dom";

import Bilingual from "./Bilingual";
import { useHaptics } from "../hooks/useHaptics";
import { pick } from "../i18n/translations";

export default function FeatureCard({ to, icon, title, description }) {
  const haptics = useHaptics();

  const arTitle = pick(title, "ar");
  const enTitle = pick(title, "en");
  const arDesc = pick(description, "ar");
  const enDesc = pick(description, "en");

  const label = `${arTitle} — ${enTitle}. ${arDesc} ${enDesc}`;

  return (
    <Link
      to={to}
      className="feature-card"
      aria-label={label}
      onClick={() => haptics.tap()}
    >
      <span className="feature-card-icon" aria-hidden="true">
        {icon}
      </span>

      <span className="feature-card-body">
        <strong className="feature-card-title">{arTitle}</strong>
        {enTitle && (
          <span className="feature-card-title-en">{enTitle}</span>
        )}
      </span>
    </Link>
  );
}
