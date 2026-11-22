// Caixa (gaveta de dinheiro): abre com o troco, registra sangria (tirou dinheiro da gaveta) e
// suprimento (colocou troco), e fecha conferindo o dinheiro contado com o que deveria ter.
//
// - caixas/<id>: { status: "aberto" | "fechado", abertoEm, abertoPor, valorInicial,
//   fechadoEm?, fechadoPor?, contado?, esperado?, diferenca?, resumo?, obs? }
// - caixaMov/<id>: { caixaId, tipo: "sangria" | "suprimento", valor, motivo, em, por }
// Vendas do caixa: as finalizadas entre a abertura e o fechamento (vendasDia + dias encerrados).
// Só "Dinheiro" mexe na gaveta; Pix e cartão aparecem para conferir com o banco e a maquininha.

import { partesDaVenda } from "./conta";
const r2 = (v) => Math.round(v * 100) / 100;
export const FORMAS_CAIXA = ["Dinheiro", "Pix", "Débito", "Crédito"];

/** Vendas finalizadas dentro do caixa (ISO de abertura e, se fechado, de fechamento). */
export function vendasDoCaixa(caixa, diasFechados, vendasHoje) {
  const de = String(caixa?.abertoEm || "");
  const ate = caixa?.fechadoEm ? String(caixa.fechadoEm) : null;
  const todas = [...(diasFechados || []).flatMap((d) => d.vendasDia || []), ...(vendasHoje || [])];
  const vistas = new Set();
  return todas.filter((v) => {
    const em = String(v.finalizadoEm || "");
    if (!em || em < de || (ate && em > ate)) return false;
    // A mesma venda pode estar no dia aberto e no encerrado por um instante: conta uma vez.
    const chave = `${em}|${v.total}|${v.titulo || ""}|${v.mesa || ""}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

/** Taxa da maquininha da venda: a % gravada nela ou, sem isso, a % de hoje da forma (débito/crédito). */
function pctMaquininha(v, taxas) {
  if (typeof v.taxaCartaoPct === "number" && v.taxaCartaoPct > 0) return v.taxaCartaoPct;
  if (v.formaPagamento === "Débito") return Number(taxas?.debito || 0);
  if (v.formaPagamento === "Crédito") return Number(taxas?.credito || 0);
  return 0;
}

/**
 * Quanto TEM QUE TER em cada lugar:
 * - Dinheiro (gaveta) = troco inicial + vendas em dinheiro + suprimentos − sangrias
 * - Pix = vendas no Pix (o que tem que ter entrado no banco)
 * - Débito / Crédito = o que passou na maquininha (com a taxa que o cliente pagou junto) e
 *   quanto cai na conta depois da taxa da maquininha
 */
export function resumoCaixa(caixa, vendas, movs, taxas) {
  const porForma = {};
  const maq = {};
  let total = 0;
  let semForma = 0;
  (vendas || []).forEach((v) => {
    // Conta paga em partes (Pix + Dinheiro…): cada parte na sua forma (utils/conta.js).
    partesDaVenda(v).forEach((p) => {
      porForma[p.forma] = (porForma[p.forma] || 0) + p.valor;
      maq[p.forma] = (maq[p.forma] || 0) + (p.valor * pctMaquininha({ formaPagamento: p.forma, taxaCartaoPct: p.taxaCartaoPct }, taxas)) / 100;
      total += p.valor;
      if (p.forma === "Não informado") semForma += 1;
    });
  });
  const meus = (movs || []).filter((m) => m.caixaId === caixa?.id);
  const suprimentos = r2(meus.filter((m) => m.tipo === "suprimento").reduce((s, m) => s + Number(m.valor || 0), 0));
  const sangrias = r2(meus.filter((m) => m.tipo === "sangria").reduce((s, m) => s + Number(m.valor || 0), 0));
  const inicial = Number(caixa?.valorInicial || 0);
  const dinheiro = r2(porForma.Dinheiro || 0);
  const gaveta = r2(inicial + dinheiro + suprimentos - sangrias);
  const formas = [...FORMAS_CAIXA, ...Object.keys(porForma).filter((f) => !FORMAS_CAIXA.includes(f))]
    .filter((f) => porForma[f] || FORMAS_CAIXA.includes(f))
    .map((f) => {
      const vendido = r2(porForma[f] || 0);
      const taxa = r2(maq[f] || 0);
      return {
        nome: f,
        valor: vendido,
        vendido,
        taxa,
        caiNaConta: r2(vendido - taxa),
        // O que tem que conferir: gaveta no dinheiro; nas outras, o que passou (Pix no banco, cartão na maquininha).
        temQueTer: f === "Dinheiro" ? gaveta : vendido,
        onde: f === "Dinheiro" ? "na gaveta" : f === "Pix" ? "no banco" : f === "Débito" || f === "Crédito" ? "na maquininha" : "",
      };
    });
  return {
    pedidos: (vendas || []).length,
    total: r2(total),
    formas,
    semForma,
    inicial: r2(inicial),
    dinheiro,
    suprimentos,
    sangrias,
    esperado: gaveta,
    caiNaConta: r2(formas.filter((f) => f.nome !== "Dinheiro").reduce((s, f) => s + f.caiNaConta, 0)),
    movimentos: meus.sort((a, b) => String(a.em).localeCompare(String(b.em))),
  };
}
