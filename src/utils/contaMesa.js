// A mesa tem parte da conta já paga (conta parcial)? Quem fecha a mesa fora da tela dela (Painel, Pedidos)
// confere antes: com parte paga, o certo é encerrar pela mesa, que cobra só o que falta.
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";

export async function temPagamentoParcial(mesa) {
  try {
    const s = await getDoc(doc(db, ...L(), "mesas", String(mesa)));
    return Array.isArray(s.data()?.pagamentos) && s.data().pagamentos.length > 0;
  } catch {
    return false;
  }
}

export const AVISO_PARCIAL = (mesa) => `A Mesa ${mesa} já tem parte da conta paga. Encerre pela própria mesa (Mesas → Mesa ${mesa} → Encerrar mesa): lá o sistema cobra só o que falta.`;
