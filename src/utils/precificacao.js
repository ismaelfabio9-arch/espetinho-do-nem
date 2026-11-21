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

/** Soma dos percentuais que saem de cada venda (sem o custo do produto). Lucro em R$ não entra aqui. */
export const somaPct = (p) => Number(p.maquininha || 0) + Number(p.fixas || 0) + Number(p.variaveis || 0) + Number(p.impostos || 0) + (p.lucroValor ? 0 : Number(p.lucro || 0));

/**
 * Gasto do mês em R$ (aluguel R$ 3.000, MEI R$ 80…) virado em % das vendas do mês.
 * null quando não dá para saber (sem vendas no mês).
 */
export const pctDoMes = (valorMes, vendasMes) => (Number(vendasMes) > 0 ? r1((Number(valorMes || 0) / Number(vendasMes)) * 100) : null);

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
  // Lucro em R$ por venda (ex.: R$ 5 em cada prato) entra junto com o custo.
  const lucroValor = Number(p.lucroValor || 0);
  const ideal = r2((custo + lucroValor) / (1 - total));
  const sugerido = precoBonito(ideal);
  const pctGastos = somaPct(p) - (p.lucroValor ? 0 : Number(p.lucro || 0));
  // Com o preço de hoje: quanto sobra de verdade em cada venda depois de tudo.
  const gastosNoPreco = (preco$ * pctGastos) / 100;
  const lucroReal = r2(preco$ - custo - gastosNoPreco);
  // A conta em degraus, do preço até o lucro limpo (o que confundia era mostrar só o último número).
  const degraus = (valor) => {
    const v = Number(valor || 0);
    const taxas = (v * (Number(p.maquininha || 0) + Number(p.variaveis || 0) + Number(p.impostos || 0))) / 100;
    const fixas = (v * Number(p.fixas || 0)) / 100;
    const depoisCusto = v - custo;
    const depoisTaxas = depoisCusto - taxas;
    return {
      preco: r2(v),
      custo: r2(custo),
      depoisCusto: r2(depoisCusto),
      taxas: r2(taxas),
      maquininha: r2((v * Number(p.maquininha || 0)) / 100),
      variaveis: r2((v * Number(p.variaveis || 0)) / 100),
      impostos: r2((v * Number(p.impostos || 0)) / 100),
      depoisTaxas: r2(depoisTaxas),
      fixas: r2(fixas),
      lucro: r2(depoisTaxas - fixas),
      pct: (x) => (v > 0 ? Math.round((x / v) * 100) : null),
    };
  };
  const partes = (valor) => {
    const d = degraus(valor);
    return [
      { nome: "Custo do produto", valor: d.custo },
      { nome: "Taxa da maquininha", valor: d.maquininha },
      { nome: "Despesas variáveis (entregador, embalagem…)", valor: d.variaveis },
      { nome: "Impostos", valor: d.impostos },
      { nome: "Parte das despesas fixas (aluguel, funcionários…)", valor: d.fixas },
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
    hoje: degraus(preco$),
    noSugerido: degraus(sugerido),
    lucroNoSugerido: r2(sugerido - custo - (sugerido * pctGastos) / 100),
  };
}
