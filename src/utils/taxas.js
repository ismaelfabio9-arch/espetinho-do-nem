// Taxas da maquininha (Configurações → Taxas da maquininha). Ficam em configuracoes/loja.taxasCartao:
//   { debito: 1.99, credito: 4.98, passarDebito: true, passarCredito: true }
// "Passar para o cliente": o total no cartão sobe o suficiente para a loja receber o valor da conta
// depois que a maquininha tira a taxa (valor / (1 − taxa)). Sem marcar, a loja absorve a taxa.
// O cliente da mesa também lê (aviso no cardápio do QR Code), por isso fica em configuracoes/loja.
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";

const pct = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 30 ? Math.round(n * 100) / 100 : 0;
};

export function lerTaxas(cfg) {
  const t = cfg?.taxasCartao || {};
  return { debito: pct(t.debito), credito: pct(t.credito), passarDebito: t.passarDebito === true, passarCredito: t.passarCredito === true };
}

/** Taxa que entra na conta para a forma de pagamento ("Débito" ou "Crédito"); 0 se a loja absorve. */
export function taxaRepassada(taxas, forma) {
  if (forma === "Débito" && taxas.passarDebito) return taxas.debito;
  if (forma === "Crédito" && taxas.passarCredito) return taxas.credito;
  return 0;
}

/** Total no cartão com a taxa repassada: { taxaPct, taxa, total }. */
export function totalNoCartao(valor, taxas, forma) {
  const taxaPct = taxaRepassada(taxas, forma);
  const base = Math.round(Number(valor || 0) * 100) / 100;
  if (!taxaPct) return { taxaPct: 0, taxa: 0, total: base };
  const total = Math.ceil((base / (1 - taxaPct / 100)) * 100 - 1e-6) / 100;
  return { taxaPct, taxa: Math.round((total - base) * 100) / 100, total };
}

/** Alguma taxa é repassada? (para o aviso no cardápio do cliente) */
export const repassaAlguma = (t) => (t.passarDebito && t.debito > 0) || (t.passarCredito && t.credito > 0);

export function useTaxas(base = L()) {
  const [taxas, setTaxas] = useState(() => lerTaxas(null));
  const chave = base.join("/");
  useEffect(
    () =>
      onSnapshot(
        doc(db, ...chave.split("/"), "configuracoes", "loja"),
        (s) => setTaxas(lerTaxas(s.data())),
        () => setTaxas(lerTaxas(null))
      ),
    [chave]
  );
  return taxas;
}

export function salvarTaxas(t) {
  return setDoc(
    doc(db, ...L(), "configuracoes", "loja"),
    { taxasCartao: { debito: pct(t.debito), credito: pct(t.credito), passarDebito: !!t.passarDebito, passarCredito: !!t.passarCredito } },
    { merge: true }
  );
}
