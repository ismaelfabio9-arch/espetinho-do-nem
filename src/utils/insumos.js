// Estoque de matéria-prima (insumos) com baixa automática pela ficha técnica.
//
// - insumos/<id>: { nome, unidade: "kg" | "L" | "un", quantidade, minimo, custo (R$ por unidade), ativo }
//   A quantidade fica na unidade do insumo (kg, litro ou unidade). Não zera ao encerrar o dia
//   (o estoque por produto, "estoque/", é o do dia e continua como era).
// - fichas/<produtoId>: { itens: [{ insumoId, qtd }] } — quanto de cada insumo vai em 1 unidade do
//   produto, na unidade do insumo (300 g de carne = 0,3 kg).
// - insumosMov/<id>: histórico { insumoId, nome, tipo: "venda" | "compra" | "perda" | "contagem",
//   qtd (com sinal), antes?, depois?, valor?, motivo?, em, por? }
// Só a equipe lê essas coleções (o cardápio do cliente não vê custo nem receita).
//
// A baixa acontece quando a venda é FECHADA (conta paga / pedido finalizado), com increment()
// no Firestore: dois caixas fechando ao mesmo tempo não se atrapalham.
import { addDoc, collection, doc, getDoc, increment, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";
import { nomeProduto, qtdItem } from "./tipoVenda";

export const UNIDADES = [
  { id: "kg", nome: "kg", sub: "g", fator: 1000, nomeLongo: "quilo" },
  { id: "L", nome: "litro", sub: "ml", fator: 1000, nomeLongo: "litro" },
  { id: "un", nome: "unidade", sub: "un", fator: 1, nomeLongo: "unidade" },
];
export const unidadeDe = (id) => UNIDADES.find((u) => u.id === id) || UNIDADES[2];
const r3 = (v) => Math.round(v * 1000) / 1000;

/** 1,5 kg / 300 g / 12 un, para mostrar. */
export function mostrarQtd(qtd, unidade) {
  const u = unidadeDe(unidade);
  const n = Number(qtd || 0);
  if (u.fator > 1 && Math.abs(n) < 1 && n !== 0) return `${Math.round(n * u.fator).toLocaleString("pt-BR")} ${u.sub}`;
  return `${r3(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${u.id}`;
}

/** Quantidade da ficha digitada em g / ml / un → unidade do insumo (kg / L / un). */
export const daFicha = (valor, unidade) => r3(Number(String(valor || "").replace(",", ".")) / unidadeDe(unidade).fator);
/** Unidade do insumo → g / ml / un para editar a ficha. */
export const paraFicha = (qtd, unidade) => r3(Number(qtd || 0) * unidadeDe(unidade).fator);

/** Custo de 1 unidade do produto pela ficha (null se faltar preço de algum insumo). */
export function custoDaFicha(ficha, insumosPorId) {
  const itens = ficha?.itens || [];
  if (!itens.length) return null;
  let total = 0;
  for (const it of itens) {
    const ins = insumosPorId[it.insumoId];
    if (!ins || typeof ins.custo !== "number") return null;
    total += Number(it.qtd || 0) * ins.custo;
  }
  return Math.round(total * 100) / 100;
}

/** Soma o que cada insumo gasta nos itens vendidos: { insumoId: qtd }. */
export function consumoDosItens(itens, fichas) {
  const out = {};
  (itens || []).forEach((item) => {
    const ficha = fichas[item.produtoId];
    if (!ficha?.itens?.length) return;
    const q = qtdItem(item);
    ficha.itens.forEach((it) => {
      if (!it.insumoId || !(Number(it.qtd) > 0)) return;
      out[it.insumoId] = r3((out[it.insumoId] || 0) + Number(it.qtd) * q);
    });
  });
  return out;
}

/**
 * Venda fechada: tira do estoque de insumos o que a ficha técnica de cada produto usa e avisa quando
 * um insumo chega no mínimo. Nunca lança erro (a venda já foi registrada; falhar aqui não pode travar o caixa).
 */
export async function baixarInsumos(itens, origem = "venda") {
  try {
    const ids = [...new Set((itens || []).map((i) => i.produtoId).filter(Boolean))];
    if (!ids.length) return {};
    const fichas = {};
    await Promise.all(
      ids.map(async (id) => {
        const s = await getDoc(doc(db, ...L(), "fichas", id)).catch(() => null);
        if (s?.exists()) fichas[id] = s.data();
      })
    );
    const consumo = consumoDosItens(itens, fichas);
    const insumoIds = Object.keys(consumo);
    if (!insumoIds.length) return {};
    const antes = {};
    await Promise.all(
      insumoIds.map(async (id) => {
        const s = await getDoc(doc(db, ...L(), "insumos", id)).catch(() => null);
        if (s?.exists()) antes[id] = s.data();
      })
    );
    const batch = writeBatch(db);
    const agora = new Date().toISOString();
    const nomes = (itens || []).map((i) => `${qtdItem(i)}× ${nomeProduto(i)}`).join(", ").slice(0, 200);
    for (const id of insumoIds) {
      if (!antes[id]) continue;
      batch.update(doc(db, ...L(), "insumos", id), { quantidade: increment(-consumo[id]), atualizadoEm: agora });
      batch.set(doc(collection(db, ...L(), "insumosMov")), { insumoId: id, nome: antes[id].nome || "", tipo: origem, qtd: -consumo[id], motivo: nomes, em: agora, criadoEm: serverTimestamp() });
    }
    await batch.commit();
    // Aviso quando passa do mínimo (só na venda que cruzou a linha).
    for (const id of insumoIds) {
      const a = antes[id];
      if (!a) continue;
      const qa = Number(a.quantidade || 0);
      const qd = r3(qa - consumo[id]);
      const min = Number(a.minimo || 0);
      if (qa > min && qd <= min) {
        await addDoc(collection(db, ...L(), "notificacoes"), {
          tipo: "estoque",
          mensagem: qd <= 0 ? `${a.nome} acabou no estoque de matéria-prima` : `${a.nome} está acabando: ${mostrarQtd(qd, a.unidade)}`,
          produto: a.nome,
          lida: false,
          horario: agora,
          criadoEm: serverTimestamp(),
        }).catch(() => undefined);
      }
    }
    return consumo;
  } catch {
    return {};
  }
}

/** Entrada de compra: soma no estoque e atualiza o custo pela média (estoque antigo + compra). */
export async function entradaInsumo(insumo, qtd, valorPago, por) {
  const q = r3(Number(qtd || 0));
  if (!(q > 0)) throw new Error("quantidade");
  const atual = Math.max(0, Number(insumo.quantidade || 0));
  const custoAtual = typeof insumo.custo === "number" ? insumo.custo : null;
  const valor = Math.round(Number(valorPago || 0) * 100) / 100;
  let custo = custoAtual;
  if (valor > 0) custo = custoAtual === null || atual <= 0 ? valor / q : (atual * custoAtual + valor) / (atual + q);
  const agora = new Date().toISOString();
  await updateDoc(doc(db, ...L(), "insumos", insumo.id), { quantidade: increment(q), ...(custo !== null ? { custo: Math.round(custo * 10000) / 10000 } : {}), atualizadoEm: agora });
  await addDoc(collection(db, ...L(), "insumosMov"), { insumoId: insumo.id, nome: insumo.nome, tipo: "compra", qtd: q, valor, em: agora, por: por || "", criadoEm: serverTimestamp() });
}

/** Perda (estragou, caiu, venceu) ou contagem (a quantidade real que tem na prateleira). */
export async function ajustarInsumo(insumo, tipo, qtd, motivo, por) {
  const q = r3(Number(qtd || 0));
  const agora = new Date().toISOString();
  const atual = Number(insumo.quantidade || 0);
  if (tipo === "perda") {
    if (!(q > 0)) throw new Error("quantidade");
    await updateDoc(doc(db, ...L(), "insumos", insumo.id), { quantidade: increment(-q), atualizadoEm: agora });
    await addDoc(collection(db, ...L(), "insumosMov"), { insumoId: insumo.id, nome: insumo.nome, tipo: "perda", qtd: -q, motivo: motivo || "", em: agora, por: por || "", criadoEm: serverTimestamp() });
  } else {
    if (!(q >= 0)) throw new Error("quantidade");
    await updateDoc(doc(db, ...L(), "insumos", insumo.id), { quantidade: q, atualizadoEm: agora });
    await addDoc(collection(db, ...L(), "insumosMov"), { insumoId: insumo.id, nome: insumo.nome, tipo: "contagem", qtd: r3(q - atual), antes: atual, depois: q, motivo: motivo || "", em: agora, por: por || "", criadoEm: serverTimestamp() });
  }
}
