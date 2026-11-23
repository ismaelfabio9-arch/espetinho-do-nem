import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, runTransaction, setDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";
import { useConfigImpressora } from "../hooks/useConfigImpressora";
import {
  configurarImpressaoRemota,
  esteAparelhoImprime,
  imprimirAqui,
  registrarSinalPc,
} from "../utils/print";

// Comanda mandada pelo celular que ficou esperando mais que isso (computador fechado) não sai mais.
const VALIDADE_MS = 30 * 60 * 1000;

/**
 * Fica ligado em todas as telas da equipe.
 * - Em todo aparelho: avisa o módulo de impressão se a loja imprime pelo computador e
 *   quando o computador deu sinal pela última vez.
 * - No computador da impressora: recebe as comandas dos celulares e imprime na hora,
 *   uma de cada vez, e dá sinal de vida a cada minuto.
 */
export default function EstacaoImpressao() {
  const config = useConfigImpressora();
  const ligadoNaLoja = Boolean(config.habilitada && config.imprimirNoPc);
  const [estePc, setEstePc] = useState(esteAparelhoImprime());

  useEffect(() => {
    const atualizar = () => setEstePc(esteAparelhoImprime());
    window.addEventListener("estacao-impressao", atualizar);
    return () => window.removeEventListener("estacao-impressao", atualizar);
  }, []);

  useEffect(() => {
    configurarImpressaoRemota(ligadoNaLoja);
  }, [ligadoNaLoja]);

  // Sinal de vida do computador (todo aparelho lê, para avisar se ele está fechado).
  useEffect(() => {
    if (!ligadoNaLoja) return undefined;
    return onSnapshot(
      doc(db, ...L(), "estacaoImpressao", "pc"),
      (snap) => registrarSinalPc(snap.exists() ? snap.data().vistoMs : 0),
      () => {}
    );
  }, [ligadoNaLoja]);

  const imprimeAqui = ligadoNaLoja && estePc;

  useEffect(() => {
    if (!imprimeAqui) return undefined;

    const darSinal = () =>
      setDoc(doc(db, ...L(), "estacaoImpressao", "pc"), { vistoMs: Date.now() }).catch(() => {});
    darSinal();
    const relogio = setInterval(darSinal, 60 * 1000);

    let fila = Promise.resolve();
    const pendentes = query(collection(db, ...L(), "impressoes"), where("status", "==", "pendente"));
    const cancelar = onSnapshot(
      pendentes,
      (snap) => {
        snap.docChanges().forEach((mudanca) => {
          if (mudanca.type !== "added") return;
          const ref = mudanca.doc.ref;
          fila = fila.then(() => pegarEImprimir(ref)).catch((erro) => console.error("Impressão do celular:", erro));
        });
      },
      (erro) => console.error("Impressão do celular:", erro)
    );

    return () => {
      clearInterval(relogio);
      cancelar();
    };
  }, [imprimeAqui]);

  if (!imprimeAqui) return null;
  return (
    <div
      className="no-print"
      role="status"
      style={{
        position: "fixed",
        left: 10,
        bottom: 74,
        zIndex: 9000,
        background: "#15803d",
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        padding: "6px 10px",
        borderRadius: 999,
        boxShadow: "0 2px 8px rgba(0,0,0,.2)",
        pointerEvents: "none",
      }}
    >
      🖨️ Imprimindo os pedidos dos celulares
    </div>
  );
}

/** Pega a comanda (só um computador pega cada uma), apaga da fila e imprime. */
async function pegarEImprimir(ref) {
  let dados = null;
  try {
    dados = await runTransaction(db, async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists() || snap.data().status !== "pendente") return null;
      t.delete(ref);
      return snap.data();
    });
  } catch (erro) {
    console.error("Impressão do celular:", erro);
    return;
  }
  if (!dados || !dados.html) return;
  if (Date.now() - Number(dados.criadoMs || 0) > VALIDADE_MS) return;
  await imprimirAqui(dados.html, dados.larguraPapel || "58mm", true);
  // Um respiro entre uma comanda e outra.
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
