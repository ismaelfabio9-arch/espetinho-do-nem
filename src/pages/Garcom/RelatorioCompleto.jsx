// Relatório gerencial completo (função "dinheiro-completo"): tudo o que a dona precisa saber do período —
// vendas, mais vendidos, gaveta e dinheiro, custos e lucro, comida (saída de alimento, o que acabou, o que mais
// saiu do estoque) e o que foi mexido nas comandas. Hoje, ontem, 7 dias, mês ou as datas que escolher.
import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { L } from "../../loja";
import useNomeLoja from "../../hooks/useNomeLoja";
import { useTaxas } from "../../utils/taxas";
import { calcularFinancas, isoDia, juntarVendas, periodo, tipoDe } from "../../utils/financas";
import { custoDaFicha } from "../../utils/insumos";
import { resumoSaidas } from "../../utils/perdas";
import { useOcorrencias } from "../../utils/ocorrencias";
import { tipoVenda } from "../../utils/tipoVenda";
import { useCaixaLoja } from "../../utils/caixaLoja";
import "../../styles/Garcom/RelatorioCompleto.css";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R = (v) => (v < 0 ? `− R$ ${fmt(-v)}` : `R$ ${fmt(v)}`);
const kg = (q, u) => (u === "un" ? `${Math.round(q)} un` : q < 1 ? `${Math.round(q * 1000)} ${u === "L" ? "ml" : "g"}` : `${String(Math.round(q * 10) / 10).replace(".", ",")} ${u === "L" ? "L" : "kg"}`);

function useCol(fazer, deps) {
  const [lista, setLista] = useState(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onSnapshot(fazer(), (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLista([])), deps);
  return lista;
}

const PERIODOS = [
  { id: "hoje", nome: "Hoje" },
  { id: "ontem", nome: "Ontem" },
  { id: "7dias", nome: "7 dias" },
  { id: "mes", nome: "Mês" },
  { id: "escolher", nome: "Escolher" },
];

function faixaDe(id) {
  if (id === "ontem") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return { de: isoDia(d), ate: isoDia(d) };
  }
  return periodo(id === "escolher" ? "hoje" : id);
}

export default function RelatorioCompleto() {
  const nomeLoja = useNomeLoja();
  const taxas = useTaxas();
  const [per, setPer] = useState("hoje");
  const [faixa, setFaixa] = useState(() => faixaDe("hoje"));
  const inicioISO = `${faixa.de}T00:00:00`;
  const dias = useCol(() => collection(db, ...L(), "relatorioGerencial"), []);
  const hoje = useCol(() => collection(db, ...L(), "vendasDia"), []);
  const produtos = useCol(() => collection(db, ...L(), "produtos"), []);
  const custosDocs = useCol(() => collection(db, ...L(), "custos"), []);
  const fichas = useCol(() => collection(db, ...L(), "fichas"), []);
  const insumos = useCol(() => collection(db, ...L(), "insumos"), []);
  const lancamentos = useCol(() => collection(db, ...L(), "despesas"), []);
  const caixas = useCol(() => query(collection(db, ...L(), "caixas"), orderBy("abertoEm", "desc"), limit(120)), []);
  const caixaMov = useCol(() => query(collection(db, ...L(), "caixaMov"), where("em", ">=", new Date(new Date(inicioISO).getTime() - 864e5).toISOString())), [inicioISO]);
  const movs = useCol(() => query(collection(db, ...L(), "insumosMov"), where("em", ">=", new Date(new Date(inicioISO).getTime() - 864e5).toISOString())), [inicioISO]);
  const ocorrencias = useOcorrencias(faixa.de, faixa.ate);
  const caixaMes = useCaixaLoja();

  const custos = useMemo(() => {
    const m = {};
    (custosDocs || []).forEach((c) => {
      if (typeof c.custo === "number") m[c.id] = c.custo;
    });
    const porId = Object.fromEntries((insumos || []).map((i) => [i.id, i]));
    (fichas || []).forEach((fi) => {
      const c = custoDaFicha(fi, porId);
      if (c !== null) m[fi.id] = c;
    });
    return m;
  }, [custosDocs, fichas, insumos]);

  const carregando = [dias, hoje, produtos, custosDocs, fichas, insumos, lancamentos, caixas, caixaMov, movs, ocorrencias].some((x) => x === null);

  const rel = useMemo(() => {
    if (carregando) return null;
    const { de, ate } = faixa;
    const dentro = (d) => d >= de && d <= ate;
    const saidas = resumoSaidas(movs, de, ate);
    const vendas = juntarVendas(dias, hoje);
    const f = calcularFinancas({ vendas, produtos, custos, lancamentos, taxas, de, ate, perdas: saidas.total });
    const doPeriodo = vendas.filter((v) => dentro(v.dia));
    const porTipo = { mesa: 0, balcao: 0, entrega: 0 };
    doPeriodo.forEach((v) => (porTipo[tipoVenda(v)] += Number(v.total || 0)));
    // Gaveta: caixas abertos no período.
    const cxs = (caixas || []).filter((c) => dentro(isoDia(new Date(c.abertoEm))));
    const meus = (caixaMov || []).filter((m) => cxs.some((c) => c.id === m.caixaId));
    const soma = (l) => Math.round(l.reduce((s, m) => s + Number(m.valor || 0), 0) * 100) / 100;
    const sangrias = meus.filter((m) => m.tipo === "sangria");
    const fechados = cxs.filter((c) => c.status === "fechado");
    const gaveta = {
      caixas: cxs.length,
      fechados: fechados.length,
      inicial: cxs.length ? Number(cxs[cxs.length - 1].valorInicial || 0) : 0,
      sangriaGaveta: soma(sangrias.filter((m) => (m.origem || "Dinheiro") === "Dinheiro")),
      sangriaPix: soma(sangrias.filter((m) => m.origem === "Pix")),
      sangriaMaq: soma(sangrias.filter((m) => m.origem === "Maquininha")),
      nSangrias: sangrias.length,
      reforcos: soma(meus.filter((m) => m.tipo === "suprimento")),
      nReforcos: meus.filter((m) => m.tipo === "suprimento").length,
      contado: fechados.reduce((s, c) => s + Number(c.contado || 0), 0),
      diferenca: Math.round(fechados.reduce((s, c) => s + Number(c.diferenca || 0), 0) * 100) / 100,
      tirou: Math.round(fechados.reduce((s, c) => s + Number(c.donaTirou ?? c.retiradoNoFechamento ?? 0), 0) * 100) / 100,
      paraCaixa: Math.round(fechados.reduce((s, c) => s + Number(c.paraCaixaLoja || 0), 0) * 100) / 100,
      ficou: fechados.length ? Number(fechados[0].ficouNaGaveta ?? Math.max(0, Number(fechados[0].contado || 0) - Number(fechados[0].retiradoNoFechamento || 0))) : 0,
      movimentos: meus.sort((a, b) => String(b.em).localeCompare(String(a.em))),
    };
    // O que mais saiu do estoque nas vendas.
    const unid = Object.fromEntries((insumos || []).map((i) => [i.id, i.unidade]));
    const gasto = {};
    (movs || []).forEach((m) => {
      if (m.tipo !== "venda" || !m.em || !dentro(isoDia(new Date(m.em)))) return;
      gasto[m.insumoId || m.nome] = gasto[m.insumoId || m.nome] || { nome: m.nome, qtd: 0, u: unid[m.insumoId] || "kg" };
      gasto[m.insumoId || m.nome].qtd += Math.abs(Number(m.qtd || 0));
    });
    // Compras por fornecedor no período.
    const porForn = {};
    (lancamentos || []).forEach((d) => {
      if (tipoDe(d.tipo).grupo !== "compra" || !dentro(String(d.data || ""))) return;
      const n = d.fornecedor || "Sem fornecedor";
      porForn[n] = (porForn[n] || 0) + Number(d.valor || 0);
    });
    const fornecedores = Object.entries(porForn).map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 })).sort((a, b) => b.valor - a.valor);
    const oc = ocorrencias || [];
    const de_ = (t) => oc.filter((o) => o.tipo === t);
    return {
      f,
      porTipo,
      gaveta,
      saidas,
      fornecedores,
      maisGasto: Object.values(gasto).sort((a, b) => b.qtd - a.qtd).slice(0, 6),
      acabou: de_("acabou"),
      mexido: { tirou: de_("tirou"), saiu: de_("saiuDiferente"), cortesia: de_("cortesia"), cancelou: de_("cancelou") },
    };
  }, [carregando, faixa, movs, dias, hoje, produtos, custos, lancamentos, taxas, caixas, caixaMov, insumos, ocorrencias]);

  function escolher(id) {
    setPer(id);
    if (id !== "escolher") setFaixa(faixaDe(id));
  }


  return (
    <div className="container rc">
      <div className="rc-topo">
        <div>
          <h1>Relatório gerencial</h1>
          <small>{nomeLoja}{faixa.de === faixa.ate ? ` · ${faixa.de.split("-").reverse().join("/")}` : ` · ${faixa.de.split("-").reverse().join("/")} a ${faixa.ate.split("-").reverse().join("/")}`}</small>
        </div>
      </div>
      <div className="rc-per no-print">
        {PERIODOS.map((p) => (
          <button key={p.id} type="button" className={per === p.id ? "on" : ""} onClick={() => escolher(p.id)}>{p.nome}</button>
        ))}
      </div>
      {per === "escolher" && (
        <div className="rc-datas no-print">
          <label>De<input type="date" value={faixa.de} onChange={(e) => setFaixa({ ...faixa, de: e.target.value })} /></label>
          <label>Até<input type="date" value={faixa.ate} onChange={(e) => setFaixa({ ...faixa, ate: e.target.value })} /></label>
        </div>
      )}

      {!rel ? (
        <p className="rc-vazio"><span className="if-carrega" aria-hidden="true"><i /></span>Carregando…</p>
      ) : (
        (() => {
          const f = rel.f;
          const g = rel.gaveta;
          const somaV = (l) => l.reduce((t, o) => t + Number(o.valor || 0), 0);
          const mesLista = (caixaMes?.lista || []).filter((m) => m.dia >= faixa.de && m.dia <= faixa.ate);
          const somaMes = (fn) => mesLista.filter(fn).reduce((t, m) => t + Number(m.valor || 0), 0);
          const entrouMes = somaMes((m) => m.tipo !== "saida");
          const saiuMes = somaMes((m) => m.tipo === "saida");
          const despesas = f.variaveis + f.fixas;
          const atencao = [
            rel.mexido.tirou.length > 0 && { a: "Itens tirados da comanda", b: `${rel.mexido.tirou.length} · ${R(somaV(rel.mexido.tirou))}` },
            rel.mexido.saiu.length > 0 && { a: "Saiu diferente (cliente ficou)", b: String(rel.mexido.saiu.length) },
            rel.mexido.cortesia.length > 0 && { a: "Cortesias", b: `${rel.mexido.cortesia.length} · ${R(somaV(rel.mexido.cortesia))}` },
            rel.mexido.cancelou.length > 0 && { a: "Pedidos cancelados", b: `${rel.mexido.cancelou.length} · ${R(somaV(rel.mexido.cancelou))}` },
            g.fechados > 0 && g.diferenca !== 0 && { a: g.diferenca < 0 ? "Faltou na gaveta" : "Sobrou na gaveta", b: R(Math.abs(g.diferenca)) },
          ].filter(Boolean);
          const temComida = rel.saidas.lista.length > 0 || rel.acabou.length > 0 || rel.maisGasto.length > 0;
          // Cada acontecimento: tipo (em negrito), o que foi, o motivo e o valor (+ entrou, − saiu).
          const textoTroca = (t) => String(t || "").replace(/pediu —, saiu /, "acrescentou ").replace(/, saiu —$/, "");
          const detalhe = [
            ...g.movimentos.map((m) => ({ id: `g${m.id}`, em: m.em, tipo: m.tipo === "sangria" ? `Sangria do caixa do dia${m.origem && m.origem !== "Dinheiro" ? ` (${m.origem})` : ""}` : "Reforço no caixa do dia", txt: "", motivo: m.motivo, v: m.tipo === "sangria" ? -Number(m.valor || 0) : Number(m.valor || 0) })),
            ...mesLista.map((m) => ({ id: `l${m.id}`, em: m.em, tipo: m.origem === "fechamento" ? "Caixa do mês · do fechamento" : m.tipo === "saida" ? (m.origem === "pagamento" ? "Pago com o caixa do mês" : "Sangria do caixa do mês") : "Reforço no caixa do mês", txt: m.origem === "pagamento" ? m.motivo : "", motivo: m.origem === "pagamento" || m.origem === "fechamento" ? "" : m.motivo, v: m.tipo === "saida" ? -Number(m.valor || 0) : Number(m.valor || 0) })),
            ...[...rel.mexido.tirou, ...rel.mexido.saiu, ...rel.mexido.cortesia].map((o) => ({ id: `o${o.id}`, em: o.em, tipo: o.tipo === "saiuDiferente" ? "Saiu diferente" : o.tipo === "cortesia" ? "Cortesia" : "Tirou da comanda", txt: `${o.tipo === "saiuDiferente" ? textoTroca(o.texto) : o.texto}`, mesa: o.mesa, motivo: o.motivo, v: o.tipo === "saiuDiferente" ? null : -Number(o.valor || 0) })),
          ].sort((x, y) => String(y.em).localeCompare(String(x.em)));
          const porDia = [];
          detalhe.forEach((x) => {
            const d = new Date(x.em).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
            const g2 = porDia[porDia.length - 1];
            if (g2 && g2.dia === d) g2.itens.push(x);
            else porDia.push({ dia: d, itens: [x] });
          });
          return (
            <>
              <div className="rc-kpi">
                <div><span>Vendido</span><b>{R(f.vendas)}</b></div>
                <div><span>Lucro</span><b className={f.lucro < 0 ? "rc-neg" : "rc-pos"}>{R(f.lucro)}</b></div>
                <div><span>Pedidos</span><b>{f.pedidos}</b></div>
                <div><span>Ticket médio</span><b>{R(f.ticket)}</b></div>
              </div>

              <div className="rc-grade2">
                <section className="rc-card">
                  <h3>Vendas</h3>
                  <div className="rc-duas">
                    <div>
                      <h4>Por onde</h4>
                      {[["Mesa", rel.porTipo.mesa], ["Balcão", rel.porTipo.balcao], ["Entrega", rel.porTipo.entrega]].filter(([, v]) => v > 0).map(([n, v]) => <Ln key={n} a={n} b={R(v)} />)}
                    </div>
                    <div>
                      <h4>Como pagaram</h4>
                      {f.formas.filter((x) => x.valor > 0).map((x) => <Ln key={x.nome} a={x.nome} b={R(x.valor)} />)}
                    </div>
                  </div>
                </section>

                <section className="rc-card">
                  <h3>Lucro</h3>
                  <Ln a="Vendido" b={R(f.vendas)} />
                  <Ln a="Custo dos pratos" b={R(-f.custoProdutos)} />
                  {f.maquininha > 0 && <Ln a="Taxa da maquininha" b={R(-f.maquininha)} />}
                  {despesas > 0 && <Ln a="Despesas" b={R(-despesas)} />}
                  {rel.saidas.total > 0 && <Ln a="Perda de alimento" b={R(-rel.saidas.total)} />}
                  <Ln a="Lucro" b={R(f.lucro)} total />
                  {f.margem !== null && <small className="rc-nota">{f.margem}% do que vendeu</small>}
                </section>
              </div>

              <section className="rc-card rc-dinheiro">
                <h3>Dinheiro</h3>
                <div className="rc-tres">
                  <div>
                    <h4>Caixa do dia</h4>
                    {g.caixas === 0 ? <p className="rc-vazio">Não abriu no período.</p> : (
                      <>
                        <Ln a="Abriu com" b={R(g.inicial)} />
                        {g.reforcos > 0 && <Ln a="Reforço" b={`+ ${R(g.reforcos)}`} />}
                        {g.sangriaGaveta > 0 && <Ln a="Sangria" b={R(-g.sangriaGaveta)} />}
                        {g.sangriaPix > 0 && <Ln a="Tirado do Pix" b={R(-g.sangriaPix)} />}
                        {g.sangriaMaq > 0 && <Ln a="Tirado da maquininha" b={R(-g.sangriaMaq)} />}
                        {g.fechados > 0 ? <Ln a="Ficou na gaveta" b={R(g.ficou)} total /> : <Ln a="Fechamento" b="caixa aberto" total />}
                      </>
                    )}
                  </div>
                  <div>
                    <h4>Caixa do mês</h4>
                    {entrouMes > 0 && <Ln a="Entrou" b={`+ ${R(entrouMes)}`} />}
                    {saiuMes > 0 && <Ln a="Saiu" b={R(-saiuMes)} />}
                    <Ln a="Tem agora" b={R(caixaMes?.saldo || 0)} total />
                  </div>
                  <div>
                    <h4>Dona</h4>
                    <Ln a="Tirou para ela" b={R(g.tirou)} total />
                  </div>
                </div>
              </section>

              <div className="rc-grade2">
                <section className="rc-card">
                  <h3>Mais vendidos</h3>
                  {f.produtos.length === 0 ? <p className="rc-vazio">Nenhuma venda.</p> : [...f.produtos].sort((x, y) => y.qtd - x.qtd).slice(0, 5).map((p, k) => (
                    <Ln key={p.nome} a={`${k + 1}. ${p.nome}`} b={<>{p.qtd}× <small>{R(p.vendido)}</small></>} />
                  ))}
                </section>

                <section className="rc-card">
                  <h3>Comida</h3>
                  {!temComida ? <p className="rc-vazio">Sem perda e nada acabou.</p> : (
                    <>
                      {rel.saidas.lista.slice(0, 5).map((x) => (
                        <Ln key={x.id} a={`${x.descricoes.join(" + ") || x.itens.map((i) => i.nome).join(", ")} · ${String(x.motivo || "").split(" · ")[0].toLowerCase()}`} b={R(x.valor)} />
                      ))}
                      {rel.acabou.length > 0 && <Ln a="Acabou" b={rel.acabou.map((o) => o.texto).join(", ")} />}
                      {rel.maisGasto.length > 0 && <Ln a="Mais usado" b={rel.maisGasto.slice(0, 3).map((x) => `${x.nome} ${kg(x.qtd, x.u)}`).join(" · ")} />}
                    </>
                  )}
                </section>
              </div>

              {(atencao.length > 0 || rel.fornecedores.length > 0) && (
                <div className="rc-grade2">
                  {atencao.length > 0 && (
                    <section className="rc-card rc-atencao">
                      <h3>Atenção</h3>
                      {atencao.map((x) => <Ln key={x.a} a={x.a} b={x.b} />)}
                    </section>
                  )}
                  {rel.fornecedores.length > 0 && (
                    <section className="rc-card">
                      <h3>Compras por fornecedor</h3>
                      {rel.fornecedores.map((x) => <Ln key={x.nome} a={x.nome} b={R(x.valor)} />)}
                    </section>
                  )}
                </div>
              )}

              {detalhe.length > 0 && (
                <details className="rc-card rc-detalhe">
                  <summary>Tudo o que aconteceu ({detalhe.length})</summary>
                  {porDia.map((d) => (
                    <div key={d.dia} className="rc-ac-dia">
                      <div className="rc-ac-dt">{d.dia}</div>
                      {d.itens.map((x) => (
                        <div key={x.id} className="rc-ac">
                          <span className="rc-ac-h">{new Date(x.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                          <span className="rc-ac-c">
                            <b>{x.tipo}{x.mesa ? <small> · mesa {x.mesa}</small> : null}</b>
                            {x.txt && <span>{x.txt}</span>}
                            {x.motivo && <em>{x.motivo}</em>}
                          </span>
                          <span className={`rc-ac-v${x.v === null ? "" : x.v < 0 ? " neg" : " pos"}`}>{x.v === null ? "" : `${x.v < 0 ? "−" : "+"} ${R(Math.abs(x.v))}`}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </details>
              )}

              <div className="rc-bt no-print">
                <button type="button" className="v" onClick={() => window.print()}>Imprimir</button>
              </div>
            </>
          );
        })()
      )}
    </div>
  );
}

function Ln({ a, b, total, sub }) {
  return (
    <div className={`rc-ln${total ? " t" : ""}${sub ? " sub" : ""}`}>
      <span>{a}</span>
      <span>{b}</span>
    </div>
  );
}

/** Relatório → Lucro por produto: cada categoria com o que vendeu e quanto sobrou; toca para ver os produtos. */
export function LucroPorProduto() {
  const taxas = useTaxas();
  const [per, setPer] = useState("mes");
  const [faixa, setFaixa] = useState(() => faixaDe("mes"));
  const [aberta, setAberta] = useState(null);
  const dias = useCol(() => collection(db, ...L(), "relatorioGerencial"), []);
  const hoje = useCol(() => collection(db, ...L(), "vendasDia"), []);
  const produtos = useCol(() => collection(db, ...L(), "produtos"), []);
  const custosDocs = useCol(() => collection(db, ...L(), "custos"), []);
  const fichas = useCol(() => collection(db, ...L(), "fichas"), []);
  const insumos = useCol(() => collection(db, ...L(), "insumos"), []);
  const carregando = [dias, hoje, produtos, custosDocs, fichas, insumos].some((x) => x === null);
  const f = useMemo(() => {
    if (carregando) return null;
    const m = {};
    (custosDocs || []).forEach((c) => {
      if (typeof c.custo === "number") m[c.id] = c.custo;
    });
    const porId = Object.fromEntries((insumos || []).map((i) => [i.id, i]));
    (fichas || []).forEach((fi) => {
      const c = custoDaFicha(fi, porId);
      if (c !== null) m[fi.id] = c;
    });
    return calcularFinancas({ vendas: juntarVendas(dias, hoje), produtos, custos: m, lancamentos: [], taxas, de: faixa.de, ate: faixa.ate });
  }, [carregando, dias, hoje, produtos, custosDocs, fichas, insumos, taxas, faixa]);
  const escolher = (id) => {
    setPer(id);
    if (id !== "escolher") setFaixa(faixaDe(id));
  };
  const cats = f ? [...f.categorias].sort((a, b) => b.vendido - a.vendido) : [];
  return (
    <div className="container rc rel-parte">
      <div className="rc-per no-print">
        {PERIODOS.map((p) => (
          <button key={p.id} type="button" className={per === p.id ? "on" : ""} onClick={() => escolher(p.id)}>{p.nome}</button>
        ))}
      </div>
      {per === "escolher" && (
        <div className="rc-datas no-print">
          <label>De<input type="date" value={faixa.de} onChange={(e) => setFaixa({ ...faixa, de: e.target.value })} /></label>
          <label>Até<input type="date" value={faixa.ate} onChange={(e) => setFaixa({ ...faixa, ate: e.target.value })} /></label>
        </div>
      )}
      {!f ? (
        <p className="rc-vazio"><span className="if-carrega" aria-hidden="true"><i /></span>Carregando…</p>
      ) : (
        <>
          <div className="rc-kpi">
            <div><span>Vendido</span><b>{R(f.vendas)}</b></div>
            <div><span>Custo dos pratos</span><b>{R(f.custoProdutos)}</b></div>
            <div><span>Sobrou</span><b className={f.lucroBruto < 0 ? "rc-neg" : "rc-pos"}>{R(f.lucroBruto)}</b></div>
            <div><span>Margem</span><b>{f.margemBruta === null ? "–" : `${f.margemBruta}%`}</b></div>
          </div>
          {f.semCusto > 0 && (
            <p className="rc-aviso">{f.semCusto} {f.semCusto === 1 ? "produto vendido está" : "produtos vendidos estão"} sem custo: o que sobrou aparece maior. <a href="#/cardapio?aba=preco">Pôr os custos</a></p>
          )}
          {cats.length === 0 ? (
            <p className="rc-vazio">Nenhuma venda no período.</p>
          ) : (
            <div className="rc-cats">
              {cats.map((c) => {
                const prods = f.produtos.filter((p) => p.categoria === c.nome).sort((a, b) => b.vendido - a.vendido);
                const on = aberta === c.nome;
                return (
                  <section key={c.nome} className="rc-card rc-cat">
                    <button type="button" className="rc-cat-topo" onClick={() => setAberta(on ? null : c.nome)} aria-expanded={on}>
                      <span className="rc-cat-nome">{on ? "▾" : "▸"} {c.nome}</span>
                      <span className="rc-cat-num">
                        <b>{R(c.vendido)}</b>
                        <small className={c.lucro < 0 ? "rc-neg" : ""}>sobrou {R(c.lucro)}{c.margem !== null ? ` · ${c.margem}%` : ""}</small>
                      </span>
                    </button>
                    {on && (
                      <div className="rc-prods">
                        {prods.map((p) => (
                          <div key={p.nome} className="rc-prod">
                            <span>{p.nome} <small>{p.qtd}×</small></span>
                            <span>{R(p.vendido)}</span>
                            <span className={p.lucro !== null && p.lucro < 0 ? "rc-neg" : ""}>{p.lucro === null ? <small>sem custo</small> : R(p.lucro)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
