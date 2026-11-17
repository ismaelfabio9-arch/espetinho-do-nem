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
  return { tirar: [], escolhas, extras: [] };
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
  return partes.length ? `${produto.nome} — ${partes.join(", ")}` : produto.nome;
}

export function precoMontado(produto, escolha) {
  const m = produto?.montagem || {};
  const extras = (m.extras || []).filter((e) => (escolha?.extras || []).includes(e.nome));
  return Number(produto.preco || 0) + extras.reduce((s, e) => s + Number(e.preco || 0), 0);
}

// ---------- edição em Produtos (texto simples) ----------

/** Texto → montagem. "Vem: Arroz, Feijão" / escolhas "Feijão: Carioca, Preto" / a mais "Ovo = 2". */
export function lerMontagem({ vem, escolhas, extras }) {
  const lista = (t) => String(t || "").split(",").map((s) => s.trim()).filter(Boolean);
  const m = {
    vem: lista(vem).slice(0, 12),
    escolhas: String(escolhas || "")
      .split("\n")
      .map((linha) => {
        const [nome, ops] = linha.split(":");
        return { nome: (nome || "").trim(), opcoes: lista(ops).slice(0, 10) };
      })
      .filter((g) => g.nome && g.opcoes.length)
      .slice(0, 6),
    extras: String(extras || "")
      .split("\n")
      .map((linha) => {
        const [nome, preco] = linha.split("=");
        const valor = Number(String(preco || "0").replace(",", ".").replace(/[^\d.]/g, ""));
        return { nome: (nome || "").trim(), preco: Number.isFinite(valor) ? Math.round(valor * 100) / 100 : 0 };
      })
      .filter((e) => e.nome)
      .slice(0, 12),
  };
  return m.vem.length || m.escolhas.length || m.extras.length ? m : null;
}

export function textoMontagem(m) {
  return {
    vem: (m?.vem || []).join(", "),
    escolhas: (m?.escolhas || []).map((g) => `${g.nome}: ${(g.opcoes || []).join(", ")}`).join("\n"),
    extras: (m?.extras || []).map((e) => `${e.nome} = ${String(e.preco).replace(".", ",")}`).join("\n"),
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
