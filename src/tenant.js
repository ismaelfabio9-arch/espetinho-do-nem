// Sistema de Mesas da IFTech (REACT_APP_MULTI=1): login com a conta Google e escolha da loja.
//
// Cada loja é um documento mesasLojas/<id> (criado pelo site da IFTech na contratação) com o
// nome, a lista de e-mails da equipe e se está no ar. Só o servidor da IFTech altera esse
// documento; os dados da loja ficam em mesasLojas/<id>/<coleção>.
import { useEffect, useState } from "react";
import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithCredential, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import { MULTI, setLoja } from "./loja";

const SAVED_KEY = "mesas_loja";
let state = { status: MULTI ? "loading" : "off", user: null, lojas: [], loja: null, error: "" };
const listeners = new Set();
function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}
export const getTenant = () => state;
export function subscribeTenant(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Quem entrou é o dono da loja? (só o dono vê Dinheiro, Preço certo e as configurações da loja). Loja única: sim. */
export function souDonoAgora() {
  if (!MULTI) return true;
  const eu = String(state.user?.email || auth.currentUser?.email || "").toLowerCase();
  const dono = String(state.loja?.ownerEmail || "").toLowerCase();
  // Cada aparelho do dono que entrou pelo link da IFTech (celular, PC…) também é dono.
  return !!eu && (eu === dono || (state.loja?.donosLink || []).includes(eu));
}
export function useSouDono() {
  const [dono, setDono] = useState(souDonoAgora);
  useEffect(() => {
    const fn = () => setDono(souDonoAgora());
    fn();
    return subscribeTenant(fn);
  }, []);
  return dono;
}
function savedId() {
  try {
    return localStorage.getItem(SAVED_KEY) || "";
  } catch {
    return "";
  }
}

let lojaUnsub = null;
let ready = false;

/** Escolhe a loja (fica guardada neste aparelho). Trocar de loja recarrega o sistema. */
export function escolherLoja(id) {
  try {
    localStorage.setItem(SAVED_KEY, id);
  } catch {
    /* sem armazenamento */
  }
  if (ready) return window.location.reload();
  lojaUnsub?.();
  set({ status: "loading" });
  lojaUnsub = onSnapshot(
    doc(db, "mesasLojas", id),
    (snap) => {
      const loja = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      if (!loja) return set({ status: "no-store", loja: null });
      if (loja.active !== true) return set({ status: "blocked", loja });
      if (!ready) {
        ready = true;
        setLoja(id);
      }
      set({ status: "ready", loja });
    },
    () => set({ status: "blocked", loja: null })
  );
}

export async function entrarComGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) return signInWithRedirect(auth, provider);
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") return signInWithRedirect(auth, provider);
    if (e?.code !== "auth/popup-closed-by-user" && e?.code !== "auth/cancelled-popup-request") set({ error: "Não foi possível entrar com o Google. Tente de novo." });
  }
}

export async function sair() {
  try {
    localStorage.removeItem(SAVED_KEY);
  } catch {
    /* nada */
  }
  await signOut(auth);
  window.location.reload();
}

// Só nos testes automáticos (REACT_APP_EMULATOR=1): entra com uma conta Google de mentira do emulador.
if (process.env.REACT_APP_EMULATOR === "1") {
  window.__entrarTeste = (email) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
}

/** Acesso criado pelo link de entrada da IFTech (cliente sem acesso ao e-mail). Mesmo padrão das regras do banco. */
export const ehAcessoPorLink = (email) => /^c[a-z0-9]{20}@acesso\.iftechpe\.com\.br$/.test(String(email || "").toLowerCase());

/** Entra com o link de entrada (/mesas/entrar#<código>): o servidor cria o acesso deste celular. */
export async function entrarComLink(token) {
  const r = await mesasApi("entrar", { token }, false);
  await signInWithEmailAndPassword(auth, r.email, r.senha);
  try {
    localStorage.setItem(SAVED_KEY, r.lojaId);
  } catch {
    /* sem armazenamento: escolhe a loja na próxima tela */
  }
  return r;
}

/** Liga o login (só no modo várias lojas, e só nas telas da equipe). */
let started = false;
export function iniciarLogin() {
  if (!MULTI || started) return;
  started = true;
  getRedirectResult(auth).catch(() => {});
  let listUnsub = null;
  onAuthStateChanged(auth, (user) => {
    listUnsub?.();
    if (!user) return set({ status: "signed-out", user: null, lojas: [] });
    const email = (user.email || "").toLowerCase();
    // Google (e-mail verificado) ou o acesso por link da IFTech (e-mail interno, sem caixa de e-mail).
    if (!email || !(user.emailVerified || ehAcessoPorLink(email))) return set({ status: "no-store", user, lojas: [] });
    set({ user });
    listUnsub = onSnapshot(
      query(collection(db, "mesasLojas"), where("memberEmails", "array-contains", email)),
      (snap) => {
        const lojas = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
        set({ lojas });
        if (ready) return;
        if (!lojas.length) return set({ status: "no-store" });
        const saved = lojas.find((l) => l.id === savedId());
        if (saved) return escolherLoja(saved.id);
        if (lojas.length === 1) return escolherLoja(lojas[0].id);
        set({ status: "choose" });
      },
      () => set({ status: "no-store", lojas: [] })
    );
  });
}

/** Chama uma função do Sistema de Mesas no site da IFTech (ex.: "_membros"). */
export async function mesasApi(nome, corpo, comLogin = true) {
  const headers = { "Content-Type": "application/json" };
  if (comLogin) {
    headers.Authorization = `Bearer ${(await auth.currentUser?.getIdToken()) || ""}`;
    headers["X-Loja"] = state.loja?.id || "";
  }
  const res = await fetch(`/mesas/api/${nome}`, { method: "POST", headers, body: JSON.stringify(corpo || {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Não foi possível agora. Tente de novo."), { field: data.field || "" });
  return data;
}
