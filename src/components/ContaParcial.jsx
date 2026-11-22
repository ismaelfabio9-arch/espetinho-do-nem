// Conta parcial da mesa: a conta até agora (sem fechar), dividir entre os amigos (igual ou pelo que cada
// um consumiu) e receber uma parte (valor + forma), que fica gravada na mesa e entra no caixa ao encerrar.
import { useMemo, useState } from "react";
import { dividirIgual, dividirPorConsumo, falta as faltaDe, totalPago } from "../utils/conta";
import { totalNoCartao } from "../utils/taxas";
import "./ContaParcial.css";

const FORMAS = ["Pix", "Dinheiro", "Débito", "Crédito"];
const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");
const numero = (t) => {
  const v = Number(String(t ?? "").trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};
const qtd = (i) => Number(i.qtd || i.quantidade || 0);

export default function ContaParcial({ mesa, itens, total, naoSalvo = 0, pagamentos = [], taxas, podeImprimir, onImprimir, onReceber, onTirar, onFechar }) {
  const [aba, setAba] = useState("conta"); // conta | igual | consumo
  const [pessoas, setPessoas] = useState(2);
  const [nomes, setNomes] = useState({});
  const [dono, setDono] = useState({});
  const [receber, setReceber] = useState(null); // { valor, forma, quem }
  const [salvando, setSalvando] = useState(false);
  const [desfazer, setDesfazer] = useState(null);
  const [msg, setMsg] = useState("");
  const pago = totalPago(pagamentos);
  const falta = faltaDe(total, pagamentos);
  const nomeDe = (i) => nomes[i]?.trim() || `Pessoa ${i + 1}`;

  // Cada unidade de cada item vira uma linha que dá para marcar de quem é.
  const unidades = useMemo(
    () => itens.flatMap((it, k) => Array.from({ length: Math.max(0, Math.round(qtd(it))) }, (_, u) => ({ chave: `${k}-${u}`, nome: it.nome, preco: Number(it.preco || 0) }))),
    [itens]
  );
  const iguais = dividirIgual(falta, pessoas);
  const consumo = dividirPorConsumo(unidades, dono, pessoas);

  async function confirmarReceber() {
    const valor = numero(receber.valor);
    if (!(valor > 0)) return setMsg("Escreva o valor.");
    if (valor > falta + 0.001) return setMsg(`Passa do que falta (R$ ${moeda(falta)}).`);
    if (!receber.forma) return setMsg("Escolha a forma de pagamento.");
    const cartao = totalNoCartao(valor, taxas, receber.forma);
    setSalvando(true);
    try {
      await onReceber({ valor, forma: receber.forma, ...(cartao.taxa ? { taxaCartao: cartao.taxa, taxaCartaoPct: cartao.taxaPct } : {}), ...(receber.quem ? { quem: receber.quem } : {}) });
      setReceber(null);
      setMsg("");
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
    setSalvando(false);
  }

  const abrirReceber = (valor, quem = "") => {
    setReceber({ valor: moeda(Math.min(valor, falta)), forma: "", quem });
    setMsg("");
  };

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-card cp" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Conta parcial da Mesa ${mesa}`}>
        <div className="cp-topo">
          <h2>🧾 Conta da Mesa {mesa}</h2>
          <button type="button" className="cp-x" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="cp-resumo">
          <span>Total <b>R$ {moeda(total)}</b></span>
          {pago > 0 && <span>Já pago <b className="cp-verde">R$ {moeda(pago)}</b></span>}
          <span>Falta <b className={falta > 0 ? "cp-falta" : "cp-verde"}>R$ {moeda(falta)}</b></span>
        </div>
        {naoSalvo > 0 && <p className="cp-aviso">Tem R$ {moeda(naoSalvo)} em itens ainda não salvos: salve o pedido para entrarem na conta.</p>}

        <div className="cp-abas" role="tablist">
          {[["conta", "Conta"], ["igual", "Dividir igual"], ["consumo", "Cada um o seu"]].map(([k, n]) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? "ativo" : ""} onClick={() => setAba(k)}>{n}</button>
          ))}
        </div>

        {aba === "conta" && (
          <>
            <ul className="cp-itens">
              {itens.map((it, k) => (
                <li key={k}><span>{qtd(it)}× {it.nome}</span><b>R$ {moeda(Number(it.preco || 0) * qtd(it))}</b></li>
              ))}
            </ul>
            {pagamentos.length > 0 && (
              <ul className="cp-pagos" aria-label="Já pago">
                {pagamentos.map((p) => (
                  <li key={p.id}>
                    <span>✓ {p.quem ? `${p.quem} · ` : ""}{p.forma}{p.taxaCartao ? ` (+ R$ ${moeda(p.taxaCartao)} da maquininha)` : ""}</span>
                    <b>R$ {moeda(p.valor)}</b>
                    {desfazer === p.id ? (
                      <button type="button" className="cp-tirar" onClick={() => { setDesfazer(null); onTirar(p); }}>confirmar desfazer?</button>
                    ) : (
                      <button type="button" className="cp-tirar" aria-label={`Desfazer pagamento de R$ ${moeda(p.valor)}`} onClick={() => setDesfazer(p.id)}>desfazer</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="cp-botoes">
              {podeImprimir && <button type="button" className="cp-btn" onClick={() => onImprimir()}>🖨️ Imprimir conta parcial</button>}
              {falta > 0 && <button type="button" className="cp-btn verde" onClick={() => abrirReceber(falta)}>💵 Receber uma parte</button>}
            </div>
          </>
        )}

        {aba === "igual" && (
          <>
            <div className="cp-pessoas">
              <span>Dividir o que falta por</span>
              <button type="button" aria-label="Menos uma pessoa" onClick={() => setPessoas((n) => Math.max(2, n - 1))}>−</button>
              <b aria-label="Pessoas">{pessoas}</b>
              <button type="button" aria-label="Mais uma pessoa" onClick={() => setPessoas((n) => Math.min(30, n + 1))}>+</button>
              <span>pessoas</span>
            </div>
            <p className="cp-cada">
              {new Set(iguais).size === 1 ? (
                <>Cada um paga <b>R$ {moeda(iguais[0])}</b></>
              ) : (
                <>{iguais.filter((v) => v === iguais[0]).length} pagam <b>R$ {moeda(iguais[0])}</b> e {iguais.filter((v) => v !== iguais[0]).length} {iguais.filter((v) => v !== iguais[0]).length === 1 ? "paga" : "pagam"} <b>R$ {moeda(iguais[iguais.length - 1])}</b></>
              )}
            </p>
            {falta > 0 && <button type="button" className="cp-btn verde" onClick={() => abrirReceber(iguais[0])}>💵 Receber de uma pessoa (R$ {moeda(iguais[0])})</button>}
          </>
        )}

        {aba === "consumo" && (
          <>
            <div className="cp-pessoas">
              <span>Pessoas</span>
              <button type="button" aria-label="Menos uma pessoa" onClick={() => setPessoas((n) => Math.max(2, n - 1))}>−</button>
              <b>{pessoas}</b>
              <button type="button" aria-label="Mais uma pessoa" onClick={() => setPessoas((n) => Math.min(12, n + 1))}>+</button>
            </div>
            <div className="cp-nomes">
              {Array.from({ length: pessoas }, (_, i) => (
                <input key={i} value={nomes[i] || ""} placeholder={`Pessoa ${i + 1}`} onChange={(e) => setNomes({ ...nomes, [i]: e.target.value })} aria-label={`Nome da pessoa ${i + 1}`} />
              ))}
            </div>
            <p className="cp-dica">Toque em quem pediu cada item. O que é de todos (ex.: uma porção) é dividido igual.</p>
            <ul className="cp-unidades">
              {unidades.map((u) => (
                <li key={u.chave}>
                  <span className="cp-un-nome">{u.nome} <small>R$ {moeda(u.preco)}</small></span>
                  <span className="cp-donos">
                    {Array.from({ length: pessoas }, (_, i) => (
                      <button key={i} type="button" className={dono[u.chave] === i ? "ativo" : ""} onClick={() => setDono({ ...dono, [u.chave]: i })} aria-label={`${u.nome}: ${nomeDe(i)}`}>{nomeDe(i)}</button>
                    ))}
                    <button type="button" className={dono[u.chave] === "todos" ? "ativo" : ""} onClick={() => setDono({ ...dono, [u.chave]: "todos" })} aria-label={`${u.nome}: todos`}>Todos</button>
                  </span>
                </li>
              ))}
            </ul>
            <ul className="cp-por-pessoa">
              {consumo.porPessoa.map((v, i) => (
                <li key={i}>
                  <span>{nomeDe(i)}</span>
                  <b>R$ {moeda(v)}</b>
                  {falta > 0 && v > 0 && <button type="button" className="cp-btn mini" onClick={() => abrirReceber(v, nomeDe(i))}>Receber</button>}
                </li>
              ))}
            </ul>
            {consumo.semDono > 0 && <p className="cp-aviso">Falta marcar de quem são R$ {moeda(consumo.semDono)} em itens.</p>}
            {pago > 0 && <p className="cp-dica">Já foram pagos R$ {moeda(pago)} desta conta: confira antes de receber de novo.</p>}
          </>
        )}

        {receber && (
          <div className="cp-receber">
            <strong>Receber uma parte{receber.quem ? ` (${receber.quem})` : ""}</strong>
            <label className="cp-valor">
              R$
              <input inputMode="decimal" value={receber.valor} onChange={(e) => setReceber({ ...receber, valor: e.target.value })} aria-label="Valor recebido" />
            </label>
            <div className="formas-pagamento">
              {FORMAS.map((f) => (
                <button key={f} type="button" className={receber.forma === f ? "ativo" : ""} onClick={() => setReceber({ ...receber, forma: f })}>{f}</button>
              ))}
            </div>
            {receber.forma && totalNoCartao(numero(receber.valor), taxas, receber.forma).taxa > 0 && (
              <p className="cp-dica">Cobrar na maquininha: <b>R$ {moeda(totalNoCartao(numero(receber.valor), taxas, receber.forma).total)}</b> (com a taxa do cartão)</p>
            )}
            {msg && <p className="cp-erro">{msg}</p>}
            <div className="cp-botoes">
              <button type="button" className="cp-btn" onClick={() => setReceber(null)}>Cancelar</button>
              <button type="button" className="cp-btn verde" disabled={salvando} onClick={confirmarReceber}>{salvando ? "Salvando…" : "Confirmar recebido"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
