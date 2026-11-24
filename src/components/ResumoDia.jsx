// Resumo do dia (aparece ao encerrar o dia, na loja que liga "resumo-no-fechamento"): total vendido, pedidos,
// mesas, balcão, ticket médio, os mais vendidos e como pagaram. Imprimir, mandar no WhatsApp e fechar.
import { imprimir } from "../utils/print";
import { useConfigImpressora } from "../hooks/useConfigImpressora";
import "./ResumoDia.css";

const R = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nomeProduto = (item) => item.nomeBase || String(item.nome || "").split(" — ")[0];
const qtd = (i) => Number(i.qtd || i.quantidade || 0);

/** Monta o resumo a partir das vendas do dia (vendasDia). */
export function calcularResumoDia(vendas) {
  const total = vendas.reduce((s, v) => s + Number(v.total || 0), 0);
  const itens = vendas.reduce((s, v) => s + (Number(v.totalItens) || (v.itens || []).reduce((t, i) => t + qtd(i), 0)), 0);
  const mesas = vendas.filter((v) => v.origem === "mesa" || v.mesa).length;
  const produtos = {};
  vendas.forEach((v) =>
    (v.itens || []).forEach((i) => {
      const n = nomeProduto(i);
      produtos[n] = produtos[n] || { nome: n, qtd: 0, total: 0 };
      produtos[n].qtd += qtd(i);
      produtos[n].total += Number(i.preco || 0) * qtd(i);
    })
  );
  const formas = {};
  vendas.forEach((v) => {
    const lista = Array.isArray(v.pagamentos) && v.pagamentos.length ? v.pagamentos : [{ forma: v.formaPagamento || "Não informado", valor: Number(v.total || 0) }];
    lista.forEach((p) => {
      const f = p.forma || "Não informado";
      formas[f] = (formas[f] || 0) + Number(p.valor || 0);
    });
  });
  const horas = vendas.flatMap((v) => [v.abertaEm, v.finalizadoEm, v.fechadaEm].filter(Boolean)).map((h) => Date.parse(h)).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    data: new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }),
    de: horas.length ? new Date(horas[0]).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
    ate: horas.length ? new Date(horas[horas.length - 1]).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
    total: Math.round(total * 100) / 100,
    pedidos: vendas.length,
    itens,
    mesas,
    balcao: vendas.length - mesas,
    ticket: vendas.length ? Math.round((total / vendas.length) * 100) / 100 : 0,
    produtos: Object.values(produtos).sort((a, b) => b.total - a.total || b.qtd - a.qtd),
    formas: Object.entries(formas).map(([forma, valor]) => ({ forma, valor: Math.round(valor * 100) / 100 })).sort((a, b) => b.valor - a.valor),
  };
}

function textoResumo(r, loja) {
  return [
    `*Resumo do dia${loja ? ` · ${loja}` : ""}*`,
    `${r.data}${r.de ? ` · das ${r.de} às ${r.ate}` : ""}`,
    "",
    `Total vendido: *${R(r.total)}*`,
    `${r.pedidos} pedidos · ${r.itens} itens · ticket médio ${R(r.ticket)}`,
    `Mesas: ${r.mesas} · Balcão/viagem: ${r.balcao}`,
    "",
    "*Mais vendidos*",
    ...r.produtos.slice(0, 10).map((p, k) => `${k + 1}. ${p.nome}: ${p.qtd}× · ${R(p.total)}`),
    "",
    "*Como pagaram*",
    ...r.formas.map((f) => `${f.forma}: ${R(f.valor)}`),
  ].join("\n");
}

export default function ResumoDia({ resumo: r, loja = "", onFechar }) {
  const configImpressora = useConfigImpressora();
  const maior = Math.max(1, ...r.produtos.map((p) => p.total));
  function imprimirResumo() {
    const linhas = textoResumo(r, loja).replace(/\*/g, "").split("\n");
    const html = `<html><head><meta charset="utf-8"><style>body{font-family:monospace;font-size:13px;margin:0;padding:6px}div{white-space:pre-wrap}</style></head><body>${linhas.map((l) => `<div>${l.replace(/</g, "&lt;") || "&nbsp;"}</div>`).join("")}</body></html>`;
    imprimir(html, configImpressora?.larguraPapel || "58mm");
  }
  return (
    <div className="rd-fundo" role="dialog" aria-modal="true" aria-label="Resumo do dia">
      <div className="rd">
        <div className="rd-cab">
          <small>Dia encerrado · {r.data}{r.de ? ` · das ${r.de} às ${r.ate}` : ""}</small>
          <h1>📊 Resumo do dia</h1>
        </div>
        <div className="rd-card rd-big">
          <small>Total vendido</small>
          <b>{R(r.total)}</b>
          <span>{r.itens} {r.itens === 1 ? "item" : "itens"} em {r.pedidos} {r.pedidos === 1 ? "pedido" : "pedidos"}</span>
        </div>
        <div className="rd-tres">
          <div><small>Mesas atendidas</small><b>{r.mesas}</b></div>
          <div><small>Balcão / viagem</small><b>{r.balcao}</b></div>
          <div><small>Ticket médio</small><b>{R(r.ticket)}</b></div>
        </div>
        <div className="rd-card">
          <h3>🏆 Mais vendidos</h3>
          {r.produtos.length === 0 && <p className="rd-vazio">Nenhuma venda hoje.</p>}
          {r.produtos.slice(0, 15).map((p, k) => (
            <div key={p.nome} className="rd-lin">
              <span className="rd-n">{k + 1}</span>
              <div className="rd-nm">
                {p.nome}
                <div className="rd-bar"><i style={{ width: `${Math.max(3, (p.total / maior) * 100)}%` }} /></div>
              </div>
              <span className="rd-q">{p.qtd}×</span>
              <b>{R(p.total)}</b>
            </div>
          ))}
        </div>
        {r.formas.length > 0 && (
          <div className="rd-card">
            <h3>💳 Como pagaram</h3>
            {r.formas.map((f) => (
              <div key={f.forma} className="rd-fp"><span>{f.forma}</span><b>{R(f.valor)}</b></div>
            ))}
          </div>
        )}
        <div className="rd-bt">
          <button type="button" onClick={imprimirResumo}>🖨️ Imprimir</button>
          <a className="w" href={`https://wa.me/?text=${encodeURIComponent(textoResumo(r, loja))}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          <button type="button" className="v" onClick={onFechar}>OK, fechar</button>
        </div>
      </div>
    </div>
  );
}
