// Caixa do mês (o caixa da loja): só o dinheiro que a dona deixa para a loja. Entra o que ela separa no
// fechamento do dia ("vai para o caixa") e os reforços; sai a sangria e o que for pago com ele (fornecedor,
// conta). Não conta a gaveta (caixa do dia) nem o que a dona tira para ela.
//
// caixaLoja/<id>: { tipo: "entrada" | "saida", valor, motivo, origem: "fechamento" | "reforco" | "sangria" | "pagamento",
//                   dia: "AAAA-MM-DD", em, por }
import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../firebase";
import { L } from "../loja";
import { isoDia } from "./financas";

const r2 = (v) => Math.round(v * 100) / 100;

export function movCaixaLoja({ tipo, valor, motivo, origem }) {
  const agora = new Date();
  return addDoc(collection(db, ...L(), "caixaLoja"), {
    tipo,
    valor: r2(Number(valor || 0)),
    motivo: String(motivo || "").slice(0, 120),
    origem,
    dia: isoDia(agora),
    em: agora.toISOString(),
    por: auth.currentUser?.email || "",
    criadoEm: serverTimestamp(),
  });
}

/** Saldo do caixa do mês e o que entrou e saiu no mês. */
export function useCaixaLoja() {
  const [lista, setLista] = useState(null);
  useEffect(() => onSnapshot(collection(db, ...L(), "caixaLoja"), (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLista([])), []);
  return useMemo(() => {
    if (lista === null) return null;
    const mes = isoDia().slice(0, 7);
    const sinal = (m) => (m.tipo === "saida" ? -1 : 1) * Number(m.valor || 0);
    const doMes = lista.filter((m) => String(m.dia || "").slice(0, 7) === mes);
    return {
      saldo: r2(lista.reduce((t, m) => t + sinal(m), 0)),
      entrou: r2(doMes.filter((m) => m.tipo !== "saida").reduce((t, m) => t + Number(m.valor || 0), 0)),
      saiu: r2(doMes.filter((m) => m.tipo === "saida").reduce((t, m) => t + Number(m.valor || 0), 0)),
      lista: lista.sort((a, b) => String(b.em).localeCompare(String(a.em))),
    };
  }, [lista]);
}
