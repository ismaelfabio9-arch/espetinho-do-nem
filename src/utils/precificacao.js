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

/**
 * Percentuais finais a partir do que foi salvo em configuracoes/precificacao (Preço certo) e do automático
 * Nada é automático: campo em branco = 0 (o sistema não inventa número); em "valor" = R$ do mês ÷ vendas do mês
 * informadas pelo dono; lucro em valor = R$ por venda.
 */
/** Quanto os ingredientes podem pesar no preço, em % (Só os ingredientes). Restaurante costuma ficar entre 25% e 35%. */
export const PESO_INGREDIENTES_PADRAO = 30;
export const pesoIngredientes = (salvo) => {
  const v = Number(salvo?.pesoIngredientes);
  return v > 0 && v < 100 ? v : PESO_INGREDIENTES_PADRAO;
};

export function percentuaisFinais(salvo = {}) {
  const vendasMes = typeof salvo.vendasMes === "number" && salvo.vendasMes > 0 ? salvo.vendasMes : null;
  const campo = (k) => {
    const v = salvo[k];
    if (typeof v !== "number") return 0;
    if (salvo[`${k}Modo`] === "valor") return pctDoMes(v, vendasMes) ?? 0;
    return v;
  };
  // O lucro vem do quanto o dono quer tirar para ele no mês (R$ ÷ vendas do mês). O lucro antigo
  // (% ou R$ por venda, salvo antes) não vale mais.
  const meta = typeof salvo.meta === "number" && salvo.meta > 0 ? salvo.meta : 0;
  // "Só os ingredientes": maquininha, despesas e impostos não entram (lucro = preço − ingredientes).
  const so = salvo.conta === "ingredientes";
  // O dono diz quanto os ingredientes podem pesar no preço (padrão 30%); o resto (100% − isso) é
  // o que fica para pagar a loja e o lucro.
  if (so)
    return { maquininha: 0, fixas: 0, variaveis: 0, impostos: 0, lucro: 100 - pesoIngredientes(salvo), lucroValor: 0, soIngredientes: true };
  return {
    maquininha: typeof salvo.maquininha === "number" ? salvo.maquininha : 0,
    fixas: campo("fixas"),
    variaveis: campo("variaveis"),
    impostos: campo("impostos"),
    lucro: meta ? pctDoMes(meta, vendasMes) ?? 0 : 0,
    lucroValor: 0,
  };
}

// ============================================================================================
// Preço certo (conta completa) — modelo por CONTRIBUIÇÃO, sem margem igual para todos:
//   por produto:  contribuição por unidade = preço − custo − preço × (maquininha% + impostos% + variáveis%)
//                 margem real = contribuição ÷ preço   (despesa fixa e retirada do dono NÃO entram aqui)
//   no mês:       faturamento = Σ preço × quantidade;  margem de contribuição = Σ contribuição × quantidade
//                 resultado = margem de contribuição − despesas do mês (descontadas uma vez só)
//                 a meta de retirada é comparada com esse resultado.
// Quantidade = previsão do dono (por dia × dias que abre no mês). Nada é inventado: o que falta é avisado.
// ============================================================================================

const modo = (salvo, k) => (salvo?.[`${k}Modo`] === "valor" ? "valor" : "pct");
const numOuNull = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** % que sai junto com cada venda: maquininha + impostos em % + despesas variáveis em %. */
export function pctPorVenda(salvo = {}) {
  let t = numOuNull(salvo.maquininha) || 0;
  if (modo(salvo, "impostos") === "pct") t += numOuNull(salvo.impostos) || 0;
  if (modo(salvo, "variaveis") === "pct") t += numOuNull(salvo.variaveis) || 0;
  return t;
}

/** Contribuição de 1 unidade (R$) e a margem real (%). null quando falta o custo ou o preço. */
export function contribuicaoDe(custo, preco, pct) {
  const p = Number(preco || 0);
  if (typeof custo !== "number" || !(p > 0)) return null;
  const contrib = r2(p - custo - (p * Number(pct || 0)) / 100);
  return { contrib, margem: r1((contrib / p) * 100) };
}

/**
 * O que as contas do mês (fixas + variáveis + impostos em R$) pesam em cada venda: contas ÷ o que a loja vende
 * no mês (um número só, que o dono informa). Despesa em % entra direto. null quando falta o "vende por mês".
 */
export function pctDasContas(salvo = {}) {
  const v = (k) => numOuNull(salvo[k]) || 0;
  const emReais = (modo(salvo, "fixas") === "valor" ? v("fixas") : 0) + (modo(salvo, "variaveis") === "valor" ? v("variaveis") : 0) + (modo(salvo, "impostos") === "valor" ? v("impostos") : 0);
  const emPct = modo(salvo, "fixas") === "pct" ? v("fixas") : 0;
  const vendas = numOuNull(salvo.vendasMes);
  if (emReais > 0 && !(vendas > 0)) return { pct: null, contasMes: r2(emReais), vendasMes: null, emPct };
  return { pct: r1((vendas > 0 ? (emReais / vendas) * 100 : 0) + emPct), contasMes: r2(emReais), vendasMes: vendas > 0 ? vendas : null, emPct };
}

/**
 * A conta de 1 produto, depois de tudo (estimativa):
 *   preço − ingredientes (com a embalagem) − maquininha e impostos da venda − parte das contas do mês = lucro.
 * As contas não são descontadas duas vezes: a parte de cada venda, somada no mês, dá as contas do mês.
 */
export function contaDoProduto(custo, preco, salvo = {}) {
  const p = Number(preco || 0);
  if (typeof custo !== "number" || !(p > 0)) return null;
  const pv = pctPorVenda(salvo);
  const contas = pctDasContas(salvo);
  const taxas = r2((p * pv) / 100);
  const parteContas = contas.pct === null ? null : r2((p * contas.pct) / 100);
  const lucro = r2(p - custo - taxas - (parteContas || 0));
  const den = 1 - (pv + (contas.pct || 0)) / 100;
  return {
    preco: p, custo: r2(custo), taxas, pv, parteContas, pctContas: contas.pct, lucro,
    margem: r1((lucro / p) * 100),
    // Abaixo deste preço o produto dá prejuízo (não paga os ingredientes, as taxas e a parte das contas).
    minimo: den > 0 ? r2(custo / den) : null,
    faltaVendas: contas.pct === null,
  };
}
