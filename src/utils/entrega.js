// Cardápio online (pedido de casa, plano Premium): configuração do dono em configuracoes/loja.entrega
//   { ligado: true, taxa: 5, retirada: true }
// Fica em configuracoes/loja porque o cliente (sem login) também lê, para mostrar a taxa e se a loja está aberta.
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";

const valor = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1000 ? Math.round(n * 100) / 100 : 0;
};

export function lerEntrega(cfg) {
  const e = cfg?.entrega || {};
  return { ligado: e.ligado === true, taxa: valor(e.taxa), retirada: e.retirada === true, carregado: !!cfg };
}

export function useEntrega() {
  const [e, setE] = useState(() => ({ ...lerEntrega(null), carregado: false }));
  useEffect(
    () =>
      onSnapshot(
        doc(db, ...L(), "configuracoes", "loja"),
        (s) => setE({ ...lerEntrega(s.data() || {}), carregado: true }),
        () => setE({ ...lerEntrega(null), carregado: true })
      ),
    []
  );
  return e;
}

export function salvarEntrega(e) {
  return setDoc(doc(db, ...L(), "configuracoes", "loja"), { entrega: { ligado: !!e.ligado, taxa: valor(e.taxa), retirada: !!e.retirada } }, { merge: true });
}

export const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");
