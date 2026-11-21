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

const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");

/**
 * Cada mesa atendida no dia (uma linha por vez que a mesa abriu e fechou): número, cliente,
 * horário, quanto tempo ficou, quantos pedidos fez, os itens e o total. Registros antigos (de antes
 * deste controle) aparecem com o que tiverem.
 */
export function mesasAtendidas(vendas) {
  const grupos = {};
  vendas
    .filter((v) => tipoVenda(v) === "mesa")
    .forEach((v, i) => {
      const k = v.sessaoMesa || `r${i}-${v.mesa}-${v.finalizadoEm}`;
      if (!grupos[k]) grupos[k] = { chave: k, mesa: v.mesa, cliente: v.cliente || "", abertaEm: v.abertaEm || null, fechadaEm: v.fechadaEm || v.finalizadoEm || null, pedidos: Number(v.pedidosNaMesa || 0), registros: 0, itens: [], total: 0, formaPagamento: v.formaPagamento || "" };
      const g = grupos[k];
      g.registros += 1;
      g.total += Number(v.total || 0);
      (v.itens || []).forEach((it) => {
        const ja = g.itens.find((x) => x.nome === it.nome);
        if (ja) ja.qtd += qtdItem(it);
        else g.itens.push({ nome: it.nome, preco: Number(it.preco || 0), qtd: qtdItem(it) });
      });
    });
  return Object.values(grupos)
    .map((g) => {
      const min = g.abertaEm && g.fechadaEm ? Math.max(0, Math.round((Date.parse(g.fechadaEm) - Date.parse(g.abertaEm)) / 60000)) : null;
      return {
        ...g,
        pedidos: g.pedidos || g.registros,
        horario: g.abertaEm ? `${hora(g.abertaEm)} às ${hora(g.fechadaEm)}` : g.fechadaEm ? `fechou às ${hora(g.fechadaEm)}` : "",
        tempo: min === null ? "" : min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`,
      };
    })
    .sort((a, b) => String(a.abertaEm || a.fechadaEm).localeCompare(String(b.abertaEm || b.fechadaEm)));
}
