// Painel do Dono: um login separado do login da loja, que fica só na memória (nunca é salvo no
// aparelho). Fechou a tela, saiu ou trocou de aba: o acesso acaba e pede o login de novo.
import { initializeApp, getApps } from "firebase/app";
import { GoogleAuthProvider, browserPopupRedirectResolver, connectAuthEmulator, inMemoryPersistence, initializeAuth, signInWithCredential, signInWithPopup, signOut } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { configIftech } from "./firebase";

const NOME = "painel-do-dono";
const app = getApps().find((a) => a.name === NOME) || initializeApp(configIftech, NOME);
export const authDono = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
export const dbDono = getFirestore(app);

if (process.env.REACT_APP_EMULATOR === "1") {
  connectFirestoreEmulator(dbDono, "127.0.0.1", 8181);
  connectAuthEmulator(authDono, "http://127.0.0.1:9199", { disableWarnings: true });
  window.__entrarDonoTeste = (email) => signInWithCredential(authDono, GoogleAuthProvider.credential(JSON.stringify({ sub: "dono-" + email, email, email_verified: true })));
}

export function entrarDono() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(authDono, provider);
}

export function sairDono() {
  return signOut(authDono).catch(() => {});
}
