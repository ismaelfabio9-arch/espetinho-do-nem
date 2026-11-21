// WhatsApp da loja (Configurações → WhatsApp da loja), em configuracoes/loja.whatsapp.
// Fica em configuracoes/loja porque o cliente (cardápio online e QR da mesa, sem login) também lê.
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";

/** Só os dígitos, com 55 na frente quando vier só DDD + número. "" se não for um número válido. */
export function numeroWhats(v) {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length < 10) return "";
  return d.length <= 11 ? `55${d}` : d.slice(0, 13);
}

/** Link do WhatsApp com a mensagem pronta. */
export const linkWhats = (numero, texto = "") => `https://wa.me/${numeroWhats(numero)}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;

/** (81) 9 9245-8934 para mostrar. */
export function mostrarFone(v) {
  const d = numeroWhats(v).replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export function useWhatsLoja(base = L()) {
  const [numero, setNumero] = useState("");
  const chave = base.join("/");
  useEffect(
    () =>
      onSnapshot(
        doc(db, ...chave.split("/"), "configuracoes", "loja"),
        (s) => setNumero(numeroWhats(s.data()?.whatsapp)),
        () => setNumero("")
      ),
    [chave]
  );
  return numero;
}

export const salvarWhatsLoja = (v) => setDoc(doc(db, ...L(), "configuracoes", "loja"), { whatsapp: numeroWhats(v) }, { merge: true });
