// Controle financeiro (plano Completo e Premium): o que entrou, o que saiu e o lucro, no geral e
// por categoria do cardápio (Almoço, Bebidas, Picolé, Hambúrguer…).
//
// De onde vem cada número:
// - Entrou: as vendas finalizadas (dias encerrados em relatorioGerencial + o dia aberto em vendasDia),
//   com a taxa de entrega e a taxa do cartão que o cliente pagou.
// - Taxas da maquininha: a % do débito/crédito sobre o que passou no cartão (a % gravada na venda
//   ou, nas vendas antigas, a % de hoje em Configurações → Taxas da maquininha).
// - Custo dos produtos: o custo de cada produto (custos/<produtoId>, só a equipe lê; o cardápio
//   do cliente nunca vê) × a quantidade vendida.
// - Despesas: lançadas pelo dono (despesas/<id>): insumos, aluguel, funcionários, contas, gerais.
//   Investimento (equipamento, reforma…) fica à parte: não entra no lucro do período.
import { nomeProduto, qtdItem } from "./tipoVenda";

export const TIPOS_DESPESA = [
  { id: "insumos", nome: "Comida e insumos", icone: "🥩" },
  { id: "bebidas", nome: "Bebidas para revenda", icone: "🥤" },
  { id: "aluguel", nome: "Aluguel", icone: "🏠" },
  { id: "funcionarios", nome: "Funcionários", icone: "👥" },
  { id: "contas", nome: "Água, luz, gás e internet", icone: "💡" },
  { id: "gerais", nome: "Despesas gerais", icone: "🧾" },
  { id: "investimento", nome: "Investimento", icone: "📈" },
];
export const nomeTipoDespesa = (id) => TIPOS_DESPESA.find((t) => t.id === id)?.nome || "Despesas gerais";
export const SEM_CATEGORIA_FIN = "Sem categoria";

const num = (v) => {
  const t = String(v ?? "").trim();
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
};
/** "12,50" ou "1.234,50" → 12.5 / 1234.5 (valor de dinheiro digitado). */
export const lerValor = (v) => Math.round(Math.max(0, num(v)) * 100) / 100;
const r2 = (v) => Math.round(v * 100) / 100;

/** AAAA-MM-DD no horário do aparelho. */
export const isoDia = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deBR = (s) => {
  const p = String(s || "").split("/");
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}` : null;
};

/** Dia (AAAA-MM-DD) de cada venda: a hora em que foi finalizada ou o dia do fechamento. */
export function diaDaVenda(venda, diaFechamento) {
  if (venda.finalizadoEm) {
    const d = new Date(venda.finalizadoEm);
    if (!Number.isNaN(d.getTime())) return isoDia(d);
  }
  return diaFechamento || isoDia();
}

/** Todas as vendas com o dia: dias encerrados (relatorioGerencial) + o dia aberto (vendasDia). */
export function juntarVendas(diasFechados, vendasHoje) {
  const out = [];
  (diasFechados || []).forEach((dia) => {
    const d = deBR(dia.data);
    (dia.vendasDia || []).forEach((v) => out.push({ ...v, dia: diaDaVenda(v, d) }));
  });
  (vendasHoje || []).forEach((v) => out.push({ ...v, dia: diaDaVenda(v, isoDia()) }));
  return out;
}

/** Períodos rápidos: { de, ate } em AAAA-MM-DD. */
export function periodo(chave, hoje = new Date()) {
  const d = (y, m, dd) => isoDia(new Date(y, m, dd));
  const y = hoje.getFullYear(), m = hoje.getMonth(), dd = hoje.getDate();
  if (chave === "hoje") return { de: d(y, m, dd), ate: d(y, m, dd) };
  if (chave === "7dias") return { de: d(y, m, dd - 6), ate: d(y, m, dd) };
  if (chave === "mes") return { de: d(y, m, 1), ate: d(y, m + 1, 0) };
  if (chave === "mesPassado") return { de: d(y, m - 1, 1), ate: d(y, m, 0) };
  return { de: d(y, 0, 1), ate: d(y, 11, 31) };
}

function taxaPctDaVenda(v, taxas) {
  if (typeof v.taxaCartaoPct === "number" && v.taxaCartaoPct > 0) return v.taxaCartaoPct;
  if (v.formaPagamento === "Débito") return Number(taxas?.debito || 0);
  if (v.formaPagamento === "Crédito") return Number(taxas?.credito || 0);
  return 0;
}

/**
 * Conta tudo do período.
 * @param vendas  juntarVendas(...)
 * @param produtos lista de produtos ({ id, nome, categoria })
 * @param custos  { [produtoId]: número }
 * @param despesas lista ({ data: AAAA-MM-DD, valor, tipo, categoria? })
 * @param taxas   lerTaxas(...) da loja
 */
export function calcularFinancas({ vendas, produtos, custos, despesas, taxas, de, ate }) {
  const dentro = (dia) => (!de || dia >= de) && (!ate || dia <= ate);
  const porId = new Map((produtos || []).map((p) => [p.id, p]));
  const porNome = new Map((produtos || []).map((p) => [String(p.nome || "").trim().toLowerCase(), p]));
  const acharProduto = (item) => porId.get(item.produtoId) || porNome.get(nomeProduto(item).trim().toLowerCase()) || null;

  const cats = {};
  const prods = {};
  const formas = {};
  const cat = (nome) => (cats[nome] = cats[nome] || { nome, vendido: 0, custo: 0, qtd: 0, semCusto: 0, despesas: 0 });

  let entrou = 0, taxaEntrega = 0, taxaCartaoCliente = 0, maquininha = 0, pedidos = 0;
  (vendas || []).filter((v) => dentro(v.dia)).forEach((v) => {
    pedidos += 1;
    const total = Number(v.total || 0);
    const taxaCli = Number(v.taxaCartao || 0);
    entrou += total + taxaCli;
    taxaEntrega += Number(v.taxaEntrega || 0);
    taxaCartaoCliente += taxaCli;
    maquininha += ((total + taxaCli) * taxaPctDaVenda(v, taxas)) / 100;
    const forma = v.formaPagamento || "Não informado";
    formas[forma] = r2((formas[forma] || 0) + total + taxaCli);
    (v.itens || []).forEach((item) => {
      const q = qtdItem(item);
      const valor = Number(item.preco || 0) * q;
      const p = acharProduto(item);
      const nomeCat = (p?.categoria && String(p.categoria).trim()) || SEM_CATEGORIA_FIN;
      const custoUn = p && typeof custos?.[p.id] === "number" ? custos[p.id] : null;
      const c = cat(nomeCat);
      c.vendido += valor;
      c.qtd += q;
      if (custoUn === null) c.semCusto += q;
      else c.custo += custoUn * q;
      const nome = nomeProduto(item);
      const pr = (prods[nome] = prods[nome] || { nome, categoria: nomeCat, produtoId: p?.id || null, qtd: 0, vendido: 0, custoUn, custo: 0 });
      pr.qtd += q;
      pr.vendido += valor;
      if (custoUn !== null) pr.custo += custoUn * q;
    });
  });

  // Despesas do período (investimento à parte). A despesa ligada a uma categoria entra no lucro dela.
  const porTipo = {};
  let despesasTotal = 0, investimento = 0;
  const lista = (despesas || []).filter((d) => dentro(String(d.data || "")));
  lista.forEach((d) => {
    const valor = Number(d.valor || 0);
    if (d.tipo === "investimento") investimento += valor;
    else {
      despesasTotal += valor;
      if (d.categoria) cat(String(d.categoria)).despesas += valor;
    }
    porTipo[d.tipo || "gerais"] = r2((porTipo[d.tipo || "gerais"] || 0) + valor);
  });

  const custoProdutos = Object.values(cats).reduce((s, c) => s + c.custo, 0);
  const despesasSemCategoria = r2(despesasTotal - Object.values(cats).reduce((s, c) => s + c.despesas, 0));
  const lucro = entrou - maquininha - custoProdutos - despesasTotal;
  const categorias = Object.values(cats)
    .map((c) => {
      const lucroBruto = c.vendido - c.custo;
      return { ...c, vendido: r2(c.vendido), custo: r2(c.custo), despesas: r2(c.despesas), lucroBruto: r2(lucroBruto), lucro: r2(lucroBruto - c.despesas), margem: c.vendido > 0 && c.semCusto < c.qtd ? Math.round((lucroBruto / c.vendido) * 100) : null };
    })
    .sort((a, b) => b.vendido - a.vendido);
  const produtosLista = Object.values(prods)
    .map((p) => ({ ...p, vendido: r2(p.vendido), custo: r2(p.custo), lucro: p.custoUn === null ? null : r2(p.vendido - p.custo), margem: p.custoUn === null || !p.vendido ? null : Math.round(((p.vendido - p.custo) / p.vendido) * 100) }))
    .sort((a, b) => b.vendido - a.vendido);

  return {
    pedidos,
    entrou: r2(entrou),
    taxaEntrega: r2(taxaEntrega),
    taxaCartaoCliente: r2(taxaCartaoCliente),
    maquininha: r2(maquininha),
    custoProdutos: r2(custoProdutos),
    despesas: r2(despesasTotal),
    despesasSemCategoria,
    investimento: r2(investimento),
    lucro: r2(lucro),
    margem: entrou > 0 ? Math.round((lucro / entrou) * 100) : null,
    sobra: r2(lucro - investimento),
    semCusto: produtosLista.filter((p) => p.custoUn === null).length,
    categorias,
    produtos: produtosLista,
    formas: Object.entries(formas).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor),
    despesasPorTipo: TIPOS_DESPESA.map((t) => ({ ...t, valor: porTipo[t.id] || 0 })).filter((t) => t.valor > 0),
    listaDespesas: lista.sort((a, b) => String(b.data).localeCompare(String(a.data))),
  };
}
