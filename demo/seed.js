// Restaurante de almoço de exemplo da demonstração. Tudo inventado: cardápio, preços, nomes de
// clientes e vendas servem só para mostrar o sistema funcionando.
import { Timestamp, demoReplaceAll } from "./fakeFirestore";
import { MONTAGEM_ALMOCO, ehCategoriaDePrato } from "../src/utils/montagem";

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
];

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
  const cols = { produtos: {}, estoque: {}, categorias: {}, mesas: {}, pedidos: {}, vendasDia: {}, historicoMesas: {}, historicoDias: {}, relatorioGerencial: {}, notificacoes: {}, configuracoes: {} };
  const itensPorNome = {};

  CARDAPIO.forEach(([categoria, itens], ordemCat) => {
    cols.categorias[slug(categoria)] = { nome: categoria, ordem: ordemCat, ativo: true, criadoEm: new Timestamp(now), atualizadoEm: iso(now) };
    itens.forEach(([nome, preco, qtd], ordem) => {
      const id = slug(`${categoria}-${nome}`);
      cols.produtos[id] = { categoria, nome, preco, ativo: true, ordem, criadoEm: new Timestamp(now), ...(ehCategoriaDePrato(categoria) ? { montagem: MONTAGEM_ALMOCO } : {}) };
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
  const pagamentos = ["pix", "dinheiro", "cartao", "pix"];
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

  demoReplaceAll(cols);
}
