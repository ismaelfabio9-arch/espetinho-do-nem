// Bar de exemplo da demonstração. Tudo inventado: cardápio, preços, nomes de
// clientes e vendas servem só para mostrar o sistema funcionando.
import { Timestamp, demoReplaceAll } from "./fakeFirestore";

const slug = (t) =>
  String(t)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// [categoria, [nome, preço, estoque]]
const CARDAPIO = [
  ["Espetinhos", [["Carne", 9, 60], ["Frango", 8, 60], ["Linguiça", 8, 45], ["Coração", 8, 40], ["Queijo coalho", 10, 35], ["Pão de alho", 6, 50], ["Frango com bacon", 12, 30]]],
  ["Caldinhos", [["Feijão", 10, 25], ["Camarão", 13, 20], ["Peixe", 12, 15]]],
  ["Porções", [["Batata frita", 25, 30], ["Macaxeira frita", 22, 25], ["Calabresa acebolada", 30, 20]]],
  ["Acompanhamentos", [["Farofa", 5, 40], ["Vinagrete", 5, 40], ["Arroz", 8, 30]]],
  ["Bebidas", [["Refrigerante lata", 6, 72], ["Água mineral", 4, 48], ["Suco de laranja", 8, 30], ["Cerveja long neck", 9, 96]]],
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
      cols.produtos[id] = { categoria, nome, preco, ativo: true, ordem, criadoEm: new Timestamp(now) };
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
    [2, "Carlos (exemplo)", [item("Carne", 4), item("Frango", 2), item("Farofa", 1), item("Cerveja long neck", 4)], 35],
    [5, "", [item("Batata frita", 1), item("Refrigerante lata", 3), item("Queijo coalho", 2)], 18],
    [7, "Ana e amigos (exemplo)", [item("Calabresa acebolada", 1), item("Linguiça", 3), item("Feijão", 2), item("Suco de laranja", 2)], 9],
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
    dia.setHours(23, 30, 0, 0);
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
  cols.configuracoes.impressora = { habilitada: false, autoImprimirPedido: false, autoImprimirComprovante: false, larguraPapel: "58mm", nomeEstabelecimento: "Bar Modelo (demonstração)", endereco: "Endereço de exemplo, Recife - PE", telefone: "(81) 90000-0000", mensagemRodape: "Obrigado pela preferência!" };

  demoReplaceAll(cols);
}
