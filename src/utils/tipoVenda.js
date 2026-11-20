// Tipo de cada venda finalizada: Mesa, Balcão (pedido para viagem) ou Entrega.
// Os históricos mostram cada tipo separado; só o Relatório Gerencial junta tudo.

export const TIPOS_VENDA = [
  { id: "mesa", rotulo: "🍽️ Mesas", nome: "Mesas" },
  { id: "balcao", rotulo: "🛍️ Balcão", nome: "Balcão" },
  { id: "entrega", rotulo: "🛵 Entregas", nome: "Entregas" },
];

export function tipoVenda(v) {
  const o = v?.origem || v?.tipo;
  if (o === "mesa") return "mesa";
  if (o === "entrega") return "entrega";
  return "balcao";
}

// Prato montado ("Peito empanado — feijão preto, …") conta como o prato.
export const nomeProduto = (item) => item.nomeBase || String(item.nome || "").split(" — ")[0];

export const qtdItem = (item) => Number(item.qtd || item.quantidade || 0);

/** Soma das vendas: pedidos, itens, faturamento, taxas de entrega e produtos. */
export function resumir(vendas) {
  const produtos = {};
  let total = 0;
  let itens = 0;
  let taxaEntrega = 0;
  vendas.forEach((v) => {
    total += Number(v.total || 0);
    taxaEntrega += Number(v.taxaEntrega || 0);
    (v.itens || []).forEach((item) => {
      const nome = nomeProduto(item);
      const q = qtdItem(item);
      itens += q;
      if (!produtos[nome]) produtos[nome] = { nome, preco: Number(item.preco || 0), qtd: 0, total: 0 };
      produtos[nome].qtd += q;
      produtos[nome].total += Number(item.preco || 0) * q;
    });
  });
  return {
    pedidos: vendas.length,
    itens,
    total,
    taxaEntrega,
    ticket: vendas.length ? total / vendas.length : 0,
    produtos: Object.values(produtos).sort((a, b) => b.total - a.total),
  };
}

export const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");

export function contarPorTipo(lista) {
  const c = { mesa: 0, balcao: 0, entrega: 0 };
  lista.forEach((v) => (c[tipoVenda(v)] += 1));
  return c;
}
