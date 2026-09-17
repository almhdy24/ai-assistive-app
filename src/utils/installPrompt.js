let deferredPrompt = null;
const listeners = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn(true));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn(false));
  });
}

export function canInstall() {
  return Boolean(deferredPrompt);
}

export function onInstallAvailabilityChange(fn) {
  listeners.add(fn);
  fn(canInstall());
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  deferredPrompt = null;
  listeners.forEach((fn) => fn(false));

  return outcome === "accepted";
}
