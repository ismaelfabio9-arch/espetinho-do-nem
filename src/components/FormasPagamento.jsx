// Forma de pagamento com mais de uma opção: marca as formas usadas e escreve quanto foi em cada
// (ex.: Pix R$ 30 + Dinheiro R$ 45). Mostra quanto falta, o troco do dinheiro e quanto cobrar na
// maquininha quando a loja repassa a taxa do cartão.
import { useEffect, useRef } from "react";
import { totalNoCartao } from "../utils/taxas";
import "./FormasPagamento.css";

export const FORMAS = ["Pix", "Dinheiro", "Débito", "Crédito"];
const c = (v) => Math.round(Number(v || 0) * 100);
export const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");
export const numero = (t) => {
  const v = Number(String(t ?? "").trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};
const somaPartes = (partes) => Object.keys(partes).reduce((s, f) => s + c(numero(partes[f])), 0);

/**
 * Confere as formas marcadas contra o valor a pagar.
 * partes: { Pix: "30,00", Dinheiro: "50,00" } (só as formas marcadas).
 * Devolve { ok, erro, lista: [{ forma, valor, taxaCartao?, taxaCartaoPct? }], troco }.
 * Dinheiro pode passar do valor (vira troco); as outras formas não.
 */
export function resolverPartes(valor, partes, taxas) {
  const marcadas = FORMAS.filter((f) => f in (partes || {}));
  if (!marcadas.length) return { ok: false, erro: "Escolha a forma de pagamento." };
  const lista = marcadas.map((f) => ({ forma: f, valor: numero(partes[f]) })).filter((p) => p.valor > 0);
  if (!lista.length) return { ok: false, erro: "Escreva quanto foi pago." };
  const alvo = c(valor);
  const soma = lista.reduce((s, p) => s + c(p.valor), 0);
  if (soma < alvo) return { ok: false, erro: `Falta R$ ${moeda((alvo - soma) / 100)}.` };
  let troco = 0;
  if (soma > alvo) {
    const excesso = soma - alvo;
    const din = lista.find((p) => p.forma === "Dinheiro");
    if (!din || c(din.valor) < excesso) return { ok: false, erro: `Passou R$ ${moeda(excesso / 100)} do valor. Confira os valores.` };
    troco = excesso;
    din.valor = (c(din.valor) - excesso) / 100;
  }
  const final = lista
    .filter((p) => p.valor > 0)
    .map((p) => {
      const ct = taxas ? totalNoCartao(p.valor, taxas, p.forma) : { taxa: 0 };
      return { forma: p.forma, valor: p.valor, ...(ct.taxa ? { taxaCartao: ct.taxa, taxaCartaoPct: ct.taxaPct } : {}) };
    });
  return { ok: true, lista: final, troco: troco / 100 };
}

export default function FormasPagamento({ valor, partes, onChange, taxas }) {
  const marcadas = FORMAS.filter((f) => f in partes);
  const valorAnterior = useRef(valor);

  // Mudou o valor a receber e só uma forma está marcada: ela acompanha o valor.
  useEffect(() => {
    if (valorAnterior.current === valor) return;
    valorAnterior.current = valor;
    const ks = Object.keys(partes);
    if (ks.length === 1) onChange({ [ks[0]]: moeda(valor) });
  }, [valor, partes, onChange]);

  function alternar(forma) {
    const novo = { ...partes };
    if (forma in novo) delete novo[forma];
    else novo[forma] = moeda(Math.max(0, c(valor) - somaPartes(novo)) / 100);
    onChange(novo);
  }

  const r = resolverPartes(valor, partes, taxas);
  const restante = (c(valor) - somaPartes(partes)) / 100;

  return (
    <div className="fp">
      <div className="formas-pagamento fp-botoes">
        {FORMAS.map((f) => (
          <button key={f} type="button" className={f in partes ? "ativo" : ""} aria-pressed={f in partes} onClick={() => alternar(f)}>
            {f in partes ? "✓ " : ""}{f}
          </button>
        ))}
      </div>

      {marcadas.length > 0 && (
        <>
          <div className="fp-linhas">
            {marcadas.map((f) => {
              const v = numero(partes[f]);
              const ct = taxas && v > 0 ? totalNoCartao(v, taxas, f) : null;
              return (
                <div key={f} className="fp-linha">
                  <span className="fp-forma">{f}</span>
                  <label className="fp-valor">
                    R$
                    <input
                      inputMode="decimal"
                      value={partes[f]}
                      onChange={(e) => onChange({ ...partes, [f]: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      aria-label={`Valor pago no ${f}`}
                    />
                  </label>
                  {ct && ct.taxa > 0 && (
                    <small className="fp-cartao">
                      Cobrar na maquininha: <b>R$ {moeda(ct.total)}</b> (taxa R$ {moeda(ct.taxa)})
                    </small>
                  )}
                </div>
              );
            })}
          </div>
          <p className={`fp-status ${r.ok ? "ok" : ""}`} role="status">
            {r.ok
              ? r.troco > 0
                ? `✓ Valor completo · Troco: R$ ${moeda(r.troco)}`
                : "✓ Valor completo"
              : restante > 0
                ? `Falta R$ ${moeda(restante)}${marcadas.length === 1 ? " — pagou em mais de uma forma? Marque outra acima." : ""}`
                : r.erro}
          </p>
        </>
      )}
    </div>
  );
}
