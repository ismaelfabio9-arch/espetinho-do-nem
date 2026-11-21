// Preço certo (formação de preço): por quanto vender cada produto para cobrir o custo, as taxas, a parte
// das despesas da loja e ainda sobrar o lucro que o dono quer.
//
//   preço ideal = custo do produto ÷ (1 − (maquininha% + fixas% + variáveis% + impostos% + lucro%))
//
// - custo: ficha técnica (matéria-prima) ou o custo digitado em Finanças → Custos dos produtos.
// - maquininha%: o que a maquininha levou ÷ vendas (últimos 30 dias); sem vendas, a taxa do crédito.
// - fixas% e variáveis%: despesas do período ÷ vendas do período (quanto de cada R$ 1 vendido vai para elas).
// - impostos% e lucro%: o dono escolhe (configuracoes/precificacao, só a equipe lê).
// Cada percentual pode ser trocado à mão (por exemplo, loja nova ainda sem vendas).

const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

/** Percentuais vindos do movimento da loja (calcularFinancas de ~30 dias). */
export function percentuaisDaLoja(f, taxas) {
  const vendas = Number(f?.vendas || 0);
  if (vendas <= 0) return { maquininha: Number(taxas?.credito || 0), fixas: null, variaveis: null, vendas: 0 };
  return {
    maquininha: r1((Number(f.maquininha || 0) / vendas) * 100),
    fixas: r1((Number(f.fixas || 0) / vendas) * 100),
    variaveis: r1((Number(f.variaveis || 0) / vendas) * 100),
    vendas: r2(vendas),
  };
}

/** Soma dos percentuais que saem de cada venda (sem o custo do produto). */
export const somaPct = (p) => Number(p.maquininha || 0) + Number(p.fixas || 0) + Number(p.variaveis || 0) + Number(p.impostos || 0) + Number(p.lucro || 0);

/** Arredonda para cima no próximo ,90 (ou ,00 quando passa de R$ 100): R$ 23,14 → R$ 23,90. */
export function precoBonito(v) {
  if (!(v > 0)) return 0;
  if (v >= 100) return Math.ceil(v);
  const inteiro = Math.floor(v);
  return v <= inteiro + 0.9 + 1e-9 ? r2(inteiro + 0.9) : r2(inteiro + 1.9);
}

/**
 * Conta de um produto.
 * @returns { ideal, sugerido, lucroReal, margemReal, situacao: "bom" | "baixo" | "sem-custo" | "impossivel", partes }
 */
export function precoDoProduto(custo, preco, p) {
  const total = somaPct(p) / 100;
  const preco$ = Number(preco || 0);
  if (typeof custo !== "number") return { situacao: "sem-custo" };
  if (total >= 1) return { situacao: "impossivel" };
  const ideal = r2(custo / (1 - total));
  const sugerido = precoBonito(ideal);
  // Com o preço de hoje: quanto sobra de verdade em cada venda depois de tudo.
  const gastosNoPreco = (preco$ * (somaPct(p) - Number(p.lucro || 0))) / 100;
  const lucroReal = r2(preco$ - custo - gastosNoPreco);
  const partes = (valor) => {
    const v = Number(valor || 0);
    return [
      { nome: "Custo do produto", valor: r2(custo) },
      { nome: "Taxa da maquininha", valor: r2((v * Number(p.maquininha || 0)) / 100) },
      { nome: "Despesas fixas (aluguel, funcionários…)", valor: r2((v * Number(p.fixas || 0)) / 100) },
      { nome: "Despesas variáveis (entregador, embalagem…)", valor: r2((v * Number(p.variaveis || 0)) / 100) },
      { nome: "Impostos", valor: r2((v * Number(p.impostos || 0)) / 100) },
    ].filter((x) => x.valor > 0);
  };
  return {
    ideal,
    sugerido,
    lucroReal,
    margemReal: preco$ > 0 ? Math.round((lucroReal / preco$) * 100) : null,
    situacao: preco$ + 0.005 >= ideal ? "bom" : "baixo",
    partes: partes(preco$),
    partesIdeal: partes(sugerido),
    lucroNoSugerido: r2(sugerido - custo - (sugerido * (somaPct(p) - Number(p.lucro || 0))) / 100),
  };
}
