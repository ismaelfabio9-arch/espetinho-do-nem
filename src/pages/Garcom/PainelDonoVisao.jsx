// Painel do Dono (várias lojas): a tela, sem buscar nada. Recebe as lojas com as vendas e mostra o
// total, a comparação com o período anterior, o que está aberto agora, cada loja, o gráfico, como
// pagaram e os mais vendidos. PainelDono.jsx busca os dados e cuida do login.
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
const ddmm = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

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

function Seta({ pct, antes }) {
  if (pct === 0 || pct === undefined) return <span className="pd-var neutro">igual a {antes}</span>;
  if (pct === null) return <span className="pd-var sobe">primeiras vendas</span>;
  return <span className={pct > 0 ? "pd-var sobe" : "pd-var desce"}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct)}% vs {antes}</span>;
}

export default function PainelDonoVisao({ lojas, periodo, setPeriodo, email, atualizadoEm, onAtualizar, onPdf, onSair, agora = new Date() }) {
  const [aberta, setAberta] = useState(null);
  const p = PERIODOS.find((x) => x.id === periodo) || PERIODOS[0];

  const d = useMemo(() => {
    const { ini, fim, aIni, aFim, dias } = intervalos(periodo, agora);
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
    // Gráfico: por hora (1 dia) ou por dia (o resto), uma cor para cada loja.
    let barras;
    if (dias === 1) {
      const horas = Array.from({ length: 24 }, (_, h) => ({ rotulo: `${h}h`, partes: porLoja.map(() => 0) }));
      porLoja.forEach((l, i) => l.vendas.forEach((v) => {
        const h = v.finalizadoEm ? new Date(v.finalizadoEm).getHours() : null;
        if (h !== null && !Number.isNaN(h)) horas[h].partes[i] += Number(v.total || 0);
      }));
      const usadas = horas.map((x, h) => (x.partes.some((y) => y > 0) ? h : null)).filter((h) => h !== null);
      const de = usadas.length ? Math.min(...usadas, 10) : 10;
      const ate = usadas.length ? Math.max(...usadas, 22) : 22;
      barras = horas.slice(de, ate + 1);
    } else {
      barras = Array.from({ length: dias }, (_, k) => {
        const dia = new Date(ini.getTime() + k * DIA);
        return { rotulo: dias <= 7 ? SEMANA[dia.getDay()] : ddmm(dia), dica: ddmm(dia), partes: porLoja.map((l) => entre(l.todas, dia, new Date(dia.getTime() + DIA)).reduce((s, v) => s + Number(v.total || 0), 0)) };
      });
    }
    const maiorBarra = Math.max(1, ...barras.map((b) => b.partes.reduce((s, x) => s + x, 0)));
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
    return { porLoja, ranking, total, totalAntes, pag, barras, maiorBarra, produtos, dias };
  }, [lojas, periodo, agora]);

  const t = d.total;
  const somaPag = Object.values(d.pag).reduce((s, x) => s + x, 0);
  const abertosTotal = d.porLoja.reduce((s, l) => s + l.abertos.length, 0);
  const emAbertoTotal = d.porLoja.reduce((s, l) => s + l.emAberto, 0);
  const maiorProd = Math.max(1, ...d.produtos.slice(0, 10).map((x) => x.total));

  return (
    <div className="pd">
      <header className="pd-topo">
        <div>
          <span className="pd-sobre">Painel do Dono · {d.porLoja.length} lojas</span>
          <h1>Suas lojas</h1>
          <small>{email}{atualizadoEm ? ` · atualizado às ${atualizadoEm}` : ""}</small>
        </div>
        <div className="pd-acoes no-print">
          <button type="button" onClick={onAtualizar}>Atualizar</button>
          <button type="button" onClick={onPdf}>PDF</button>
          <button type="button" className="sair" onClick={onSair}>Sair</button>
        </div>
      </header>

      <div className="pd-periodos no-print" role="tablist" aria-label="Período">
        {PERIODOS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={periodo === x.id} className={periodo === x.id ? "on" : ""} onClick={() => setPeriodo(x.id)}>{x.rotulo}</button>
        ))}
      </div>

      <section className="pd-hero">
        <span>Faturamento · {p.rotulo.toLowerCase()}</span>
        <strong>R$ {moeda(t.total)}</strong>
        <Seta pct={variacao(t.total, d.totalAntes.total)} antes={p.antes} />
        {t.total > 0 && (
          <>
            <div className="pd-divisao" aria-hidden="true">
              {d.porLoja.map((l) => l.r.total > 0 && <i key={l.id} style={{ flex: l.r.total, background: l.cor }} />)}
            </div>
            <div className="pd-legenda">
              {d.porLoja.map((l) => (
                <span key={l.id}><i style={{ background: l.cor }} />{l.nome} {Math.round((l.r.total / t.total) * 100)}%</span>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="pd-kpis">
        <div><span>Pedidos</span><b>{t.pedidos}</b><Seta pct={variacao(t.pedidos, d.totalAntes.pedidos)} antes={p.antes} /></div>
        <div><span>Ticket médio</span><b>R$ {moeda(t.ticket)}</b><Seta pct={variacao(t.ticket, d.totalAntes.ticket)} antes={p.antes} /></div>
        <div><span>Itens vendidos</span><b>{t.itens}</b></div>
        <div><span>Taxas de entrega</span><b>R$ {moeda(t.taxaEntrega)}</b></div>
      </div>

      {periodo === "hoje" && (
        <section className="pd-bloco">
          <h2>Agora nas lojas <small>{abertosTotal ? `${abertosTotal} em aberto · R$ ${moeda(emAbertoTotal)}` : "nenhum pedido em aberto"}</small></h2>
          <div className="pd-agora">
            {d.porLoja.map((l) => {
              const mesas = l.abertos.filter((x) => x.mesa != null && x.origem !== "viagem" && x.origem !== "entrega").length;
              return (
                <div key={l.id} className="pd-agora-loja">
                  <span className={l.abertos.length ? "pd-ponto on" : "pd-ponto"} />
                  <div>
                    <b>{l.nome}</b>
                    <small>{l.abertos.length ? `${mesas} ${mesas === 1 ? "mesa" : "mesas"} · ${l.abertos.length - mesas} balcão/entrega` : "sem pedidos abertos"}</small>
                  </div>
                  <strong>{l.abertos.length ? `R$ ${moeda(l.emAberto)}` : "—"}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="pd-bloco">
        <h2>Cada loja</h2>
        <div className="pd-lojas">
          {d.ranking.map((l, pos) => {
            const pct = variacao(l.r.total, l.ra.total);
            const share = t.total > 0 ? (l.r.total / t.total) * 100 : 0;
            const aberto = aberta === l.id;
            return (
              <article key={l.id} className="pd-loja">
                <button type="button" className="pd-loja-topo" onClick={() => setAberta(aberto ? null : l.id)} aria-expanded={aberto}>
                  <span className="pd-pos" style={{ background: l.cor }}>{pos + 1}</span>
                  <span className="pd-loja-nome">
                    <b>{l.nome}</b>
                    <small>{l.r.pedidos} pedidos · ticket R$ {moeda(l.r.ticket)}</small>
                  </span>
                  <span className="pd-loja-valor">
                    <b>R$ {moeda(l.r.total)}</b>
                    <Seta pct={pct} antes={p.antes} />
                  </span>
                </button>
                <div className="pd-barra"><i style={{ width: `${share}%`, background: l.cor }} /></div>
                <div className="pd-tipos">
                  {TIPOS_VENDA.map((tp) => <span key={tp.id}>{tp.nome} <b>R$ {moeda(l.tipos[tp.id])}</b></span>)}
                </div>
                {aberto && (
                  <div className="pd-loja-corpo">
                    <h3>Mais vendidos</h3>
                    {l.r.produtos.length === 0 ? <p className="pd-vazio">Sem vendas no período.</p> : l.r.produtos.slice(0, 6).map((x) => (
                      <div key={x.nome} className="pd-linha"><span>{x.qtd}x {x.nome}</span><b>R$ {moeda(x.total)}</b></div>
                    ))}
                    <h3>Como pagaram</h3>
                    {Object.keys(l.pag).length === 0 ? <p className="pd-vazio">—</p> : Object.entries(l.pag).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                      <div key={k} className="pd-linha"><span>{k}</span><b>R$ {moeda(v)}</b></div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="pd-bloco">
        <h2>{d.dias === 1 ? "Vendas por hora" : "Vendas por dia"}</h2>
        <div className="pd-grafico" role="img" aria-label={d.dias === 1 ? "Vendas por hora" : "Vendas por dia"}>
          {d.barras.map((b, k) => {
            const soma = b.partes.reduce((s, x) => s + x, 0);
            return (
              <div key={k} className="pd-col" title={`${b.dica || b.rotulo}: R$ ${moeda(soma)}`}>
                <div className="pd-pilha" style={{ height: `${(soma / d.maiorBarra) * 100}%` }}>
                  {b.partes.map((x, i) => x > 0 && <i key={i} style={{ flex: x, background: d.porLoja[i].cor }} />)}
                </div>
                <span>{d.barras.length > 16 && k % 3 !== 0 ? "" : b.rotulo}</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="pd-duas">
        <section className="pd-bloco">
          <h2>Como pagaram</h2>
          {somaPag === 0 ? <p className="pd-vazio">Sem vendas no período.</p> : Object.entries(d.pag).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div key={k} className="pd-pag">
              <span>{k}</span>
              <div className="pd-barra"><i style={{ width: `${(v / somaPag) * 100}%` }} /></div>
              <b>R$ {moeda(v)}</b>
              <small>{Math.round((v / somaPag) * 100)}%</small>
            </div>
          ))}
        </section>

        <section className="pd-bloco">
          <h2>Mais vendidos nas lojas</h2>
          {d.produtos.length === 0 ? <p className="pd-vazio">Sem vendas no período.</p> : d.produtos.slice(0, 10).map((x) => (
            <div key={x.nome} className="pd-prod">
              <div className="pd-prod-topo"><span>{x.qtd}x {x.nome}</span><b>R$ {moeda(x.total)}</b></div>
              <div className="pd-divisao fina" style={{ width: `${(x.total / maiorProd) * 100}%` }}>
                {x.porLoja.map((q, i) => q > 0 && <i key={i} style={{ flex: q, background: d.porLoja[i].cor }} />)}
              </div>
            </div>
          ))}
        </section>
      </div>

      <p className="pd-rodape">Gerado em {agora.toLocaleString("pt-BR")} · Painel do Dono · IFTech</p>
    </div>
  );
}
