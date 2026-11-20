import { MONTAGEM_ALMOCO } from "../utils/montagem";

export const produtos = [
  {
    categoria: "Espetinhos",
    itens: [
      { id: "carne", nome: "Carne", preco: 8 },
      { id: "frango", nome: "Frango", preco: 8 },
      { id: "salsichao", nome: "Salsichão", preco: 8 },
      { id: "toscana", nome: "Toscana", preco: 8 },
      { id: "coracao-de-galinha", nome: "Coração de Galinha", preco: 8 },
      { id: "pao-de-alho", nome: "Pão de Alho", preco: 6 },
      { id: "charque", nome: "Charque", preco: 12 },
      { id: "queijo", nome: "Queijo", preco: 12 },
      { id: "frango-com-bacon", nome: "Frango com Bacon", preco: 12 },
      { id: "frango-com-queijo", nome: "Frango com Queijo", preco: 12 },
      { id: "carne-de-sol-com-queijo", nome: "Carne de Sol com Queijo", preco: 12 },
      { id: "carneiro", nome: "Carneiro", preco: 13 },
    ],
  },
  {
    categoria: "Caldinhos",
    itens: [
      { id: "feijao", nome: "Feijão", preco: 10 },
      { id: "camarao", nome: "Camarão", preco: 10 },
      { id: "cabeca-de-galo", nome: "Cabeça de Galo", preco: 10 },
      { id: "sururu", nome: "Sururu", preco: 10 },
      { id: "peixe", nome: "Peixe", preco: 10 },
      { id: "costela", nome: "Costela", preco: 10 },
    ],
  },
  {
    categoria: "Refrigerantes",
    itens: [
      { id: "coca-cola-1l", nome: "Coca-Cola 1L", preco: 10 },
      { id: "guarana-1l", nome: "Guaraná 1L", preco: 9 },
      { id: "coca-cola", nome: "Coca-Cola", preco: 6 },
      { id: "coca-cola-zero", nome: "Coca-Cola Zero", preco: 6 },
      { id: "guarana", nome: "Guaraná", preco: 6 },
      { id: "fanta", nome: "Fanta", preco: 6 },
      { id: "sprite", nome: "Sprite", preco: 6 },
      { id: "agua", nome: "Água", preco: 3 },
      { id: "agua-com-gas", nome: "Água com Gás", preco: 4 },
      { id: "h2o", nome: "H2O", preco: 6 },
    ],
  },
  {
    categoria: "Cervejas",
    itens: [
      { id: "brahma-litrao", nome: "Brahma Litrão", preco: 11 },
      { id: "brahma-super-latao", nome: "Brahma Super Latão", preco: 8 },
      { id: "itaipava-super-latao", nome: "Itaipava Super Latão", preco: 8 },
      { id: "itaipava-latao", nome: "Itaipava Latão", preco: 7 },
      { id: "amstel-latao", nome: "Amstel Latão", preco: 8 },
      { id: "budweiser-long-neck", nome: "Budweiser Long Neck", preco: 8.5 },
      { id: "stella-long-neck", nome: "Stella Long Neck", preco: 9 },
      { id: "heineken-long-neck", nome: "Heineken Long Neck", preco: 9 },
      { id: "corona-long-neck", nome: "Corona Long Neck", preco: 10 },
    ],
  },
  {
    categoria: "Bebidas Quentes (Quartinho)",
    itens: [
      { id: "alcatrao-quartinho", nome: "Alcatrão", preco: 8 },
      { id: "misturada-quartinho", nome: "Misturada", preco: 6 },
      { id: "vodka-quartinho", nome: "Vodka", preco: 7 },
      { id: "pitu-com-limao-quartinho", nome: "Pitu com Limão", preco: 7 },
      { id: "pitu-quartinho", nome: "Pitu", preco: 6 },
    ],
  },
  {
    categoria: "Bebidas Quentes (Dose)",
    itens: [
      { id: "alcatrao-dose", nome: "Alcatrão", preco: 2 },
      { id: "misturada-dose", nome: "Misturada", preco: 2 },
      { id: "vodka-dose", nome: "Vodka", preco: 2 },
      { id: "pitu-dose", nome: "Pitu", preco: 2 },
      { id: "whisky-dose", nome: "Whisky", preco: 8 },
    ],
  },
];
// Lojas criadas pelo site da IFTech: cardápio de exemplo de um restaurante de almoço com bebidas.
// O dono muda nomes e preços (ou apaga) depois, em Produtos. Os pratos já vêm com a montagem de almoço.
const M = (itens) => itens.map((i) => ({ ...i, montagem: MONTAGEM_ALMOCO }));
export const produtosAlmoco = [
  { categoria: "Pratos do dia", itens: M([
    { nome: "Frango grelhado", preco: 22 }, { nome: "Bife acebolado", preco: 25 }, { nome: "Peixe frito", preco: 26 },
    { nome: "Carne de sol com macaxeira", preco: 28 }, { nome: "Strogonoff de frango", preco: 22 }, { nome: "Feijoada", preco: 28 },
  ]) },
  { categoria: "Prato feito (PF)", itens: M([{ nome: "PF de frango", preco: 18 }, { nome: "PF de carne", preco: 20 }]) },
  { categoria: "Acompanhamentos", itens: [
    { nome: "Arroz", preco: 6 }, { nome: "Feijão", preco: 6 }, { nome: "Farofa", preco: 5 }, { nome: "Salada", preco: 7 }, { nome: "Batata frita", preco: 12 },
  ] },
  { categoria: "Sucos", itens: [{ nome: "Suco de laranja", preco: 8 }, { nome: "Suco de maracujá", preco: 8 }, { nome: "Suco de acerola", preco: 8 }, { nome: "Suco de cajá", preco: 8 }] },
  { categoria: "Refrigerantes e água", itens: [{ nome: "Refrigerante lata", preco: 6 }, { nome: "Refrigerante 1L", preco: 10 }, { nome: "Água mineral", preco: 4 }, { nome: "Água com gás", preco: 5 }] },
  { categoria: "Cervejas", itens: [{ nome: "Cerveja long neck", preco: 9 }, { nome: "Cerveja lata", preco: 6 }] },
  { categoria: "Sobremesas", itens: [{ nome: "Pudim", preco: 8 }, { nome: "Mousse de maracujá", preco: 7 }, { nome: "Cocada", preco: 5 }] },
];

// ---------- categorias prontas e cardápios de exemplo por negócio (lojas da IFTech) ----------
// Cada categoria pronta já vem com o tipo dos produtos e as opções de exemplo. O dono muda nomes,
// sabores e preços depois, em Produtos. Ao pôr uma categoria pronta, produtos com o mesmo nome não são repetidos.
const SABOR = (opcoes) => ({ vem: [], escolhas: [{ nome: "Sabor", opcoes }], extras: [] });
export const CATEGORIAS_PRONTAS = [
  { id: "pratos", emoji: "🍛", categoria: "Pratos do dia", tipo: "prato", itens: produtosAlmoco[0].itens },
  { id: "pf", emoji: "🍽️", categoria: "Prato feito (PF)", tipo: "prato", itens: produtosAlmoco[1].itens },
  { id: "acompanhamentos", emoji: "🍚", categoria: "Acompanhamentos", tipo: "simples", itens: produtosAlmoco[2].itens },
  {
    id: "sucos", emoji: "🧃", categoria: "Sucos", tipo: "sabor",
    itens: [
      { nome: "Suco natural (copo)", preco: 8, montagem: SABOR(["Laranja", "Maracujá", "Acerola", "Cajá", "Goiaba"]) },
      { nome: "Suco natural (jarra)", preco: 18, montagem: SABOR(["Laranja", "Maracujá", "Acerola", "Cajá", "Goiaba"]) },
    ],
  },
  { id: "refrigerantes", emoji: "🥤", categoria: "Refrigerantes e água", tipo: "simples", itens: produtosAlmoco[4].itens },
  { id: "cervejas", emoji: "🍺", categoria: "Cervejas", tipo: "simples", itens: produtosAlmoco[5].itens },
  { id: "sobremesas", emoji: "🍮", categoria: "Sobremesas", tipo: "simples", itens: produtosAlmoco[6].itens },
  {
    id: "picoles", emoji: "🍡", categoria: "Picolés", tipo: "sabor",
    itens: [
      { nome: "Picolé de fruta", preco: 4, montagem: SABOR(["Coco", "Morango", "Limão", "Uva", "Cajá", "Graviola"]) },
      { nome: "Picolé ao leite", preco: 5, montagem: SABOR(["Chocolate", "Morango", "Milho verde", "Coco queimado", "Flocos"]) },
      { nome: "Picolé recheado", preco: 7, montagem: SABOR(["Chocolate com morango", "Doce de leite", "Brigadeiro"]) },
    ],
  },
  {
    id: "sorvetes", emoji: "🍨", categoria: "Sorvetes", tipo: "recheio",
    itens: [
      {
        nome: "Sorvete",
        preco: 6,
        montagem: {
          vem: [],
          escolhas: [
            { nome: "Tamanho", opcoes: ["1 bola", "2 bolas", "3 bolas"], precos: { "2 bolas": 4, "3 bolas": 8 } },
            { nome: "Sabor", opcoes: ["Creme", "Chocolate", "Morango", "Flocos", "Napolitano"] },
          ],
          extras: [{ nome: "Calda", preco: 2 }, { nome: "Casquinha", preco: 1 }],
        },
      },
    ],
  },
  {
    id: "acai", emoji: "🍇", categoria: "Açaí", tipo: "recheio",
    itens: [
      {
        nome: "Açaí",
        preco: 12,
        montagem: {
          vem: [],
          escolhas: [{ nome: "Tamanho", opcoes: ["300 ml", "500 ml", "700 ml"], precos: { "500 ml": 6, "700 ml": 11 } }],
          extras: [{ nome: "Leite em pó", preco: 2 }, { nome: "Granola", preco: 2 }, { nome: "Leite condensado", preco: 2 }, { nome: "Banana", preco: 2 }, { nome: "Paçoca", preco: 2 }],
        },
      },
    ],
  },
  {
    id: "tapiocas", emoji: "🫓", categoria: "Tapiocas", tipo: "recheio",
    itens: [
      {
        nome: "Tapioca",
        preco: 6,
        montagem: {
          vem: [],
          escolhas: [{ nome: "Recheio", opcoes: ["Manteiga", "Queijo coalho", "Frango com catupiry", "Carne de sol com queijo", "Coco com leite condensado"], precos: { "Queijo coalho": 3, "Frango com catupiry": 5, "Carne de sol com queijo": 8, "Coco com leite condensado": 4 } }],
          extras: [{ nome: "Ovo", preco: 2 }, { nome: "Queijo a mais", preco: 3 }],
        },
      },
    ],
  },
  {
    id: "cuscuz", emoji: "🌽", categoria: "Cuscuz", tipo: "recheio",
    itens: [
      {
        nome: "Cuscuz recheado",
        preco: 8,
        montagem: {
          vem: [],
          escolhas: [{ nome: "Recheio", opcoes: ["Ovo", "Queijo coalho", "Calabresa", "Charque", "Carne de sol"], precos: { "Queijo coalho": 2, Calabresa: 3, Charque: 5, "Carne de sol": 6 } }],
          extras: [{ nome: "Manteiga", preco: 1 }],
        },
      },
    ],
  },
  {
    id: "lanches", emoji: "🥟", categoria: "Lanches e salgados", tipo: "simples",
    itens: [
      { nome: "Coxinha", preco: 6 },
      { nome: "Enroladinho de salsicha", preco: 5 },
      { nome: "Pastel", preco: 7, tipo: "recheio", montagem: { vem: [], escolhas: [{ nome: "Recheio", opcoes: ["Queijo", "Carne", "Frango", "Pizza"], precos: { Carne: 1, Frango: 1, Pizza: 2 } }], extras: [] } },
      { nome: "Misto quente", preco: 7 },
    ],
  },
  {
    id: "doces", emoji: "🍰", categoria: "Doces e bolos", tipo: "simples",
    itens: [
      { nome: "Fatia de bolo", preco: 7 },
      { nome: "Bolo de pote", preco: 9 },
      { nome: "Brigadeiro", preco: 2.5 },
      { nome: "Torta (fatia)", preco: 10 },
    ],
  },
];

/** Cardápios de exemplo para a loja nova: escolha o negócio e as categorias prontas entram nessa ordem. */
export const CARDAPIOS_EXEMPLO = [
  { id: "almoco", emoji: "🍛", nome: "Almoço", descricao: "Pratos do dia, PF, acompanhamentos, sucos, refrigerantes, cervejas e sobremesas.", categorias: ["pratos", "pf", "acompanhamentos", "sucos", "refrigerantes", "cervejas", "sobremesas"] },
  { id: "almoco-picole", emoji: "🍡", nome: "Almoço + picolés e sobremesas", descricao: "O almoço completo e mais picolés, sorvetes e sobremesas.", categorias: ["pratos", "pf", "acompanhamentos", "sucos", "refrigerantes", "cervejas", "picoles", "sorvetes", "sobremesas"] },
  { id: "lanchonete", emoji: "🫓", nome: "Tapiocaria e lanchonete", descricao: "Tapiocas, cuscuz recheado, lanches e salgados, sucos e refrigerantes.", categorias: ["tapiocas", "cuscuz", "lanches", "sucos", "refrigerantes"] },
  { id: "doces", emoji: "🍨", nome: "Sobremesas, sorvetes e açaí", descricao: "Açaí, sorvetes, picolés, doces e bolos, sobremesas e bebidas.", categorias: ["acai", "sorvetes", "picoles", "doces", "sobremesas", "refrigerantes"] },
];
