// Rotina do caixa todo dia: na tela inicial, lembra de abrir o caixa do dia e avisa quando o
// caixa de um dia anterior ficou aberto. Só aparece onde a loja tem Finanças (Completo e Premium).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";
import { useRecurso } from "../recursos";
import { isoDia } from "../utils/financas";
import "../styles/Garcom/AvisoCaixa.css";

/** Caixa aberto agora: undefined = carregando, null = nenhum. */
export function useCaixaAberto(ligado = true) {
  const [caixa, setCaixa] = useState(undefined);
  useEffect(() => {
    if (!ligado) return undefined;
    return onSnapshot(
      query(collection(db, ...L(), "caixas"), where("status", "==", "aberto"), limit(1)),
      (s) => setCaixa(s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() }),
      () => setCaixa(null)
    );
  }, [ligado]);
  return caixa;
}

/** O caixa foi aberto num dia anterior ao de hoje? */
export const caixaDeOutroDia = (caixa) => !!caixa?.abertoEm && isoDia(new Date(caixa.abertoEm)) < isoDia();

export default function AvisoCaixa() {
  const ligado = useRecurso("financas");
  const caixa = useCaixaAberto(ligado);
  if (!ligado || caixa === undefined) return null;
  if (!caixa)
    return (
      <Link to="/caixa" className="aviso-caixa fechado">
        <span>🧾 <strong>Caixa fechado.</strong> Abra o caixa do dia com o troco da gaveta.</span>
        <b>Abrir caixa</b>
      </Link>
    );
  if (caixaDeOutroDia(caixa))
    return (
      <Link to="/caixa" className="aviso-caixa atrasado">
        <span>⚠️ <strong>O caixa está aberto desde {new Date(caixa.abertoEm).toLocaleDateString("pt-BR")}.</strong> Feche o caixa de ontem e abra o de hoje.</span>
        <b>Fechar caixa</b>
      </Link>
    );
  return (
    <Link to="/caixa" className="aviso-caixa aberto">
      <span>● Caixa aberto desde {new Date(caixa.abertoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
      <b>Ver caixa</b>
    </Link>
  );
}
