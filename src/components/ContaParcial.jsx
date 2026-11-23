// Conta da mesa sem fechar: ver a conta, dividir entre as pessoas e receber de cada uma.
// Cada recebimento fica gravado na mesa (mesas/<n>.pagamentos, com o nome de quem pagou) e
// entra no caixa ao encerrar. "Cada um paga o seu", resumido: escreve quanto a pessoa paga e
// o resto é dividido entre os outros.
import { useMemo, useState } from "react";
import { dividirIgual, falta as faltaDe, totalPago } from "../utils/conta";
import FormasPagamento, { moeda, numero, resolverPartes } from "./FormasPagamento";
import "./ContaParcial.css";

const c = (v) => Math.round(Number(v || 0) * 100);
const qtd = (i) => Number(i.qtd || i.quantidade || 0);

export default function ContaParcial({ mesa, itens, total, naoSalvo = 0, pagamentos = [], taxas, podeImprimir, onImprimir, onReceber, onTirar, onFechar }) {
  // Quem já pagou (pelo nome gravado no pagamento): volta assim quando a tela abre de novo.
  const quemJaPagou = useMemo(() => [...new Set(pagamentos.map((p) => String(p.quem || "").trim()).filter(Boolean))], [pagamentos]);
  const [aba, setAba] = useState(quemJaPagou.length ? "dividir" : "conta"); // conta | dividir
  const [pessoas, setPessoas] = useState(Math.max(2, quemJaPagou.length));
  const [nomes, setNomes] = useState(() => Object.fromEntries(quemJaPagou.map((n, i) => [i, /^Pessoa \d+$/.test(n) ? "" : n])));
  const [proprio, setProprio] = useState({}); // { i: "35,00" } quem paga um valor próprio
  const [receber, setReceber] = useState(null); // { valor, quem, partes }
  const [salvando, setSalvando] = useState(false);
  const [desfazer, setDesfazer] = useState(null);
  const [msg, setMsg] = useState("");

  const pago = totalPago(pagamentos);
  const falta = faltaDe(total, pagamentos);
  const nomeDe = (i) => nomes[i]?.trim() || `Pessoa ${i + 1}`;
  const pagosDe = (nome) => pagamentos.filter((p) => String(p.quem || "").trim() === nome);

  // Divisão: quem ainda não pagou divide o que falta; quem escreveu um valor próprio paga esse valor.
  const linhas = Array.from({ length: pessoas }, (_, i) => {
    const nome = nomeDe(i);
    const pagos = pagosDe(nome);
    return { i, nome, pagos, pago: totalPago(pagos) };
  });
  const pendentes = linhas.filter((l) => l.pago === 0);
  const fixos = pendentes.filter((l) => numero(proprio[l.i]) > 0);
  const somaFixos = fixos.reduce((s, l) => s + c(numero(proprio[l.i])), 0);
  const livres = pendentes.filter((l) => !(numero(proprio[l.i]) > 0));
  const partesIguais = dividirIgual(Math.max(0, c(falta) - somaFixos) / 100, Math.max(1, livres.length));
  const valorDe = (l) => (numero(proprio[l.i]) > 0 ? numero(proprio[l.i]) : partesIguais[livres.indexOf(l)] || 0);
  const passou = somaFixos > c(falta);
  const naoPaga = livres.length === 0 && pendentes.length > 0 && somaFixos < c(falta);

  const abrirReceber = (valor, quem = "") => {
    setReceber({ valor: moeda(Math.min(valor, falta)), quem, partes: {} });
    setMsg("");
  };

  async function confirmarReceber() {
    const valor = numero(receber.valor);
    if (!(valor > 0)) return setMsg("Escreva o valor.");
    if (valor > falta + 0.001) return setMsg(`Passa do que falta (R$ ${moeda(falta)}).`);
    const r = resolverPartes(valor, receber.partes, taxas);
    if (!r.ok) return setMsg(r.erro);
    setSalvando(true);
    try {
      await onReceber(r.lista.map((p) => ({ ...p, ...(receber.quem ? { quem: receber.quem } : {}) })), r.troco);
      setReceber(null);
      setMsg("");
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
    setSalvando(false);
  }

  const textoFormas = (lista) => lista.map((p) => `${p.forma} R$ ${moeda(p.valor)}`).join(" + ");

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-card cp" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Conta da Mesa ${mesa}`}>
        <div className="cp-topo">
          <h2>🧾 Conta da Mesa {mesa}</h2>
          <button type="button" className="cp-x" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="cp-placar">
          <div>
            <span>Total</span>
            <b>R$ {moeda(total)}</b>
          </div>
          <div className="pago">
            <span>Já pago</span>
            <b>R$ {moeda(pago)}</b>
          </div>
          <div className={falta > 0 ? "falta" : "pago"}>
            <span>Falta</span>
            <b>R$ {moeda(falta)}</b>
          </div>
        </div>
        {naoSalvo > 0 && <p className="cp-aviso">Tem R$ {moeda(naoSalvo)} em itens ainda não salvos: salve o pedido para entrarem na conta.</p>}
        {falta === 0 && total > 0 && <p className="cp-ok">✅ A conta toda foi paga. Pode encerrar a mesa.</p>}

        <div className="cp-abas" role="tablist">
          {[["conta", "Conta"], ["dividir", "Dividir conta"]].map(([k, n]) => (
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
              {falta > 0 && <button type="button" className="cp-btn verde" onClick={() => abrirReceber(falta)}>💵 Receber um valor</button>}
            </div>
          </>
        )}

        {aba === "dividir" && (
          <>
            <div className="cp-pessoas">
              <span>Dividir entre</span>
              <button type="button" aria-label="Menos uma pessoa" onClick={() => setPessoas((n) => Math.max(Math.max(2, linhas.filter((l) => l.pago > 0).length), n - 1))}>−</button>
              <b aria-label="Pessoas">{pessoas}</b>
              <button type="button" aria-label="Mais uma pessoa" onClick={() => setPessoas((n) => Math.min(30, n + 1))}>+</button>
              <span>pessoas</span>
            </div>
            <p className="cp-dica">Alguém vai pagar só o que consumiu? Escreva o valor dele e o resto é dividido entre os outros.</p>

            <ul className="cp-divisao">
              {linhas.map((l) => (
                <li key={l.i} className={l.pago > 0 ? "pagou" : ""}>
                  <input
                    className="cp-nome"
                    value={nomes[l.i] || ""}
                    placeholder={`Pessoa ${l.i + 1}`}
                    disabled={l.pago > 0}
                    onChange={(e) => setNomes({ ...nomes, [l.i]: e.target.value })}
                    aria-label={`Nome da pessoa ${l.i + 1}`}
                  />
                  {l.pago > 0 ? (
                    <span className="cp-pagou">✓ Pagou R$ {moeda(l.pago)} <small>({textoFormas(l.pagos)})</small></span>
                  ) : (
                    <>
                      <label className="cp-parte" title="Valor desta pessoa">
                        R$
                        <input
                          inputMode="decimal"
                          value={proprio[l.i] ?? ""}
                          placeholder={moeda(valorDe(l))}
                          onChange={(e) => setProprio({ ...proprio, [l.i]: e.target.value })}
                          aria-label={`Valor que ${l.nome} vai pagar`}
                        />
                      </label>
                      <button type="button" className="cp-btn verde mini" disabled={falta <= 0 || valorDe(l) <= 0} onClick={() => abrirReceber(valorDe(l), l.nome)}>
                        Receber
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {passou && <p className="cp-aviso">Os valores escritos passam do que falta (R$ {moeda(falta)}). Confira.</p>}
            {naoPaga && <p className="cp-aviso">Ainda vão faltar R$ {moeda((c(falta) - somaFixos) / 100)}: apague o valor de alguém para ele dividir o resto.</p>}
          </>
        )}

        {receber && (
          <div className="cp-receber">
            <strong>Receber{receber.quem ? ` de ${receber.quem}` : ""}</strong>
            <label className="cp-valor">
              Valor R$
              <input inputMode="decimal" value={receber.valor} onFocus={(e) => e.target.select()} onChange={(e) => setReceber({ ...receber, valor: e.target.value })} aria-label="Valor a receber" />
            </label>
            <FormasPagamento valor={numero(receber.valor)} partes={receber.partes} onChange={(partes) => setReceber((r) => ({ ...r, partes }))} taxas={taxas} />
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
