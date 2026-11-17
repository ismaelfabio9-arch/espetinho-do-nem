// Nome do estabelecimento: na instalação própria, "Espetinho do Nem"; nas lojas do site da
// IFTech, o nome que a loja cadastrou (configuracoes/loja, gravado na contratação).
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { L, MULTI } from "../loja";

export const NOME_PADRAO = "Espetinho do Nem";

export default function useNomeLoja() {
  const [nome, setNome] = useState(MULTI ? "" : NOME_PADRAO);
  useEffect(() => {
    if (!MULTI) return undefined;
    return onSnapshot(
      doc(db, ...L(), "configuracoes", "loja"),
      (snap) => setNome(String(snap.data()?.nome || "")),
      () => setNome("")
    );
  }, []);
  return nome;
}
