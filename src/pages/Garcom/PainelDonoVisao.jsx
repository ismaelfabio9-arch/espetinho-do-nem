// Painel do Dono (várias lojas): a tela, sem buscar nada. Visual de extrato: o total, a comparação com
// o período anterior, cada loja (toque para ver mais), o que está aberto agora, pagamentos e mais
// vendidos. PainelDono.jsx busca os dados e cuida do login.
import { useMemo, useState } from "react";
import "../../styles/Garcom/PainelDonoVisao.css";
import { TIPOS_VENDA, nomeProduto, qtdItem, resumir, tipoVenda } from "../../utils/tipoVenda";

/** 66.633,71 (com o ponto do milhar). */
const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const PERIODOS = [
  { id: "hoje", rotulo: "Hoje", antes: "ontem até esta hora" },
  { id: "ontem", rotulo: "Ontem", antes: "anteontem" },
  { id: "7", rotulo: "7 dias", antes: "7 dias antes" },
  { id: "30", rotulo: "30 dias", antes: "30 dias antes" },
  { id: "mes", rotulo: "Este mês", antes: "mês passado" },
];
export const CORES = ["#16a34a", "#2563eb", "#f59e0b", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"];

const DIA = 86400000;
const zero = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dataBR = (s) => { const [d, m, a] = String(s || "").split("/").map(Number); return a ? new Date(a, m - 1, d) : null; };

/** [início, fim) do período e do período anterior. */
function intervalos(periodo, agora = new Date()) {
  const hoje = zero(agora);
  const amanha = new Date(hoje.getTime() + DIA);
  if (periodo === "hoje") return { ini: hoje, fim: amanha, aIni: new Date(hoje - DIA), aFim: hoje, dias: 1 };
  if (periodo === "ontem") return { ini: new Date(hoje - DIA), fim: hoje, aIni: new Date(hoje - 2 * DIA), aFim: new Date(hoje - DIA), dias: 1 };
  if (periodo === "mes") {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const aIni = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const aFim = new Date(aIni.getTime() + (amanha - ini)); // mesmo pedaço do mês passado
    return { ini, fim: amanha, aIni, aFim, dias: Math.round((amanha - ini) / DIA) };
  }
  const n = Number(periodo);
  const ini = new Date(amanha - n * DIA);
  return { ini, fim: amanha, aIni: new Date(ini - n * DIA), aFim: ini, dias: n };
}

/** Cada venda da loja com o dia dela: os dias fechados (relatório) e o dia aberto (hoje). */
function vendasComDia(loja, hoje = zero(new Date())) {
  const out = [];
  (loja.dias || []).forEach((d) => {
    const dia = dataBR(d.data);
    if (dia) (d.vendasDia || []).forEach((v) => out.push({ v, dia }));
  });
  (loja.hoje || []).forEach((v) => out.push({ v, dia: hoje }));
  return out;
}
const entre = (lista, ini, fim) => lista.filter((x) => x.dia >= ini && x.dia < fim).map((x) => x.v);

/** Pix, Dinheiro, Cartão ou Outro (vale para a venda dividida em várias formas). */
function formas(v) {
  const partes = Array.isArray(v.pagamentos) && v.pagamentos.length ? v.pagamentos.map((p) => ({ forma: p.forma, valor: Number(p.valor || 0) })) : [{ forma: v.formaPagamento, valor: Number(v.total || 0) }];
  return partes.map((p) => {
    const f = String(p.forma || "").toLowerCase();
    const nome = f.includes("pix") ? "Pix" : f.includes("dinheiro") ? "Dinheiro" : /cr[eé]dito|d[eé]bito|cart/.test(f) ? "Cartão" : "Outro";
    return { nome, valor: p.valor };
  });
}

const variacao = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? null : 0);

function Comparacao({ pct, antes, curto }) {
  if (pct === null) return <span className="pd-pos">primeiras vendas</span>;
  if (!pct) return <span>{curto ? "igual" : `igual a ${antes}`}</span>;
  const txt = curto ? `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%` : `${Math.abs(pct)}% ${pct > 0 ? "acima" : "abaixo"} de ${antes}`;
  return <span className={pct > 0 ? "pd-pos" : "pd-neg"}>{txt}</span>;
}

export default function PainelDonoVisao({ lojas, periodo, setPeriodo, email, atualizadoEm, onAtualizar, onPdf, onSair, agora = new Date() }) {
  const [aberta, setAberta] = useState(null);
  const p = PERIODOS.find((x) => x.id === periodo) || PERIODOS[0];

  const d = useMemo(() => {
    const { ini, fim, aIni, aFim } = intervalos(periodo, agora);
    const hoje = zero(agora);
    const porLoja = lojas.map((l, i) => {
      const todas = vendasComDia(l, hoje);
      const vendas = entre(todas, ini, fim);
      // Hoje ainda não acabou: compara com ontem só até a mesma hora.
      const limite = agora.getHours() * 60 + agora.getMinutes();
      const ateEstaHora = (v) => { const f = v.finalizadoEm ? new Date(v.finalizadoEm) : null; return !f || Number.isNaN(f.getTime()) || f.getHours() * 60 + f.getMinutes() <= limite; };
      const antes = entre(todas, aIni, aFim).filter((v) => periodo !== "hoje" || ateEstaHora(v));
      const r = resumir(vendas);
      const ra = resumir(antes);
      const tipos = Object.fromEntries(TIPOS_VENDA.map((t) => [t.id, resumir(vendas.filter((v) => tipoVenda(v) === t.id)).total]));
      const pag = {};
      vendas.forEach((v) => formas(v).forEach((f) => (pag[f.nome] = (pag[f.nome] || 0) + f.valor)));
      const abertos = (l.abertos || []).filter((x) => (x.itens || []).length > 0);
      return { ...l, cor: CORES[i % CORES.length], todas, vendas, antes, r, ra, tipos, pag, abertos, emAberto: abertos.reduce((s, x) => s + Number(x.total || 0), 0) };
    });
    const vendas = porLoja.flatMap((l) => l.vendas);
    const total = resumir(vendas);
    const totalAntes = resumir(porLoja.flatMap((l) => l.antes));
    const pag = {};
    porLoja.forEach((l) => Object.entries(l.pag).forEach(([k, v]) => (pag[k] = (pag[k] || 0) + v)));
    // Mais vendidos em todas as lojas, com quanto cada loja vendeu.
    const prod = {};
    porLoja.forEach((l, i) => l.vendas.forEach((v) => (v.itens || []).forEach((it) => {
      const nome = nomeProduto(it);
      const q = qtdItem(it);
      if (!prod[nome]) prod[nome] = { nome, porLoja: porLoja.map(() => 0), qtd: 0, total: 0 };
      prod[nome].porLoja[i] += q;
      prod[nome].qtd += q;
      prod[nome].total += Number(it.preco || 0) * q;
    })));
    const produtos = Object.values(prod).sort((a, b) => b.total - a.total);
    const ranking = [...porLoja].sort((a, b) => b.r.total - a.r.total);
    return { porLoja, ranking, total, totalAntes, pag, produtos };
  }, [lojas, periodo, agora]);

  const t = d.total;
  const abertosTotal = d.porLoja.reduce((s, l) => s + l.abertos.length, 0);
  const emAbertoTotal = d.porLoja.reduce((s, l) => s + l.emAberto, 0);
  const pct = variacao(t.total, d.totalAntes.total);

  return (
    <div className="pd">
      <div className="pd-links no-print">
        <button type="button" onClick={onAtualizar}>Atualizar</button>
        <button type="button" onClick={onPdf}>PDF</button>
        <button type="button" className="sair" onClick={onSair}>Sair</button>
      </div>

      <p className="pd-titulo">Suas lojas · {p.rotulo.toLowerCase()}</p>
      <p className="pd-total">R$ {moeda(t.total)}</p>
      <p className="pd-sub">
        {t.pedidos} {t.pedidos === 1 ? "pedido" : "pedidos"} · ticket médio R$ {moeda(t.ticket)}
        {" · "}<Comparacao pct={pct} antes={p.antes} />
      </p>
      <p className="pd-quem">{email}{atualizadoEm ? ` · atualizado às ${atualizadoEm}` : ""}</p>

      <nav className="pd-abas no-print" aria-label="Período">
        {PERIODOS.map((x) => (
          <button key={x.id} type="button" aria-pressed={periodo === x.id} className={periodo === x.id ? "on" : ""} onClick={() => setPeriodo(x.id)}>{x.rotulo}</button>
        ))}
      </nav>

      <section className="pd-sec">
        <h2>Lojas</h2>
        {d.ranking.map((l) => {
          const aberto = aberta === l.id;
          return (
            <div key={l.id} className="pd-item">
              <button type="button" className="pd-row" onClick={() => setAberta(aberto ? null : l.id)} aria-expanded={aberto}>
                <span>
                  {l.nome}
                  <small>{l.r.pedidos} {l.r.pedidos === 1 ? "pedido" : "pedidos"} · ticket R$ {moeda(l.r.ticket)}{t.total > 0 ? ` · ${Math.round((l.r.total / t.total) * 100)}% do total` : ""}</small>
                </span>
                <span className="pd-dir">
                  <b>R$ {moeda(l.r.total)}</b>
                  <small><Comparacao pct={variacao(l.r.total, l.ra.total)} antes={p.antes} curto /></small>
                </span>
              </button>
              {aberto && (
                <div className="pd-detalhe">
                  <div className="pd-mini">
                    {TIPOS_VENDA.map((tp) => <span key={tp.id}>{tp.nome} <b>R$ {moeda(l.tipos[tp.id])}</b></span>)}
                  </div>
                  {l.r.produtos.length === 0 ? <p className="pd-vazio">Sem vendas no período.</p> : l.r.produtos.slice(0, 5).map((x) => (
                    <div key={x.nome} className="pd-linha"><span>{x.qtd}× {x.nome}</span><b>R$ {moeda(x.total)}</b></div>
                  ))}
                  {Object.entries(l.pag).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <div key={k} className="pd-linha suave"><span>{k}</span><b>R$ {moeda(v)}</b></div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {periodo === "hoje" && (
        <section className="pd-sec">
          <h2>Em aberto agora{abertosTotal ? ` · R$ ${moeda(emAbertoTotal)}` : ""}</h2>
          {abertosTotal === 0 ? <p className="pd-vazio">Nenhum pedido em aberto.</p> : d.porLoja.filter((l) => l.abertos.length).map((l) => {
            const mesas = l.abertos.filter((x) => x.mesa != null && x.origem !== "viagem" && x.origem !== "entrega").length;
            const outros = l.abertos.length - mesas;
            const partes = [mesas ? `${mesas} ${mesas === 1 ? "mesa" : "mesas"}` : "", outros ? `${outros} balcão/entrega` : ""].filter(Boolean).join(" · ");
            return (
              <div key={l.id} className="pd-row estatica">
                <span>{l.nome}<small>{partes}</small></span>
                <b>R$ {moeda(l.emAberto)}</b>
              </div>
            );
          })}
        </section>
      )}

      <div className="pd-grade">
        <section className="pd-sec">
          <h2>Pagamentos</h2>
          {Object.keys(d.pag).length === 0 ? <p className="pd-vazio">Sem vendas no período.</p> : Object.entries(d.pag).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} className="pd-row estatica"><span>{k}</span><b>R$ {moeda(v)}</b></div>
          ))}
        </section>
        <section className="pd-sec">
          <h2>Mais vendidos</h2>
          {d.produtos.length === 0 ? <p className="pd-vazio">Sem vendas no período.</p> : d.produtos.slice(0, 8).map((x) => (
            <div key={x.nome} className="pd-row estatica"><span>{x.qtd}× {x.nome}</span><b>R$ {moeda(x.total)}</b></div>
          ))}
        </section>
      </div>

      <p className="pd-rodape">Gerado em {agora.toLocaleString("pt-BR")} · Painel do Dono · IFTech</p>
    </div>
  );
}
