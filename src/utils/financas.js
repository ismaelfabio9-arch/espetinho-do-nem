// Controle financeiro (planos Completo e Premium). Duas contas diferentes, como num restaurante de verdade:
//
// 1) LUCRO (resultado do período): o que a loja ganhou vendendo.
//    Vendas − taxas da maquininha − custo dos produtos vendidos (CMV) = lucro bruto
//    lucro bruto − despesas variáveis − despesas fixas = lucro líquido
//    Compra de mercadoria NÃO entra aqui: ela vira estoque e só pesa no lucro quando o produto é
//    vendido (pelo custo do produto). Investimento (equipamento, reforma) e retirada do dono também
//    não entram: não são gasto para vender.
//
// 2) CAIXA (dinheiro): tudo o que entrou e saiu de verdade no período.
//    Vendas recebidas (já sem a maquininha) + dinheiro colocado pelo dono + outras entradas
//    − compras − despesas − investimentos − retiradas do dono = saldo do período.
//
// De onde vem cada número:
// - Vendas: dias encerrados (relatorioGerencial) + o dia aberto (vendasDia), com taxa de entrega e a
//   taxa do cartão que o cliente pagou.
// - Maquininha: a % do débito/crédito sobre o que passou no cartão (a % gravada na venda; nas
//   vendas antigas, a % de hoje em Configurações → Taxas da maquininha).
// - Custo dos produtos: custos/<produtoId> (só a equipe lê; o cardápio do cliente não vê) × quantidade.
// - Lançamentos (coleção "despesas", nome mantido): { data, valor, tipo, descricao, categoria? }.
import { nomeProduto, qtdItem } from "./tipoVenda";

export const GRUPOS = [
  { id: "compra", nome: "Compras de mercadoria", dica: "Vira estoque: não diminui o lucro na hora. O lucro desconta o custo do que foi vendido.", saida: true, noLucro: false },
  { id: "variavel", nome: "Despesas variáveis", dica: "Mudam conforme o movimento. Diminuem o lucro.", saida: true, noLucro: true },
  { id: "fixa", nome: "Despesas fixas", dica: "Todo mês, vendendo ou não. Diminuem o lucro.", saida: true, noLucro: true },
  { id: "investimento", nome: "Investimentos", dica: "Equipamento, reforma, móveis. Sai do caixa, mas não é gasto do mês.", saida: true, noLucro: false },
  { id: "retirada", nome: "Retirada do dono", dica: "O que o dono tira para ele (pró-labore). Sai do caixa, não diminui o lucro.", saida: true, noLucro: false },
  { id: "entrada", nome: "Entradas (fora as vendas)", dica: "Dinheiro que entra sem ser venda.", saida: false, noLucro: false },
];

export const TIPOS = [
  { id: "insumos", grupo: "compra", nome: "Comida e ingredientes", icone: "🥩", categoria: true },
  { id: "bebidas", grupo: "compra", nome: "Bebidas para revenda", icone: "🥤", categoria: true },
  { id: "embalagens", grupo: "compra", nome: "Embalagens e descartáveis", icone: "📦", categoria: true },
  { id: "entregas", grupo: "variavel", nome: "Entregador (motoboy)", icone: "🛵" },
  { id: "marketing", grupo: "variavel", nome: "Divulgação e anúncios", icone: "📣" },
  { id: "manutencao", grupo: "variavel", nome: "Manutenção e consertos", icone: "🔧" },
  { id: "gerais", grupo: "variavel", nome: "Outras despesas", icone: "🧾" },
  { id: "aluguel", grupo: "fixa", nome: "Aluguel", icone: "🏠" },
  { id: "funcionarios", grupo: "fixa", nome: "Funcionários", icone: "👥" },
  { id: "contas", grupo: "fixa", nome: "Água, luz, gás e internet", icone: "💡" },
  { id: "servicos", grupo: "fixa", nome: "Contador, sistemas e taxas", icone: "🗂️" },
  { id: "investimento", grupo: "investimento", nome: "Equipamentos e reforma", icone: "📈" },
  { id: "retirada", grupo: "retirada", nome: "Retirada do dono", icone: "👤" },
  { id: "aporte", grupo: "entrada", nome: "Dinheiro colocado pelo dono", icone: "💵" },
  { id: "outrasEntradas", grupo: "entrada", nome: "Outras entradas", icone: "➕" },
];
export const tipoDe = (id) => TIPOS.find((t) => t.id === id) || TIPOS.find((t) => t.id === "gerais");
export const grupoDe = (id) => GRUPOS.find((g) => g.id === tipoDe(id).grupo);
export const SEM_CATEGORIA_FIN = "Sem categoria";

const num = (v) => {
  const t = String(v ?? "").trim();
  const n = Number(t.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
};
/** "12,50" ou "1.234,50" → 12.5 / 1234.5 (valor de dinheiro digitado). */
export const lerValor = (v) => Math.round(Math.max(0, num(v)) * 100) / 100;
const r2 = (v) => Math.round(v * 100) / 100;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);

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
 * @param vendas   juntarVendas(...)
 * @param produtos lista de produtos ({ id, nome, categoria })
 * @param custos   { [produtoId]: número }
 * @param lancamentos lista ({ data: AAAA-MM-DD, valor, tipo, categoria? })
 * @param taxas    lerTaxas(...) da loja
 * @param custoDoItem (item, produto) → custo de 1 unidade com o recheio/tamanho/adicional escolhido (ou null)
 */
export function calcularFinancas({ vendas, produtos, custos, lancamentos, taxas, de, ate, perdas = 0, custoDoItem }) {
  const dentro = (dia) => (!de || dia >= de) && (!ate || dia <= ate);
  const porId = new Map((produtos || []).map((p) => [p.id, p]));
  const porNome = new Map((produtos || []).map((p) => [String(p.nome || "").trim().toLowerCase(), p]));
  const acharProduto = (item) => porId.get(item.produtoId) || porNome.get(nomeProduto(item).trim().toLowerCase()) || null;

  const cats = {};
  const prods = {};
  const formas = {};
  const cat = (nome) => (cats[nome] = cats[nome] || { nome, vendido: 0, custo: 0, qtd: 0, semCusto: 0, comprou: 0 });

  let vendas$ = 0, taxaEntrega = 0, taxaCartaoCliente = 0, maquininha = 0, pedidos = 0, itensVendido = 0, vendidoSemCusto = 0;
  (vendas || []).filter((v) => dentro(v.dia)).forEach((v) => {
    pedidos += 1;
    const total = Number(v.total || 0);
    const taxaCli = Number(v.taxaCartao || 0);
    vendas$ += total + taxaCli;
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
      const doItem = p && custoDoItem ? custoDoItem(item, p) : null;
      const custoUn = typeof doItem === "number" ? doItem : p && typeof custos?.[p.id] === "number" ? custos[p.id] : null;
      const c = cat(nomeCat);
      itensVendido += valor;
      c.vendido += valor;
      c.qtd += q;
      if (custoUn === null) {
        c.semCusto += q;
        vendidoSemCusto += valor;
      } else c.custo += custoUn * q;
      const nome = nomeProduto(item);
      const pr = (prods[nome] = prods[nome] || { nome, categoria: nomeCat, produtoId: p?.id || null, qtd: 0, vendido: 0, custoUn, custo: 0 });
      pr.qtd += q;
      pr.vendido += valor;
      if (custoUn !== null) pr.custo += custoUn * q;
    });
  });

  // Lançamentos do período, somados por grupo e por tipo.
  const g = { compra: 0, variavel: 0, fixa: 0, investimento: 0, retirada: 0, entrada: 0 };
  const porTipo = {};
  const lista = (lancamentos || []).filter((d) => dentro(String(d.data || "")));
  lista.forEach((d) => {
    const valor = Number(d.valor || 0);
    const t = tipoDe(d.tipo);
    g[t.grupo] += valor;
    porTipo[t.id] = (porTipo[t.id] || 0) + valor;
    if (t.grupo === "compra" && d.categoria) cat(String(d.categoria)).comprou += valor;
  });

  // Lucro
  const custoProdutos = Object.values(cats).reduce((s, c) => s + c.custo, 0);
  const receitaLiquida = vendas$ - maquininha;
  const lucroBruto = receitaLiquida - custoProdutos;
  // Perdas de mercadoria (estragou, venceu, faltou na contagem): o que foi comprado e não virou venda.
  const lucro = lucroBruto - g.variavel - g.fixa - perdas;

  // Ponto de equilíbrio: quanto vender no período para pagar as despesas fixas.
  // Margem de contribuição = o que sobra de cada R$ 1 vendido depois de maquininha, custo e variáveis.
  const margemContrib = vendas$ > 0 ? (lucroBruto - g.variavel) / vendas$ : null;
  const equilibrio = g.fixa > 0 && margemContrib && margemContrib > 0 ? r2(g.fixa / margemContrib) : null;

  // Caixa
  const entrouCaixa = receitaLiquida + g.entrada;
  const saiuCaixa = g.compra + g.variavel + g.fixa + g.investimento + g.retirada;

  const categorias = Object.values(cats)
    .filter((c) => c.vendido > 0 || c.comprou > 0)
    .map((c) => {
      // A maquininha é dividida entre as categorias pelo que cada uma vendeu.
      const taxas = itensVendido > 0 ? (maquininha * c.vendido) / itensVendido : 0;
      const lucroCat = c.vendido - taxas - c.custo;
      return { ...c, vendido: r2(c.vendido), custo: r2(c.custo), comprou: r2(c.comprou), taxas: r2(taxas), lucro: r2(lucroCat), participacao: pct(c.vendido, itensVendido), margem: c.vendido > 0 && c.semCusto < c.qtd ? pct(lucroCat, c.vendido) : null };
    })
    .sort((a, b) => b.vendido - a.vendido);
  const produtosLista = Object.values(prods)
    .map((p) => ({ ...p, vendido: r2(p.vendido), custo: r2(p.custo), participacao: pct(p.vendido, itensVendido), lucro: p.custoUn === null ? null : r2(p.vendido - p.custo), margem: p.custoUn === null || !p.vendido ? null : pct(p.vendido - p.custo, p.vendido) }))
    .sort((a, b) => b.vendido - a.vendido);

  return {
    pedidos,
    vendas: r2(vendas$),
    ticket: pedidos ? r2(vendas$ / pedidos) : 0,
    taxaEntrega: r2(taxaEntrega),
    taxaCartaoCliente: r2(taxaCartaoCliente),
    maquininha: r2(maquininha),
    receitaLiquida: r2(receitaLiquida),
    custoProdutos: r2(custoProdutos),
    lucroBruto: r2(lucroBruto),
    margemBruta: pct(lucroBruto, vendas$),
    variaveis: r2(g.variavel),
    fixas: r2(g.fixa),
    perdas: r2(perdas),
    lucro: r2(lucro),
    margem: pct(lucro, vendas$),
    equilibrio,
    compras: r2(g.compra),
    investimentos: r2(g.investimento),
    retiradas: r2(g.retirada),
    entradasExtras: r2(g.entrada),
    entrouCaixa: r2(entrouCaixa),
    saiuCaixa: r2(saiuCaixa),
    saldoCaixa: r2(entrouCaixa - saiuCaixa),
    semCusto: produtosLista.filter((p) => p.custoUn === null).length,
    vendidoSemCusto: r2(vendidoSemCusto),
    categorias,
    produtos: produtosLista,
    formas: Object.entries(formas).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor),
    porGrupo: GRUPOS.map((gr) => ({
      ...gr,
      valor: r2(g[gr.id]),
      tipos: TIPOS.filter((t) => t.grupo === gr.id && porTipo[t.id]).map((t) => ({ ...t, valor: r2(porTipo[t.id]) })),
    })).filter((gr) => gr.valor > 0),
    lancamentos: lista.sort((a, b) => String(b.data).localeCompare(String(a.data))),
  };
}
