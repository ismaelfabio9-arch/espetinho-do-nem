// Senha da dona (função "dinheiro-completo"): tudo o que mexe com dinheiro pede a senha que a dona criou
// em Configurações → Senha da dona. Ela pode liberar outras pessoas, cada uma com a sua senha.
// configuracoes/senhaDona: { dona: { sal, hash }, pessoas: [{ id, nome, sal, hash }], atualizadoEm }
// A senha nunca é gravada: só o resumo dela (PBKDF2 com sal). Liberou: vale neste aparelho por 30 minutos
// ou até tocar em Bloquear.
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";

const CHAVE = "iftech_senha_dona_ok";
const VALE_MS = 30 * 60 * 1000;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function resumo(senha, sal) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(senha)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(sal), iterations: 120000, hash: "SHA-256" }, chave, 256);
  return hex(bits);
}

export async function novaSenha(senha) {
  const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { sal, hash: await resumo(senha, sal) };
}

/** Confere a senha: devolve o nome de quem é ("Dona" ou o nome da pessoa liberada) ou null. */
export async function conferirSenha(cfg, senha) {
  if (!cfg) return null;
  if (cfg.dona && (await resumo(senha, cfg.dona.sal)) === cfg.dona.hash) return "Dona";
  for (const p of cfg.pessoas || []) {
    if ((await resumo(senha, p.sal)) === p.hash) return p.nome;
  }
  return null;
}

export function salvarSenhas(dados) {
  return setDoc(doc(db, ...L(), "configuracoes", "senhaDona"), { ...dados, atualizadoEm: new Date().toISOString() }, { merge: true });
}

/** Configuração das senhas (null carregando, {} sem senha criada). */
export function useSenhaDona() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => onSnapshot(doc(db, ...L(), "configuracoes", "senhaDona"), (s) => setCfg(s.data() || {}), () => setCfg({})), []);
  return cfg;
}

function lerLiberado() {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAVE) || "null");
    return v && v.ate > Date.now() ? v : null;
  } catch {
    return null;
  }
}

export function liberar(quem) {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify({ quem, ate: Date.now() + VALE_MS }));
  } catch {
    /* sem armazenamento: vale só nesta tela */
  }
  avisar();
}

export function bloquear() {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* nada */
  }
  avisar();
}

/** Quem liberou neste aparelho ({ quem, ate }) ou null. */
export function useLiberado() {
  const [v, setV] = useState(lerLiberado);
  useEffect(() => {
    const fn = () => setV(lerLiberado());
    ouvintes.add(fn);
    const t = setInterval(fn, 30000);
    return () => {
      ouvintes.delete(fn);
      clearInterval(t);
    };
  }, []);
  return v;
}
