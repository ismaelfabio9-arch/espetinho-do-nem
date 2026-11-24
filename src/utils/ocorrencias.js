// O que aconteceu no dia e a equipe precisa ver junto com o dinheiro (o registro completo fica em
// "registro", que só o dono lê): produto que acabou, item tirado da comanda, prato que saiu diferente
// (o cliente ficou com ele), cortesia. Vai para a lista de Hoje no Dinheiro, o fechamento do dia e o relatório.
//
// ocorrencias/<id>: { tipo, dia: "AAAA-MM-DD", em, texto, valor?, motivo?, mesa?, produtoId?, por }
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { L } from "../loja";
import { isoDia } from "./financas";

export const TIPOS_OCORRENCIA = {
  acabou: "Acabou",
  tirou: "Tirou da comanda",
  saiuDiferente: "Saiu diferente",
  cortesia: "Cortesia",
  cancelou: "Pedido cancelado",
};

export function registrarOcorrencia(dados) {
  const agora = new Date();
  return addDoc(collection(db, ...L(), "ocorrencias"), {
    tipo: dados.tipo,
    dia: isoDia(agora),
    em: agora.toISOString(),
    texto: String(dados.texto || "").slice(0, 200),
    ...(typeof dados.valor === "number" ? { valor: Math.round(dados.valor * 100) / 100 } : {}),
    ...(dados.motivo ? { motivo: String(dados.motivo).slice(0, 120) } : {}),
    ...(dados.mesa ? { mesa: String(dados.mesa) } : {}),
    ...(dados.produtoId ? { produtoId: dados.produtoId } : {}),
    por: auth.currentUser?.email || "",
    criadoEm: serverTimestamp(),
  }).catch(() => {});
}

/** Ocorrências de um dia (ou de um período, de/ate em AAAA-MM-DD). */
export function useOcorrencias(de, ate = de) {
  const [lista, setLista] = useState(null);
  useEffect(() => {
    if (!de) return undefined;
    const q = query(collection(db, ...L(), "ocorrencias"), where("dia", ">=", de), where("dia", "<=", ate || de));
    return onSnapshot(q, (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.em).localeCompare(String(a.em)))), () => setLista([]));
  }, [de, ate]);
  return lista;
}
