import { useEffect, useState } from "react";

import Bilingual from "./Bilingual";
import {
  canInstall,
  onInstallAvailabilityChange,
  promptInstall,
} from "../utils/installPrompt";
import { useHaptics } from "../hooks/useHaptics";

export default function InstallPrompt({ t }) {
  const [available, setAvailable] = useState(canInstall());
  const [dismissed, setDismissed] = useState(false);
  const haptics = useHaptics();

  useEffect(() => onInstallAvailabilityChange(setAvailable), []);

  if (!available || dismissed) return null;

  const handleInstall = async () => {
    haptics.tap();
    const ok = await promptInstall();
    if (ok) haptics.success();
  };

  return (
    <div className="install-prompt" role="region">
      <Bilingual
        tag="p"
        value={t.installHint}
        primary="ar"
        className="install-prompt-text"
        altClassName="bilingual-alt"
      />

      <div className="install-prompt-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleInstall}
        >
          <Bilingual
            value={t.installNow}
            primary="ar"
            altClassName="btn-alt"
          />
        </button>

        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            haptics.tap();
            setDismissed(true);
          }}
        >
          <Bilingual
            value={t.installLater}
            primary="ar"
            altClassName="btn-alt"
          />
        </button>
      </div>
    </div>
  );
}
