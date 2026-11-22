// Restaurante de almoço de exemplo da demonstração. Tudo inventado: cardápio, preços, nomes de
// clientes e vendas servem só para mostrar o sistema funcionando.
import { Timestamp, demoReplaceAll } from "./fakeFirestore";
import { MONTAGEM_ALMOCO, ehCategoriaDePrato, tipoPelaCategoria } from "../src/utils/montagem";
import { CATEGORIAS_PRONTAS } from "../src/data/produtos";

// Opções (sabores, recheios) dos produtos que vêm das categorias prontas do sistema.
const OPCOES = Object.fromEntries(CATEGORIAS_PRONTAS.flatMap((c) => c.itens.filter((i) => i.montagem).map((i) => [i.nome, i.montagem])));

const slug = (t) =>
  String(t)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// [categoria, [nome, preço, estoque]]
const CARDAPIO = [
  ["Pratos do dia", [["Frango grelhado", 22, 40], ["Bife acebolado", 25, 35], ["Peixe frito", 26, 25], ["Carne de sol com macaxeira", 28, 25], ["Strogonoff de frango", 22, 30], ["Feijoada", 28, 20]]],
  ["Prato feito (PF)", [["PF de frango", 18, 40], ["PF de carne", 20, 40]]],
  ["Acompanhamentos", [["Arroz", 6, 50], ["Feijão", 6, 50], ["Farofa", 5, 40], ["Salada", 7, 30], ["Batata frita", 12, 30]]],
  ["Sucos", [["Suco de laranja", 8, 40], ["Suco de maracujá", 8, 40], ["Suco de acerola", 8, 40], ["Suco de cajá", 8, 30]]],
  ["Refrigerantes e água", [["Refrigerante lata", 6, 72], ["Refrigerante 1L", 10, 24], ["Água mineral", 4, 48], ["Água com gás", 5, 24]]],
  ["Cervejas", [["Cerveja long neck", 9, 72], ["Cerveja lata", 6, 72]]],
  ["Sobremesas", [["Pudim", 8, 20], ["Mousse de maracujá", 7, 20], ["Cocada", 5, 30]]],
  ["Picolés", [["Picolé de fruta", 4, 60], ["Picolé ao leite", 5, 60], ["Picolé recheado", 7, 40]]],
  ["Tapiocas", [["Tapioca", 6, 40]]],
  ["Pastéis", [["Pastel", 13, 60]]],
];

// Pastel montado pelo cliente: o tamanho diz quantos recheios (6 ou 10), Misto sorteia; acompanhamentos e molhos à vontade.
const MONTAGEM_PASTEL = {
  vem: [],
  escolhas: [
    { nome: "Tamanho", opcoes: ["6 sabores", "10 sabores"], precos: { "10 sabores": 3 } },
    { nome: "Recheios", opcoes: ["Carne moída", "Queijo coalho", "Queijo mussarela", "Cheddar", "Catupiry", "Frango", "Presunto", "Calabresa", "Camarão", "Bacon"], maxDe: "Tamanho", maxPor: { "6 sabores": 6, "10 sabores": 10 } },
    { nome: "Acompanhamentos", opcoes: ["Milho", "Ervilha", "Azeitona", "Tomate", "Cebola", "Ovo de codorna"], livre: true },
    { nome: "Molhos", opcoes: ["Creme de alho", "Maionese especial", "Ketchup", "Barbecue"], livre: true },
  ],
  extras: [{ nome: "Queijo a mais", preco: 2 }],
};

const MESAS = 15;

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function seedDemo() {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const cols = { produtos: {}, estoque: {}, categorias: {}, mesas: {}, pedidos: {}, vendasDia: {}, historicoMesas: {}, historicoDias: {}, relatorioGerencial: {}, notificacoes: {}, configuracoes: {}, insumos: {}, insumosMov: {}, fichas: {}, despesas: {} };
  const itensPorNome = {};

  CARDAPIO.forEach(([categoria, itens], ordemCat) => {
    cols.categorias[slug(categoria)] = { nome: categoria, ordem: ordemCat, ativo: true, tipo: tipoPelaCategoria(categoria), criadoEm: new Timestamp(now), atualizadoEm: iso(now) };
    itens.forEach(([nome, preco, qtd], ordem) => {
      const id = slug(`${categoria}-${nome}`);
      cols.produtos[id] = { categoria, nome, preco, ativo: true, ordem, criadoEm: new Timestamp(now), tipo: tipoPelaCategoria(categoria), ...(nome === "Pastel" ? { montagem: MONTAGEM_PASTEL } : ehCategoriaDePrato(categoria) ? { montagem: MONTAGEM_ALMOCO } : OPCOES[nome] ? { montagem: OPCOES[nome] } : {}) };
      cols.estoque[id] = { nome, categoria, quantidade: qtd, atualizadoEm: iso(now) };
      itensPorNome[nome] = { produtoId: id, nome, preco };
    });
  });

  for (let n = 1; n <= MESAS; n++) cols.mesas[String(n)] = { numero: n, posicao: n - 1, posicaoOriginal: n - 1, cliente: "" };

  const item = (nome, qtd) => ({ ...itensPorNome[nome], qtd });
  const pedido = (itens) => ({
    itens,
    total: itens.reduce((s, i) => s + i.preco * i.qtd, 0),
    totalItens: itens.reduce((s, i) => s + i.qtd, 0),
  });

  // Mesas abertas agora.
  const abertas = [
    [2, "Carlos (exemplo)", [item("Bife acebolado", 1), item("Frango grelhado", 1), item("Suco de laranja", 2)], 25],
    [5, "", [item("PF de carne", 3), item("Refrigerante lata", 3), item("Pudim", 1)], 15],
    [7, "Equipe da obra (exemplo)", [item("Feijoada", 2), item("PF de frango", 2), item("Farofa", 1), item("Suco de maracujá", 4)], 8],
  ];
  abertas.forEach(([mesa, cliente, itens, minAtras], k) => {
    if (cliente) cols.mesas[String(mesa)].cliente = cliente;
    const t = now - minAtras * 60000;
    cols.pedidos[`demo-mesa-${mesa}`] = { idLocal: t + k, tipo: "mesa", mesa, titulo: `Mesa ${mesa}`, ...pedido(itens), status: "aberto", salvoEm: iso(t), criadoEm: new Timestamp(t) };
  });

  // Vendas já fechadas hoje.
  const r = rng(7);
  const nomes = Object.keys(itensPorNome);
  const pagamentos = ["Pix", "Dinheiro", "Crédito", "Pix", "Débito"];
  const venda = (t, origem, mesa) => {
    const itens = [];
    const linhas = 2 + Math.floor(r() * 3);
    for (let i = 0; i < linhas; i++) {
      const nome = nomes[Math.floor(r() * nomes.length)];
      if (!itens.some((x) => x.nome === nome)) itens.push(item(nome, 1 + Math.floor(r() * 3)));
    }
    return {
      origem,
      ...(origem === "mesa" ? { mesa, titulo: `Mesa ${mesa}` } : { titulo: "Viagem" }),
      ...pedido(itens),
      formaPagamento: pagamentos[Math.floor(r() * pagamentos.length)],
      comprovanteEmitido: false,
      finalizadoEm: iso(t),
      criadoEm: new Timestamp(t),
    };
  };
  for (let i = 0; i < 4; i++) {
    const t = now - (150 - i * 30) * 60000;
    const v = venda(t, i === 2 ? "viagem" : "mesa", [3, 8, 0, 11][i]);
    cols.vendasDia[`demo-venda-${i}`] = v;
    if (v.origem === "mesa") cols.historicoMesas[`demo-hist-${i}`] = { ...v, pedidoOriginalId: `demo-${i}`, status: "finalizada" };
  }

  // Dias anteriores já encerrados (relatório e histórico).
  for (let d = 7; d >= 1; d--) {
    const dia = new Date(now - d * 86400000);
    dia.setHours(15, 30, 0, 0); // almoço: fecha o dia à tarde
    const vendas = [];
    const qtd = 6 + Math.floor(r() * 8);
    for (let i = 0; i < qtd; i++) vendas.push(venda(dia.getTime() - (qtd - i) * 20 * 60000, r() < 0.8 ? "mesa" : "viagem", 1 + Math.floor(r() * MESAS)));
    const produtos = {};
    vendas.forEach((v) =>
      v.itens.forEach((it) => {
        produtos[it.nome] = produtos[it.nome] || { nome: it.nome, qtd: 0, total: 0 };
        produtos[it.nome].qtd += it.qtd;
        produtos[it.nome].total += it.preco * it.qtd;
      })
    );
    const fechamento = {
      data: dia.toLocaleDateString("pt-BR"),
      horario: dia.toLocaleTimeString("pt-BR"),
      totalVendido: vendas.reduce((s, v) => s + v.total, 0),
      totalPedidos: vendas.length,
      totalItens: vendas.reduce((s, v) => s + v.totalItens, 0),
      produtos: Object.values(produtos),
      vendasDia: vendas,
      criadoEm: new Timestamp(dia.getTime()),
    };
    cols.historicoDias[`demo-dia-${d}`] = fechamento;
    cols.relatorioGerencial[`demo-dia-${d}`] = fechamento;
  }

  // Sem impressora na demonstração (evita abrir a janela de impressão a cada pedido).
  cols.configuracoes.impressora = { habilitada: false, autoImprimirPedido: false, autoImprimirComprovante: false, larguraPapel: "58mm", nomeEstabelecimento: "Restaurante Modelo (demonstração)", endereco: "Endereço de exemplo, Recife - PE", telefone: "(81) 90000-0000", mensagemRodape: "Obrigado pela preferência!" };

  // Ingredientes de exemplo (preços inventados, só para mostrar a conta) e o que vai em cada produto.
  // [id, nome, unidade, preço por unidade, quanto tem]
  const INSUMOS = [
    ["arroz", "Arroz", "kg", 6, 18],
    ["feijao", "Feijão", "kg", 8, 12],
    ["frango", "Peito de frango", "kg", 19, 9],
    ["carne", "Carne (alcatra)", "kg", 42, 6],
    ["peixe", "Peixe (filé)", "kg", 32, 4],
    ["batata", "Batata", "kg", 7, 10],
    ["oleo", "Óleo", "L", 9, 6],
    ["farinha", "Farinha de mandioca", "kg", 7, 5],
    ["verdura", "Verdura e tomate", "kg", 9, 3],
    ["laranja", "Laranja", "kg", 4, 15],
    ["lata", "Refrigerante lata", "un", 3.2, 48],
    ["agua", "Água mineral", "un", 1.3, 36],
  ];
  INSUMOS.forEach(([id, nome, unidade, custo, quantidade]) => {
    cols.insumos[id] = { nome, unidade, custo, quantidade, minimo: unidade === "un" ? 12 : 2, ativo: true, criadoEm: new Timestamp(now), atualizadoEm: iso(now) };
  });
  const idDe = (nome) => itensPorNome[nome]?.produtoId;
  const FICHAS = {
    "Frango grelhado": [["arroz", 0.12], ["feijao", 0.1], ["frango", 0.2], ["verdura", 0.05], ["oleo", 0.01]],
    "Bife acebolado": [["arroz", 0.12], ["feijao", 0.1], ["carne", 0.18], ["verdura", 0.05], ["oleo", 0.01]],
    "Peixe frito": [["arroz", 0.12], ["feijao", 0.1], ["peixe", 0.2], ["farinha", 0.03], ["oleo", 0.05]],
    "PF de frango": [["arroz", 0.12], ["feijao", 0.1], ["frango", 0.15], ["farinha", 0.03], ["verdura", 0.04]],
    "PF de carne": [["arroz", 0.12], ["feijao", 0.1], ["carne", 0.13], ["farinha", 0.03], ["verdura", 0.04]],
    Arroz: [["arroz", 0.15]],
    Feijão: [["feijao", 0.15]],
    Farofa: [["farinha", 0.08], ["oleo", 0.01]],
    "Batata frita": [["batata", 0.3], ["oleo", 0.05]],
    "Suco de laranja": [["laranja", 0.5]],
    "Refrigerante lata": [["lata", 1]],
    "Água mineral": [["agua", 1]],
  };
  Object.entries(FICHAS).forEach(([nome, itens]) => {
    const id = idDe(nome);
    if (id) cols.fichas[id] = { nome, itens: itens.map(([insumoId, qtd]) => ({ insumoId, qtd })), atualizadoEm: iso(now) };
  });
  // Preço certo começa na conta só com os ingredientes (ingredientes até 30% do preço).
  cols.configuracoes.precificacao = { conta: "ingredientes", pesoIngredientes: 30, lucro: 15, lucroModo: "pct", atualizadoEm: iso(now) };
  // Algumas contas do mês (valores de exemplo) para o Dinheiro mostrar lucro e despesas.
  const diaMes = (d) => {
    const x = new Date(now);
    x.setDate(Math.max(1, Math.min(d, x.getDate())));
    return x.toISOString().slice(0, 10);
  };
  [
    ["aluguel", "Aluguel do ponto", 1800, 5],
    ["contas", "Luz e água", 420, 10],
    ["insumos", "Compras do mercado", 650, 3, "Pratos do dia"],
    ["bebidas", "Refrigerantes e água", 280, 4, "Refrigerantes e água"],
  ].forEach(([tipo, descricao, valor, d, categoria], k) => {
    cols.despesas[`demo-desp-${k}`] = { tipo, descricao, valor, data: diaMes(d), ...(categoria ? { categoria } : {}), criadoEm: new Timestamp(now) };
  });

  demoReplaceAll(cols);
}
