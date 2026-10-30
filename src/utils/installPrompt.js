// "Instalar o app" (colocar o sistema na tela de início). O Chrome/Edge no Android e no
// computador avisam que dá pra instalar com o evento beforeinstallprompt — guardado aqui assim
// que a página abre, porque ele só dispara uma vez. No iPhone não existe esse evento: lá é pelo
// botão Compartilhar do Safari, então a tela mostra o passo a passo.

let deferred = null;
const listeners = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e;
    listeners.forEach(l => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach(l => l());
  });
}

export function canPromptInstall() {
  return deferred !== null;
}

export function onInstallAvailabilityChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Abre o aviso de instalação do próprio navegador. true = instalou. */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" }));
  listeners.forEach(l => l());
  return choice.outcome === "accepted";
}

/** Já está aberto pelo ícone da tela de início (como app)? */
export function isInstalled() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
}

export function detectDevice() {
  const ua = navigator.userAgent;
  // iPadOS se apresenta como Mac — o toque denuncia que é iPad.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Android/.test(ua)) return "android";
  return "computador";
}

/** Navegador de dentro de outro app (Instagram, Facebook, WhatsApp...): não instala por ali. */
export function isInAppBrowser() {
  return /Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\//i.test(navigator.userAgent);
}
