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
    // Recheios "pelo tamanho" começam vazios: o cliente escolhe (ou toca em Misto).
    if (g.maxDe || g.livre) escolhas[g.nome] = [];
    else if ((g.opcoes || []).length) escolhas[g.nome] = g.opcoes[0];
  });
  return { tirar: [], escolhas, extras: [], outros: [], obs: "" };
}

const baixa = (s) => String(s || "").trim().toLowerCase();
const semAcento = (s) => baixa(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Tirou do prato o item que dá nome à escolha (tirou "Salada" → some a escolha "Salada"; tirou
 * "Feijão" → some "Feijão"): a escolha não vale mais, nem no nome nem no preço (igual no servidor).
 */
export function grupoCortado(grupo, tirar) {
  const g = semAcento(grupo?.nome);
  return !!g && (tirar || []).some((v) => semAcento(v) === g);
}

/** A escolha sem as opções dos grupos cortados (é o que vai para o pedido). */
export function limparEscolha(produto, escolha) {
  const m = produto?.montagem || {};
  const escolhas = { ...(escolha?.escolhas || {}) };
  (m.escolhas || []).forEach((g) => {
    if (grupoCortado(g, escolha?.tirar)) delete escolhas[g.nome];
    // Opcional (acompanhamentos, molhos) sem nada marcado: não vai.
    else if (g.livre && !escolhidas(escolhas[g.nome]).length) delete escolhas[g.nome];
  });
  return { ...escolha, escolhas };
}

/** "Peito empanado — feijão preto, salada verdura, sem farofa, + ovo" (igual no servidor). */
export function nomeMontado(produto, escolha) {
  const m = produto?.montagem || {};
  const partes = [];
  (m.escolhas || []).forEach((g) => {
    const ops = escolhidas(escolha?.escolhas?.[g.nome]);
    if (!ops.length || grupoCortado(g, escolha?.tirar)) return;
    const op = ops.length > 2 ? `${ops.slice(0, -1).join(", ")} e ${ops[ops.length - 1]}` : ops.join(" e ");
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

/**
 * O que foi escolhido num grupo, sempre em lista. Grupo de 1 opção guarda texto ("Preto"); grupo de
 * "até N" (ex.: "Patê (até 2)") guarda a lista (["Frango", "Atum"]).
 */
export const escolhidas = (v) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
/** Quantas opções o grupo deixa escolher (1, ou o "até N" do cadastro). */
export const maxDoGrupo = (g) => Math.max(1, Math.min(6, Number(g?.max) || 1));
/** O número no nome da opção ("6 sabores" → 6); null quando não tem. */
export const numeroDe = (t) => {
  const n = parseInt(String(t || "").match(/\d+/)?.[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};
/**
 * Quantas o cliente escolhe neste grupo agora. Grupo "pelo tamanho" (maxDe: "Tamanho"): o número do tamanho
 * escolhido (maxPor do cadastro, ou o número do nome: "10 sabores" → até 10). Os outros: o "até N". Igual no servidor.
 */
export function maxNaEscolha(g, escolhas) {
  // Acompanhamentos e molhos (livre): quantos quiser, nenhum também.
  if (g?.livre) return Math.max(1, Math.min(20, (g.opcoes || []).length));
  if (!g?.maxDe) return maxDoGrupo(g);
  const tam = escolhidas(escolhas?.[g.maxDe])[0];
  // O número que o dono pôs em cada tamanho (açaí 300 ml = 3); sem ele, o número do nome (6 sabores = 6).
  const n = Number(g.maxPor?.[tam]) > 0 ? Number(g.maxPor[tam]) : numeroDe(tam);
  return Math.max(1, Math.min(20, n || 1));
}
/** Sorteia n opções do grupo (o "Misto"). */
export function sortear(opcoes, n) {
  const l = [...(opcoes || [])];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l.slice(0, Math.max(0, n));
}
/** Soma do que as opções escolhidas acrescentam no preço. */
export const precoDoGrupo = (g, v) => escolhidas(v).reduce((s, op) => s + precoOpcao(g, op), 0);

/**
 * Os preços para mostrar no card, como no cardápio impresso: Normal R$ 22 · Artesanal R$ 26, ou Pequeno R$ 5 ·
 * Médio R$ 10 · Grande R$ 16. Vem da 1ª escolha que muda o preço (até 4 opções); null quando o preço é um só.
 */
export function precosDoCardapio(produto) {
  if (!cobraEscolhas(produto)) return null;
  const g = (produto?.montagem?.escolhas || []).find((x) => maxDoGrupo(x) === 1 && (x.opcoes || []).length >= 2 && (x.opcoes || []).length <= 4 && x.opcoes.some((o) => precoOpcao(x, o) > 0));
  if (!g) return null;
  const base = Number(produto.preco || 0);
  return g.opcoes.map((o) => ({ nome: o, preco: Math.round((base + precoOpcao(g, o)) * 100) / 100 }));
}

/** Quanto a opção escolhida acrescenta (ex.: recheio de carne de sol +3, tamanho 500 ml +6). */
export function precoOpcao(grupo, opcao) {
  const v = Number(grupo?.precos?.[opcao]);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** No prato feito (PF, prato do dia) a escolha (tipo de feijão, salada) não muda o preço: porção a mais é
 *  acompanhamento ou "A mais". Nos outros tipos (tamanho, Normal/Artesanal) a opção pode ter preço. */
export function cobraEscolhas(produto) {
  return tipoDe(produto) !== "prato";
}

export function precoMontado(produto, escolha) {
  const m = produto?.montagem || {};
  const extras = (m.extras || []).filter((e) => (escolha?.extras || []).includes(e.nome));
  const outros = (escolha?.outros || []).reduce((s, o) => s + (Number(o.preco) || 0), 0);
  const opcoes = !cobraEscolhas(produto) ? 0 : (m.escolhas || []).reduce((s, g) => s + (grupoCortado(g, escolha?.tirar) ? 0 : precoDoGrupo(g, escolha?.escolhas?.[g.nome])), 0);
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
        // "Patê (até 2): Frango, Atum…" → o cliente escolhe até 2.
        const bruto = i < 0 ? linha : linha.slice(0, i);
        const ate = bruto.match(/\(\s*at[eé]\s*(\d)\s*\)/i);
        const max = ate ? Math.max(1, Math.min(6, Number(ate[1]))) : 1;
        const nome = bruto.replace(/\(\s*at[eé]\s*\d\s*\)/i, "");
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
        return { nome: nome.trim(), opcoes, ...(Object.keys(precos).length ? { precos } : {}), ...(max > 1 ? { max: Math.min(max, opcoes.length || max) } : {}) };
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
      .map((g) => `${g.nome}${maxDoGrupo(g) > 1 ? ` (até ${maxDoGrupo(g)})` : ""}: ${(g.opcoes || []).map((o) => (precoOpcao(g, o) ? `${o} = ${real(precoOpcao(g, o))}` : o)).join(", ")}`)
      .join("\n"),
    extras: (m?.extras || []).map((e) => `${e.nome} = ${real(e.preco)}`).join("\n"),
  };
}

/** Bebidas para sugerir depois do prato (as primeiras das categorias de bebida). */
/** Categoria de bebida pelo nome (Sucos, Refrigerantes, Cervejas, Águas, Doses, Drinks…). */
export const ehCategoriaDeBebida = (nome) =>
  /suco|refri|bebida|[aá]gua|cerveja|drink|dose|quartinho|vinho|chopp?|energ|caipi|whisk|vodka|cacha|refresco|lata|long.?neck|garrafa/i.test(String(nome || ""));

/**
 * Bebidas para oferecer junto do prato: TODAS as bebidas do cardápio (sucos, refrigerantes,
 * cervejas, água…), na ordem das categorias, cada uma com o nome da categoria em "grupo".
 */
export function sugestoesBebida(categorias) {
  return (categorias || [])
    .filter((c) => ehCategoriaDeBebida(c.categoria))
    .flatMap((c) => (c.itens || []).map((i) => ({ ...i, grupo: c.categoria })));
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
  // Só produto antigo (de antes do cadastro por tipo, sem "tipo"): o novo fica como o dono deixou.
  return lista.filter((p) => p.montagem === undefined && !p.tipo && p.ativo !== false && ehCategoriaDePrato(p.categoria));
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
// Nomes pelo que acontece na hora do pedido (o id não muda: é o que fica gravado no produto).
export const TIPOS = [
  { id: "simples", emoji: "🥤", nome: "Pronto, sem perguntar nada", exemplo: "Refrigerante, água, sobremesa, salgado: um toque e já entra no pedido", botao: "⚙️ Opções", titulo: "" },
  { id: "sabor", emoji: "🍦", nome: "Escolhe o sabor", exemplo: "Suco, picolé, sorvete: pergunta o sabor", botao: "🍦 Sabores", titulo: "Escolher o sabor" },
  { id: "recheio", emoji: "🌮", nome: "Escolhe tamanho ou recheio", exemplo: "Pastel, açaí, tapioca, porção P, M ou G: cada opção com o seu preço", botao: "🌮 Escolhas, recheios e tamanhos", titulo: "Escolher" },
  { id: "prato", emoji: "🍛", nome: "Prato que se monta", exemplo: "Prato do dia, PF, marmita: tira o que não quer e escolhe o feijão", botao: "🍽️ Montagem do prato", titulo: "Montar o prato" },
  { id: "lanche", emoji: "🍔", nome: "Lanche com adicionais", exemplo: "Hambúrguer, cachorro-quente: tira ingredientes e põe adicionais", botao: "🍔 O que vem e adicionais", titulo: "Montar o lanche" },
];
export const tipoInfo = (id) => TIPOS.find((t) => t.id === id) || TIPOS.find((t) => t.id === "lanche");

/** Tipo do produto. Produtos antigos (sem o campo): com montagem = prato; sem = simples. */
export function tipoDe(produto) {
  if (TIPOS.some((t) => t.id === produto?.tipo)) return produto.tipo;
  return temMontagem(produto) ? "prato" : "simples";
}

/** Tipo sugerido pelo nome da categoria (o dono pode trocar). */
export function tipoPelaCategoria(categoria) {
  const c = String(categoria || "");
  if (ehCategoriaDePrato(c)) return "prato";
  if (/hamb|burg|lanche|sandu|baguet|cachorro|hot.?dog|misto|\bx-/i.test(c)) return "lanche";
  if (/picol|sorvet|geladinho|din.?din|suco|vitamina|milk.?shake/i.test(c)) return "sabor";
  if (/tapioca|cuscuz|crepe|recheado|pastel|a[cç]a[ií]|panqueca|beiju|batat|fritas|por[cç][aã]o|por[cç][oõ]es/i.test(c)) return "recheio";
  return "simples";
}

/** Modelo pronto de cada tipo (o dono troca os nomes e os preços). */
export const MODELOS = {
  prato: MONTAGEM_ALMOCO,
  // Hambúrguer: o que vem (o cliente tira: "sem cebola") e os adicionais. Só aparece se o dono tocar em "Usar o exemplo".
  lanche: { vem: ["Pão", "Hambúrguer", "Queijo", "Alface", "Tomate", "Molho da casa"], escolhas: [], extras: [{ nome: "Bacon", preco: 4 }, { nome: "Ovo", preco: 2 }, { nome: "Cheddar", preco: 3 }] },
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
