// Saídas de alimento sem venda ("sangria de alimento"): queimou, estragou, caiu, doação, refeição da equipe…
// Pode ser de um ingrediente (2 kg de carne estragou) ou de um produto pronto (3 marmitas M doadas): o produto
// tira do estoque os ingredientes da ficha técnica, como uma venda, e o valor é o custo desses ingredientes.
// Tudo fica no histórico de ingredientes (insumosMov, tipo "perda") com motivoId; o que é do mesmo lançamento
// tem o mesmo perdaId. Entra nas Perdas (Estoque) e no lucro em Finanças.
import { collection, doc, getDoc, increment, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";
import { itensDaOpcao, itensMontados, mostrarQtd, rendimentoDe } from "./insumos";
import { registrar } from "./registro";

export const MOTIVOS = [
  { id: "queimou", nome: "Queimou", emoji: "🔥", grupo: "perda" },
  { id: "estragou", nome: "Estragou / venceu", emoji: "🤢", grupo: "perda" },
  { id: "caiu", nome: "Caiu / derramou", emoji: "💥", grupo: "perda" },
  { id: "errado", nome: "Saiu errado / cliente devolveu", emoji: "↩️", grupo: "perda" },
  { id: "sobra", nome: "Sobrou e jogou fora", emoji: "🗑️", grupo: "perda" },
  { id: "doacao", nome: "Doação", emoji: "🤝", grupo: "saida" },
  { id: "equipe", nome: "Refeição da equipe", emoji: "👨‍🍳", grupo: "saida" },
  { id: "cortesia", nome: "Cortesia para cliente", emoji: "🎁", grupo: "saida" },
  { id: "dono", nome: "Consumo do dono / família", emoji: "🏠", grupo: "saida" },
  { id: "outro", nome: "Outro motivo", emoji: "📝", grupo: "perda" },
];
export const motivoDe = (id) => MOTIVOS.find((m) => m.id === id) || MOTIVOS[MOTIVOS.length - 1];

const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const novoId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** O que sai do estoque e quanto custa: [{ insumo, cru, valor|null }] e o total (null se faltar preço). */
export function contaDaPerda({ ficha, opcao, qtdProduto, insumo, qtdInsumo }, insumosPorId) {
  const linhas = [];
  if (insumo) {
    const q = r3(Number(qtdInsumo || 0));
    if (q > 0) linhas.push({ insumo, cru: q, valor: typeof insumo.custo === "number" ? r2(q * insumo.custo) : null });
  } else {
    const n = Number(qtdProduto || 0);
    itensMontados(itensDaOpcao(ficha, opcao), null).forEach((it) => {
      const ins = insumosPorId[it.insumoId];
      if (!ins || !(Number(it.qtd) > 0) || !(n > 0)) return;
      const cru = r3((Number(it.qtd) * n) / rendimentoDe(ins));
      linhas.push({ insumo: ins, cru, valor: typeof ins.custo === "number" ? r2(cru * ins.custo) : null });
    });
  }
  const semPreco = linhas.filter((l) => l.valor === null).map((l) => l.insumo.nome);
  const total = r2(linhas.reduce((s, l) => s + (l.valor || 0), 0));
  return { linhas, total, semPreco };
}

/** "2× Guisado de boi (Marmita M)" ou "Arroz 1 kg": como o item aparece no relatório. */
export function descricaoItem(it) {
  if (it.produto) return `${it.qtdProduto}× ${it.produto.nome}${it.opcao ? ` (${it.opcao})` : ""}`;
  const u = it.insumo?.unidade;
  const q = Number(it.qtdInsumo || 0);
  const txt = u === "un" ? `${q} un` : q < 1 ? `${Math.round(q * 1000)} ${u === "L" ? "ml" : "g"}` : `${String(r3(q)).replace(".", ",")} ${u === "L" ? "L" : "kg"}`;
  return `${it.insumo?.nome || ""} ${txt}`;
}

/**
 * Registra a saída: vários itens no mesmo lançamento (2 marmitas + 1 kg de arroz…), todos com o mesmo motivo.
 * dados: { motivoId, obs, por, itens: [{ produto?, opcao?, qtdProduto?, ficha?, insumo?, qtdInsumo? }] }.
 */
export async function registrarPerda(dados, insumosPorId) {
  const m = motivoDe(dados.motivoId);
  const agora = new Date().toISOString();
  const perdaId = novoId();
  const obs = String(dados.obs || "").trim().slice(0, 120);
  const itens = dados.itens || [dados];
  const batch = writeBatch(db);
  let total = 0;
  // O mesmo ingrediente em dois itens: soma na hora de tirar do estoque.
  const tirar = new Map();
  itens.forEach((it) => {
    const conta = contaDaPerda(it, insumosPorId);
    total += conta.total;
    const produto = it.produto || null;
    const comum = {
      tipo: "perda",
      perdaId,
      motivoId: m.id,
      motivo: `${m.nome}${obs ? ` · ${obs}` : ""}`,
      grupo: m.grupo,
      itemDesc: descricaoItem(it),
      ...(produto ? { produtoId: produto.id, produtoNome: produto.nome, qtdProduto: Number(it.qtdProduto || 0), ...(it.opcao ? { opcao: it.opcao } : {}) } : {}),
      em: agora,
      por: dados.por || "",
    };
    conta.linhas.forEach((l) => {
      tirar.set(l.insumo.id, r3((tirar.get(l.insumo.id) || 0) + l.cru));
      batch.set(doc(collection(db, ...L(), "insumosMov")), {
        ...comum,
        insumoId: l.insumo.id,
        nome: l.insumo.nome,
        qtd: -l.cru,
        ...(l.valor !== null ? { valorAjuste: -l.valor, custoNaHora: l.insumo.custo } : {}),
        criadoEm: serverTimestamp(),
      });
    });
    // Produto sem ficha: fica registrado mesmo assim, sem valor.
    if (!conta.linhas.length && produto) batch.set(doc(collection(db, ...L(), "insumosMov")), { ...comum, insumoId: "", nome: produto.nome, qtd: 0, semFicha: true, criadoEm: serverTimestamp() });
  });
  tirar.forEach((q, id) => batch.update(doc(db, ...L(), "insumos", id), { quantidade: increment(-q), atualizadoEm: agora }));
  await batch.commit();
  registrar({
    area: "comida",
    acao: m.grupo === "saida" ? "Saída sem venda" : "Perda de alimento",
    texto: itens.map(descricaoItem).join(" + "),
    valor: -r2(total),
    motivo: `${m.nome}${obs ? ` · ${obs}` : ""}`,
    detalhes: [...tirar.entries()].map(([id, q]) => `Saiu ${insumosPorId[id]?.nome || "ingrediente"}: ${mostrarQtd(q, insumosPorId[id]?.unidade)}`),
  });
  // Produto pronto com estoque do dia: também sai de lá.
  for (const it of itens) {
    if (!it.produto) continue;
    const ref = doc(db, ...L(), "estoque", it.produto.id);
    const s = await getDoc(ref).catch(() => null);
    if (s?.exists() && Number(s.data().quantidade || 0) > 0) {
      await updateDoc(ref, { quantidade: Math.max(0, Number(s.data().quantidade || 0) - Number(it.qtdProduto || 0)), atualizadoEm: agora }).catch(() => {});
    }
  }
  return { perdaId, total: r2(total) };
}

const diaDe = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Resumo das saídas no período: cada lançamento (perdaId) vira uma linha com o produto ou o ingrediente,
 * o motivo e o valor. Perdas antigas (sem perdaId) entram como "Outro motivo" com o texto que foi escrito.
 */
export function resumoSaidas(movs, de, ate) {
  const porLanc = new Map();
  (movs || []).forEach((mv) => {
    if (mv.tipo !== "perda" || !mv.em) return;
    const d = diaDe(mv.em);
    if ((de && d < de) || (ate && d > ate)) return;
    const chave = mv.perdaId || mv.id;
    let l = porLanc.get(chave);
    if (!l) {
      const m = motivoDe(mv.motivoId);
      l = {
        id: chave,
        em: mv.em,
        motivoId: m.id,
        motivo: mv.motivoId ? mv.motivo : `${m.nome}${mv.motivo ? ` · ${mv.motivo}` : ""}`,
        grupo: mv.grupo || m.grupo,
        produtoNome: mv.produtoNome || "",
        qtdProduto: mv.qtdProduto || 0,
        opcao: mv.opcao || "",
        itens: [],
        descricoes: [],
        valor: 0,
        semPreco: false,
        por: mv.por || "",
      };
      porLanc.set(chave, l);
    }
    if (mv.insumoId) l.itens.push({ nome: mv.nome, insumoId: mv.insumoId, qtd: Math.abs(Number(mv.qtd || 0)) });
    if (mv.itemDesc && !l.descricoes.includes(mv.itemDesc)) l.descricoes.push(mv.itemDesc);
    if (typeof mv.valorAjuste === "number") l.valor = r2(l.valor - mv.valorAjuste);
    else l.semPreco = true;
  });
  const lista = [...porLanc.values()].sort((a, b) => String(b.em).localeCompare(String(a.em)));
  const porMotivo = MOTIVOS.map((m) => {
    const ls = lista.filter((l) => l.motivoId === m.id);
    return { ...m, vezes: ls.length, valor: r2(ls.reduce((s, l) => s + l.valor, 0)) };
  }).filter((x) => x.vezes > 0).sort((a, b) => b.valor - a.valor);
  const perdas = r2(lista.filter((l) => l.grupo !== "saida").reduce((s, l) => s + l.valor, 0));
  const saidas = r2(lista.filter((l) => l.grupo === "saida").reduce((s, l) => s + l.valor, 0));
  return { lista, porMotivo, perdas, saidas, total: r2(perdas + saidas) };
}

