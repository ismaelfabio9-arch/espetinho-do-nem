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
import "../../styles/Garcom/RelatorioCompleto.css";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R = (v) => (v < 0 ? `− R$ ${fmt(-v)}` : `R$ ${fmt(v)}`);
const hora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
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

  const somaV = (l) => l.reduce((s, o) => s + Number(o.valor || 0), 0);

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
        <p className="rc-vazio">Carregando…</p>
      ) : (
        <>
          <div className="rc-kpi">
            <div><span>Vendido</span><b>{R(rel.f.vendas)}</b></div>
            <div><span>Lucro estimado</span><b className={rel.f.lucro < 0 ? "rc-neg" : ""}>{R(rel.f.lucro)}</b></div>
            <div><span>Pedidos</span><b>{rel.f.pedidos}</b></div>
            <div><span>Ticket médio</span><b>{R(rel.f.ticket)}</b></div>
          </div>
          <div className="rc-grade">
            <section className="rc-card">
              <h3>Vendas</h3>
              <Ln a="Mesa" b={R(rel.porTipo.mesa)} />
              <Ln a="Balcão" b={R(rel.porTipo.balcao)} />
              <Ln a="Entrega" b={R(rel.porTipo.entrega)} />
              {rel.f.formas.map((x) => <Ln key={x.nome} a={x.nome} b={R(x.valor)} sub />)}
              <Ln a="Taxas da maquininha" b={R(-rel.f.maquininha)} />
            </section>

            <section className="rc-card">
              <h3>Mais vendidos</h3>
              {rel.f.produtos.length === 0 ? <p className="rc-vazio">Nenhuma venda.</p> : [...rel.f.produtos].sort((a, b) => b.qtd - a.qtd).slice(0, 8).map((p) => (
                <Ln key={p.nome} a={p.nome} b={<>{p.qtd} <small>{R(p.vendido)}</small></>} />
              ))}
            </section>

            <section className="rc-card">
              <h3>Gaveta e dinheiro</h3>
              {rel.gaveta.caixas === 0 ? <p className="rc-vazio">Caixa não aberto no período.</p> : (
                <>
                  <Ln a="Abriu com" b={R(rel.gaveta.inicial)} />
                  <Ln a={`Sangria da gaveta (${rel.gaveta.nSangrias})`} b={R(-rel.gaveta.sangriaGaveta)} />
                  {rel.gaveta.sangriaPix > 0 && <Ln a="Tirado do Pix" b={R(-rel.gaveta.sangriaPix)} />}
                  {rel.gaveta.sangriaMaq > 0 && <Ln a="Tirado da maquininha" b={R(-rel.gaveta.sangriaMaq)} />}
                  <Ln a={`Reforço (${rel.gaveta.nReforcos})`} b={`+ ${R(rel.gaveta.reforcos)}`} />
                  {rel.gaveta.fechados > 0 ? (
                    <>
                      <Ln a="Contado no fechamento" b={<>{R(rel.gaveta.contado)} <small>{rel.gaveta.diferenca === 0 ? "bateu" : `diferença ${R(rel.gaveta.diferenca)}`}</small></>} />
                      <Ln a="Dona tirou" b={R(rel.gaveta.tirou)} />
                      <Ln a="Foi para o caixa da loja" b={R(rel.gaveta.paraCaixa)} />
                      <Ln a="Ficou na gaveta" b={R(rel.gaveta.ficou)} />
                    </>
                  ) : (
                    <Ln a="Fechamento" b="caixa ainda aberto" />
                  )}
                </>
              )}
            </section>

            <section className="rc-card">
              <h3>Custos e lucro</h3>
              <Ln a="Custo dos pratos vendidos" b={R(rel.f.custoProdutos)} />
              <Ln a="Despesas lançadas" b={R(rel.f.variaveis + rel.f.fixas)} />
              <Ln a="Saída de alimento" b={R(rel.saidas.total)} />
              <Ln a="Lucro estimado" b={R(rel.f.lucro)} total />
            </section>

            {rel.fornecedores.length > 0 && (
              <section className="rc-card">
                <h3>Compras por fornecedor</h3>
                {rel.fornecedores.map((x) => <Ln key={x.nome} a={x.nome} b={R(x.valor)} />)}
                <Ln a="Total de compras" b={R(rel.fornecedores.reduce((t, x) => t + x.valor, 0))} total />
              </section>
            )}

            <section className="rc-card">
              <h3>Comida</h3>
              {rel.saidas.lista.length === 0 ? <Ln a="Saída de alimento" b="nada" /> : rel.saidas.lista.slice(0, 8).map((s) => (
                <Ln key={s.id} a={`${s.descricoes.join(" + ") || s.itens.map((i) => i.nome).join(", ")} · ${String(s.motivo || "").split(" · ")[0].toLowerCase()}`} b={R(s.valor)} />
              ))}
              <Ln a="Acabou" b={rel.acabou.length ? rel.acabou.map((a) => `${a.texto} ${new Date(a.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`).join(" · ") : "nada"} />
              {rel.maisGasto.length > 0 && <Ln a="Mais gasto" b={rel.maisGasto.slice(0, 3).map((g) => `${g.nome} ${kg(g.qtd, g.u)}`).join(" · ")} />}
            </section>

            <section className="rc-card">
              <h3>O que foi mexido</h3>
              <Ln a="Itens tirados da comanda" b={<>{rel.mexido.tirou.length} <small>{R(somaV(rel.mexido.tirou))}</small></>} />
              <Ln a="Saiu diferente (cliente ficou)" b={String(rel.mexido.saiu.length)} />
              <Ln a="Cortesias" b={<>{rel.mexido.cortesia.length} <small>{R(somaV(rel.mexido.cortesia))}</small></>} />
              {rel.mexido.cancelou.length > 0 && <Ln a="Pedidos cancelados" b={<>{rel.mexido.cancelou.length} <small>{R(somaV(rel.mexido.cancelou))}</small></>} />}
            </section>
          </div>

          {(rel.gaveta.movimentos.length > 0 || rel.mexido.tirou.length + rel.mexido.saiu.length > 0) && (
            <section className="rc-card rc-detalhe">
              <h3>Detalhe</h3>
              {rel.gaveta.movimentos.map((m) => (
                <Ln key={m.id} a={`${hora(m.em)} · ${m.tipo === "sangria" ? `Sangria${m.origem && m.origem !== "Dinheiro" ? ` (${m.origem})` : ""}` : "Reforço"} · ${m.motivo || ""}`} b={`${m.tipo === "sangria" ? "−" : "+"} ${R(m.valor)}`} />
              ))}
              {[...rel.mexido.tirou, ...rel.mexido.saiu, ...rel.mexido.cortesia].sort((a, b) => String(b.em).localeCompare(String(a.em))).map((o) => (
                <Ln key={o.id} a={`${hora(o.em)} · ${o.tipo === "saiuDiferente" ? "Saiu diferente" : o.tipo === "cortesia" ? "Cortesia" : "Tirou"} · ${o.texto}${o.mesa ? ` · mesa ${o.mesa}` : ""}${o.motivo ? ` · ${o.motivo}` : ""}`} b={o.tipo === "saiuDiferente" ? "" : R(o.valor)} />
              ))}
            </section>
          )}

          <div className="rc-bt no-print">
            <button type="button" className="v" onClick={() => window.print()}>Imprimir</button>
          </div>
        </>
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
