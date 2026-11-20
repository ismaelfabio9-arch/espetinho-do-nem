// Montagem do prato (almoço): o que vem no prato, as escolhas (feijão preto, salada…) e o que vai a mais.
// Fica no próprio produto (campo "montagem") e é a mesma regra no garçom, no QR Code da mesa e no
// servidor (worker/mesas.ts na IFTech), que confere os preços de novo.
//
// montagem = { vem: ["Arroz", "Feijão", "Salada", "Farofa"],
//              escolhas: [{ nome: "Feijão", opcoes: ["Carioca", "Preto", "Macassar"] }],
//              extras: [{ nome: "Ovo", preco: 2 }] }
// escolha feita = { tirar: ["Farofa"], escolhas: { "Feijão": "Preto" }, extras: ["Ovo"] }

export function temMontagem(produto) {
  const m = produto?.montagem;
  return !!m && ((m.vem || []).length > 0 || (m.escolhas || []).length > 0 || (m.extras || []).length > 0);
}

/** Escolha inicial: tudo o que vem no prato, a 1ª opção de cada escolha e nada a mais. */
export function escolhaPadrao(produto) {
  const m = produto?.montagem || {};
  const escolhas = {};
  (m.escolhas || []).forEach((g) => {
    if ((g.opcoes || []).length) escolhas[g.nome] = g.opcoes[0];
  });
  return { tirar: [], escolhas, extras: [], outros: [], obs: "" };
}

const baixa = (s) => String(s || "").trim().toLowerCase();

/** "Peito empanado — feijão preto, salada verdura, sem farofa, + ovo" (igual no servidor). */
export function nomeMontado(produto, escolha) {
  const m = produto?.montagem || {};
  const partes = [];
  (m.escolhas || []).forEach((g) => {
    const op = escolha?.escolhas?.[g.nome];
    if (!op) return;
    partes.push(baixa(op).includes(baixa(g.nome)) ? baixa(op) : `${baixa(g.nome)} ${baixa(op)}`);
  });
  (m.vem || []).forEach((v) => {
    if ((escolha?.tirar || []).includes(v)) partes.push(`sem ${baixa(v)}`);
  });
  (m.extras || []).forEach((e) => {
    if ((escolha?.extras || []).includes(e.nome)) partes.push(`+ ${baixa(e.nome)}`);
  });
  // O que o garçom pôs na hora (fora da lista) e a observação livre.
  (escolha?.outros || []).forEach((o) => partes.push(`+ ${baixa(o.nome)}`));
  const obs = limparObs(escolha?.obs);
  if (obs) partes.push(`obs: ${obs}`);
  return partes.length ? `${produto.nome} — ${partes.join(", ")}` : produto.nome;
}

/** Quanto a opção escolhida acrescenta (ex.: recheio de carne de sol +3, tamanho 500 ml +6). */
export function precoOpcao(grupo, opcao) {
  const v = Number(grupo?.precos?.[opcao]);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function precoMontado(produto, escolha) {
  const m = produto?.montagem || {};
  const extras = (m.extras || []).filter((e) => (escolha?.extras || []).includes(e.nome));
  const outros = (escolha?.outros || []).reduce((s, o) => s + (Number(o.preco) || 0), 0);
  const opcoes = (m.escolhas || []).reduce((s, g) => s + precoOpcao(g, escolha?.escolhas?.[g.nome]), 0);
  return Math.round((Number(produto.preco || 0) + extras.reduce((s, e) => s + Number(e.preco || 0), 0) + outros + opcoes) * 100) / 100;
}

/** Observação livre: uma linha curta, sem símbolos estranhos (igual no servidor). */
export function limparObs(t) {
  // eslint-disable-next-line no-control-regex
  return String(t || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

// ---------- edição em Produtos (texto simples) ----------

const valorDe = (t) => {
  const v = Number(String(t || "0").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};
const real = (v) => String(v).replace(".", ",");

/** "Queijo, Carne de sol = 4,50, Frango = 2" → ["Queijo", "Carne de sol = 4,50", "Frango = 2"] (a vírgula do preço não separa). */
function opcoesDaLinha(t) {
  const out = [];
  String(t || "").split(",").forEach((parte) => {
    const p = parte.trim();
    if (!p) return;
    if (/^\d{1,2}$/.test(p) && out.length && /=\s*\d+$/.test(out[out.length - 1])) out[out.length - 1] += "," + p;
    else out.push(p);
  });
  return out;
}

/** Texto → montagem. "Vem: Arroz, Feijão" / escolhas "Feijão: Carioca, Preto" / a mais "Ovo = 2". */
export function lerMontagem({ vem, escolhas, extras }) {
  const lista = (t) => String(t || "").split(",").map((s) => s.trim()).filter(Boolean);
  const m = {
    vem: lista(vem).slice(0, 12),
    escolhas: String(escolhas || "")
      .split("\n")
      .map((linha) => {
        const i = linha.indexOf(":");
        const nome = i < 0 ? linha : linha.slice(0, i);
        const opcoes = [];
        const precos = {};
        opcoesDaLinha(i < 0 ? "" : linha.slice(i + 1)).slice(0, 12).forEach((op) => {
          const [n, v] = op.split("=");
          const nomeOp = (n || "").trim();
          if (!nomeOp || opcoes.includes(nomeOp)) return;
          opcoes.push(nomeOp);
          const valor = valorDe(v);
          if (valor > 0) precos[nomeOp] = valor;
        });
        return { nome: nome.trim(), opcoes, ...(Object.keys(precos).length ? { precos } : {}) };
      })
      .filter((g) => g.nome && g.opcoes.length)
      .slice(0, 6),
    extras: String(extras || "")
      .split("\n")
      .map((linha) => {
        const [nome, preco] = linha.split("=");
        return { nome: (nome || "").trim(), preco: valorDe(preco) };
      })
      .filter((e) => e.nome)
      .slice(0, 12),
  };
  return m.vem.length || m.escolhas.length || m.extras.length ? m : null;
}

export function textoMontagem(m) {
  return {
    vem: (m?.vem || []).join(", "),
    escolhas: (m?.escolhas || [])
      .map((g) => `${g.nome}: ${(g.opcoes || []).map((o) => (precoOpcao(g, o) ? `${o} = ${real(precoOpcao(g, o))}` : o)).join(", ")}`)
      .join("\n"),
    extras: (m?.extras || []).map((e) => `${e.nome} = ${real(e.preco)}`).join("\n"),
  };
}

/** Bebidas para sugerir depois do prato (as primeiras das categorias de bebida). */
export function sugestoesBebida(categorias, max = 4) {
  const ehBebida = (nome) => /suco|refri|bebida|água|agua|cerveja|drink/i.test(nome || "");
  return categorias.filter((c) => ehBebida(c.categoria)).flatMap((c) => c.itens).slice(0, max);
}

/** Modelo pronto para pratos de almoço. */
export const MONTAGEM_ALMOCO = {
  vem: ["Arroz", "Feijão", "Salada", "Farofa"],
  escolhas: [
    { nome: "Feijão", opcoes: ["Carioca", "Preto", "Macassar"] },
    { nome: "Salada", opcoes: ["Verdura", "Vinagrete", "Maionese"] },
  ],
  extras: [
    { nome: "Ovo", preco: 2 },
    { nome: "Batata frita", preco: 6 },
  ],
};

/** Categoria de prato de almoço ("Pratos do dia", "Prato feito (PF)", "Executivos"…). */
export const ehCategoriaDePrato = (categoria) => /prato|\bpf\b|executivo|marmita|refei/i.test(String(categoria || ""));

/**
 * Lojas que já existiam antes da montagem: os pratos sem montagem nenhuma (campo ainda não existe)
 * ganham o modelo de almoço. Quem tirou a montagem de propósito tem o campo como null e não é mexido.
 * Devolve os produtos que precisam ser gravados.
 */
export function pratosSemMontagem(lista) {
  return lista.filter((p) => p.montagem === undefined && p.ativo !== false && ehCategoriaDePrato(p.categoria));
}

/** Emoji da categoria na faixa do pedido rápido. */
export function emojiCategoria(categoria) {
  if (/prato feito|pf/i.test(categoria)) return "🍽️";
  if (/prato/i.test(categoria)) return "🍛";
  if (/acompanha/i.test(categoria)) return "🍚";
  if (/suco/i.test(categoria)) return "🧃";
  if (/refri|água|agua|bebida/i.test(categoria)) return "🥤";
  if (/cerveja/i.test(categoria)) return "🍺";
  if (/sobremesa|doce/i.test(categoria)) return "🍮";
  return "🍴";
}

// ---------- tipo do produto ----------
// prato   = almoço: o que vem no prato (tira), escolhas e o que vai a mais
// simples = bebida, sobremesa, doce: só nome e preço
// sabor   = picolé, sorvete, suco: o cliente escolhe o sabor
// recheio = tapioca, cuscuz, açaí, pastel: recheio ou tamanho, cada opção com o seu preço
export const TIPOS = [
  { id: "prato", emoji: "🍛", nome: "Prato de almoço", exemplo: "Prato do dia, PF, marmita", botao: "🍽️ Montagem do prato", titulo: "Montar o prato" },
  { id: "simples", emoji: "🥤", nome: "Simples", exemplo: "Bebida, sobremesa, doce, salgado", botao: "⚙️ Opções", titulo: "" },
  { id: "sabor", emoji: "🍦", nome: "Com sabor", exemplo: "Picolé, sorvete, suco", botao: "🍦 Sabores", titulo: "Escolher o sabor" },
  { id: "recheio", emoji: "🌮", nome: "Com recheio ou tamanho", exemplo: "Tapioca, cuscuz, açaí, pastel", botao: "🌮 Recheios e tamanhos", titulo: "Escolher" },
];
export const tipoInfo = (id) => TIPOS.find((t) => t.id === id) || TIPOS[1];

/** Tipo do produto. Produtos antigos (sem o campo): com montagem = prato; sem = simples. */
export function tipoDe(produto) {
  if (TIPOS.some((t) => t.id === produto?.tipo)) return produto.tipo;
  return temMontagem(produto) ? "prato" : "simples";
}

/** Tipo sugerido pelo nome da categoria (o dono pode trocar). */
export function tipoPelaCategoria(categoria) {
  const c = String(categoria || "");
  if (ehCategoriaDePrato(c)) return "prato";
  if (/picol|sorvet|geladinho|din.?din|suco|vitamina|milk.?shake/i.test(c)) return "sabor";
  if (/tapioca|cuscuz|crepe|recheado|pastel|a[cç]a[ií]|panqueca|sandu|beiju/i.test(c)) return "recheio";
  return "simples";
}

/** Modelo pronto de cada tipo (o dono troca os nomes e os preços). */
export const MODELOS = {
  prato: MONTAGEM_ALMOCO,
  simples: null,
  sabor: { vem: [], escolhas: [{ nome: "Sabor", opcoes: ["Coco", "Morango", "Chocolate", "Limão"] }], extras: [] },
  recheio: {
    vem: [],
    escolhas: [{ nome: "Recheio", opcoes: ["Queijo", "Frango", "Carne de sol"], precos: { Frango: 2, "Carne de sol": 4 } }],
    extras: [{ nome: "Queijo a mais", preco: 2 }],
  },
};

/** Abre a janela de escolha? Prato só com "Montar o prato" ligado; sabor e recheio sempre (precisa escolher). */
export function abreEscolha(produto, montarLigado) {
  if (!temMontagem(produto)) return false;
  return montarLigado || tipoDe(produto) !== "prato";
}
