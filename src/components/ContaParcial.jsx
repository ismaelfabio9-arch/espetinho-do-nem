// Conta da mesa sem fechar: ver a conta, dividir entre as pessoas e receber de cada uma.
// Cada recebimento fica gravado na mesa (mesas/<n>.pagamentos, com o nome de quem pagou) e
// entra no caixa ao encerrar. A divisão é toda automática:
// - Igual para todos: o que falta dividido entre quem ainda não pagou;
// - Pelo que cada um pediu: soma os itens de cada nome (o cliente põe o nome ao pedir pelo
//   QR Code); o que não tem nome (lançado pelo garçom) é dividido igual entre todos.
import { useMemo, useState } from "react";
import { dividirIgual, falta as faltaDe, totalPago } from "../utils/conta";
import FormasPagamento, { moeda, numero, resolverPartes } from "./FormasPagamento";
import "./ContaParcial.css";

const c = (v) => Math.round(Number(v || 0) * 100);
const qtd = (i) => Number(i.qtd || i.quantidade || 0);
const donoDoItem = (i) => {
  const n = String(i.cliente || "").trim();
  return n && n.toLowerCase() !== "cliente" ? n : "";
};

export default function ContaParcial({ mesa, itens, itensPorPessoa, total, naoSalvo = 0, pagamentos = [], taxas, podeImprimir, onImprimir, onReceber, onTirar, onFechar }) {
  // Quem já pagou (pelo nome gravado no pagamento): volta assim quando a tela abre de novo.
  const quemJaPagou = useMemo(() => [...new Set(pagamentos.map((p) => String(p.quem || "").trim()).filter(Boolean))], [pagamentos]);
  // Quem pediu pelo QR Code (o nome vai em cada item).
  // Itens como foram pedidos (sem juntar pelo nome), para saber de quem é cada um.
  const brutos = itensPorPessoa || itens;
  const nomesDosPedidos = useMemo(() => [...new Set(brutos.map(donoDoItem).filter(Boolean))], [brutos]);
  const temPorPedido = nomesDosPedidos.length > 0;
  const [aba, setAba] = useState(quemJaPagou.length ? "dividir" : "conta"); // conta | dividir
  const [modo, setModo] = useState(nomesDosPedidos.length >= 2 ? "pedido" : "igual"); // igual | pedido
  const [pessoas, setPessoas] = useState(Math.max(2, quemJaPagou.length));
  const [nomes, setNomes] = useState(() => Object.fromEntries(quemJaPagou.map((n, i) => [i, /^Pessoa \d+$/.test(n) ? "" : n])));
  const [receber, setReceber] = useState(null); // { valor, quem, partes }
  const [salvando, setSalvando] = useState(false);
  const [desfazer, setDesfazer] = useState(null);
  const [msg, setMsg] = useState("");

  const pago = totalPago(pagamentos);
  const falta = faltaDe(total, pagamentos);
  const nomeDe = (i) => nomes[i]?.trim() || `Pessoa ${i + 1}`;
  const pagosDe = (nome) => pagamentos.filter((p) => String(p.quem || "").trim() === nome);

  // Igual para todos: quem ainda não pagou divide o que falta, em partes iguais.
  const linhas = Array.from({ length: pessoas }, (_, i) => {
    const nome = nomeDe(i);
    const pagos = pagosDe(nome);
    return { i, nome, pagos, pago: totalPago(pagos) };
  });
  const pendentes = linhas.filter((l) => l.pago === 0);
  const partesIguais = dividirIgual(falta, Math.max(1, pendentes.length));
  const valorIgual = (l) => partesIguais[pendentes.indexOf(l)] || 0;

  // Pelo que cada um pediu: itens de cada nome + parte igual do que não tem nome.
  const porPedido = useMemo(() => {
    if (!nomesDosPedidos.length) return { linhas: [], semNome: 0 };
    const consumo = Object.fromEntries(nomesDosPedidos.map((n) => [n, { cents: 0, itens: {} }]));
    let semNome = 0;
    brutos.forEach((it) => {
      const v = c(Number(it.preco || 0) * qtd(it));
      const dono = donoDoItem(it);
      if (dono && consumo[dono]) {
        consumo[dono].cents += v;
        consumo[dono].itens[it.nome] = (consumo[dono].itens[it.nome] || 0) + qtd(it);
      } else semNome += v;
    });
    const parteSemNome = dividirIgual(semNome / 100, nomesDosPedidos.length);
    return {
      semNome: semNome / 100,
      linhas: nomesDosPedidos.map((nome, k) => {
        const pagos = pagosDe(nome);
        const pago = totalPago(pagos);
        const deve = (consumo[nome].cents + c(parteSemNome[k])) / 100;
        return {
          nome,
          pagos,
          pago,
          deve,
          resta: Math.max(0, (c(deve) - c(pago)) / 100),
          resumo: Object.entries(consumo[nome].itens).map(([n, q]) => `${q}× ${n}`).join(", "),
        };
      }),
    };
    // pagosDe depende de pagamentos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brutos, nomesDosPedidos, pagamentos]);

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
            {temPorPedido && (
              <div className="cp-modos" role="radiogroup" aria-label="Como dividir">
                <button type="button" role="radio" aria-checked={modo === "pedido"} className={modo === "pedido" ? "ativo" : ""} onClick={() => setModo("pedido")}>Pelo que cada um pediu</button>
                <button type="button" role="radio" aria-checked={modo === "igual"} className={modo === "igual" ? "ativo" : ""} onClick={() => setModo("igual")}>Igual para todos</button>
              </div>
            )}

            {modo === "pedido" && temPorPedido ? (
              <>
                <p className="cp-dica">
                  Calculado pelos pedidos feitos no QR Code de cada um.
                  {porPedido.semNome > 0 && ` Os itens lançados sem nome (R$ ${moeda(porPedido.semNome)}) foram divididos igual entre todos.`}
                </p>
                <ul className="cp-divisao">
                  {porPedido.linhas.map((l) => (
                    <li key={l.nome} className={l.resta === 0 ? "pagou" : ""}>
                      <div className="cp-quem">
                        <b>{l.nome}</b>
                        <small>{l.resumo || "Só a parte dos itens sem nome"}</small>
                      </div>
                      {l.resta === 0 ? (
                        <span className="cp-pagou">✓ Pagou R$ {moeda(l.pago)} <small>({textoFormas(l.pagos)})</small></span>
                      ) : (
                        <>
                          <span className="cp-valor-pessoa">
                            R$ {moeda(l.resta)}
                            {l.pago > 0 && <small>já pagou R$ {moeda(l.pago)}</small>}
                          </span>
                          <button type="button" className="cp-btn verde mini" disabled={falta <= 0} onClick={() => abrirReceber(l.resta, l.nome)}>
                            Receber
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <div className="cp-pessoas">
                  <span>Dividir entre</span>
                  <button type="button" aria-label="Menos uma pessoa" onClick={() => setPessoas((n) => Math.max(Math.max(2, linhas.filter((l) => l.pago > 0).length), n - 1))}>−</button>
                  <b aria-label="Pessoas">{pessoas}</b>
                  <button type="button" aria-label="Mais uma pessoa" onClick={() => setPessoas((n) => Math.min(30, n + 1))}>+</button>
                  <span>pessoas</span>
                </div>
                <ul className="cp-divisao">
                  {linhas.map((l) => (
                    <li key={l.i} className={l.pago > 0 ? "pagou" : ""}>
                      <input
                        className="cp-nome"
                        value={nomes[l.i] || ""}
                        placeholder={`Pessoa ${l.i + 1}`}
                        disabled={l.pago > 0}
                        onChange={(e) => setNomes({ ...nomes, [l.i]: e.target.value })}
                        aria-label={`Nome da pessoa ${l.i + 1} (opcional)`}
                      />
                      {l.pago > 0 ? (
                        <span className="cp-pagou">✓ Pagou R$ {moeda(l.pago)} <small>({textoFormas(l.pagos)})</small></span>
                      ) : (
                        <>
                          <span className="cp-valor-pessoa">R$ {moeda(valorIgual(l))}</span>
                          <button type="button" className="cp-btn verde mini" disabled={falta <= 0 || valorIgual(l) <= 0} onClick={() => abrirReceber(valorIgual(l), l.nome)}>
                            Receber
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
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
              <button type="button" className="cp-btn verde" disabled={salvando} onClick={confirmarReceber}>{salvando ? <><span className="girando" aria-hidden="true" />Salvando…</> : "Confirmar recebido"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
