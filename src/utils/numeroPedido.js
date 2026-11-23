import { doc, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";

/**
 * Número curto do pedido para a comanda (1, 2, 3...), que recomeça todo dia.
 * O código do pedido no Firebase é comprido (letras e números); aqui cada pedido ganha
 * o próximo número do dia, guardado em contadores/pedidos. Reimprimir o mesmo pedido
 * (ou a mesma mesa aberta) mostra o mesmo número. Sem internet, a comanda sai sem número.
 */
export async function numeroDoPedido(pedidoId) {
  if (!pedidoId) return "";
  try {
    const ref = doc(db, ...L(), "contadores", "pedidos");
    const hoje = new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no horário do aparelho
    // Espera no máximo 2,5 s: a janela de impressão precisa abrir logo depois do toque.
    const limite = new Promise((resolve) => setTimeout(() => resolve(""), 2500));
    const contar = runTransaction(db, async (t) => {
      const snap = await t.get(ref);
      const dados = snap.exists() ? snap.data() : {};
      const mesmoDia = dados.dia === hoje;
      const ids = mesmoDia ? dados.ids || {} : {};
      if (ids[pedidoId]) return ids[pedidoId];
      const numero = (mesmoDia ? Number(dados.ultimo) || 0 : 0) + 1;
      t.set(ref, { dia: hoje, ultimo: numero, ids: { ...ids, [pedidoId]: numero } });
      return numero;
    }).catch((erro) => {
      console.error("Número do pedido:", erro);
      return "";
    });
    return await Promise.race([contar, limite]);
  } catch (erro) {
    console.error("Número do pedido:", erro);
    return "";
  }
}
