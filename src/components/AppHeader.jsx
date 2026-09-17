import { useNavigate } from "react-router-dom";

import Bilingual from "./Bilingual";
import { useHaptics } from "../hooks/useHaptics";

export default function AppHeader({
  title,
  showBack = false,
  isHome = false,
  transparent = false,
}) {
  const navigate = useNavigate();
  const haptics = useHaptics();

  const className = `app-header${
    transparent ? " app-header--transparent" : ""
  }`;

  return (
    <header className={className} role="banner">
      {showBack ? (
        <button
          type="button"
          className="header-button"
          onClick={() => {
            haptics.tap();
            navigate(-1);
          }}
          aria-label="رجوع / Back"
        >
          <span aria-hidden="true">←</span>
        </button>
      ) : (
        <span className="header-spacer" aria-hidden="true" />
      )}

      <div className="header-title">
        <Bilingual
          value={title}
          primary="ar"
          altClassName="header-alt"
        />
      </div>

      {!isHome ? (
        <button
          type="button"
          className="header-button"
          onClick={() => {
            haptics.tap();
            navigate("/");
          }}
          aria-label="الرئيسية / Home"
        >
          <span aria-hidden="true">⌂</span>
        </button>
      ) : (
        <span className="header-spacer" aria-hidden="true" />
      )}
    </header>
  );
}
