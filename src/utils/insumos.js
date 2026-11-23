// Estoque de matéria-prima (insumos) com baixa automática pela ficha técnica.
//
// - insumos/<id>: { nome, unidade: "kg" | "L" | "un", quantidade, minimo, custo (R$ por unidade), ativo }
//   A quantidade fica na unidade do insumo (kg, litro ou unidade). Não zera ao encerrar o dia
//   (o estoque por produto, "estoque/", é o do dia e continua como era).
// - fichas/<produtoId>: { itens: [{ insumoId, qtd }] } — quanto de cada insumo vai em 1 unidade do
//   produto, na unidade do insumo (300 g de carne = 0,3 kg).
//   variaPor (opcional): o ingrediente que muda com uma escolha do produto (ex.: o peixe pelo tamanho):
//   { grupo: "Tamanho", opcoes: ["Pequeno", "Médio", "Grande"], itens: [{ insumoId, qtd: { Pequeno: 0.2, … } }] }.
//   Cada opção usa os itens de sempre + a quantidade dela; sem opção escolhida, vale a 1ª.
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

/** Opção da escolha que muda a quantidade (ex.: "Grande"); sem opção válida, a 1ª. */
export function opcaoDaVaria(ficha, opcao) {
  const ops = ficha?.variaPor?.opcoes || [];
  return opcao && ops.includes(opcao) ? opcao : ops[0] || null;
}

/** Ingredientes de 1 unidade numa opção: os de sempre + o que muda com a escolha (ex.: 300 g de peixe no Médio). */
export function itensDaOpcao(ficha, opcao) {
  const base = itensJuntos(ficha);
  const v = ficha?.variaPor;
  if (!v || !(v.itens || []).length) return base;
  const op = opcaoDaVaria(ficha, opcao);
  const extra = (v.itens || []).map((it) => ({ insumoId: it.insumoId, qtd: Number(it.qtd?.[op] || 0) })).filter((x) => x.insumoId && x.qtd > 0);
  return [...base, ...extra];
}

/** Custo de cada opção da escolha que muda a quantidade: [{ opcao, custo }] (null sem essa escolha). */
export function custosPorOpcao(ficha, insumosPorId) {
  const v = ficha?.variaPor;
  if (!v || !(v.itens || []).length || !(v.opcoes || []).length) return null;
  return v.opcoes.map((opcao) => ({ opcao, custo: custoDaFicha(ficha, insumosPorId, opcao) }));
}

/** Custo de 1 unidade do produto pela ficha (null se faltar preço de algum insumo). Com tamanho: o da opção (sem opção, a 1ª). */
export function custoDaFicha(ficha, insumosPorId, opcao) {
  const itens = itensDaOpcao(ficha, opcao);
  if (!itens.length) return null;
  let total = 0;
  for (const it of itens) {
    const ins = insumosPorId[it.insumoId];
    if (!ins || typeof ins.custo !== "number") return null;
    total += Number(it.qtd || 0) * ins.custo;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Lista única de ingredientes do produto. Fichas salvas quando havia ingredientes por recheio/adicional
 * (opcoes) entram juntas na lista (sem repetir o mesmo ingrediente): nada fica escondido na conta.
 */
export function itensJuntos(ficha) {
  const out = [...(ficha?.itens || [])];
  (ficha?.opcoes || []).forEach((o) => (o.itens || []).forEach((it) => {
    if (it?.insumoId && !out.some((x) => x.insumoId === it.insumoId)) out.push(it);
  }));
  return out;
}

/** O que sai do estoque em 1 unidade vendida: com tamanho, o do tamanho que o cliente escolheu. */
export function itensDaVenda(ficha, item) {
  const grupo = ficha?.variaPor?.grupo;
  const esc = grupo ? item?.montagem?.escolhas?.[grupo] : null;
  return itensDaOpcao(ficha, Array.isArray(esc) ? esc[0] : esc);
}

/** Soma o que cada insumo gasta nos itens vendidos: { insumoId: qtd }. */
export function consumoDosItens(itens, fichas) {
  const out = {};
  (itens || []).forEach((item) => {
    const ficha = fichas[item.produtoId];
    const usados = itensDaVenda(ficha, item);
    if (!usados.length) return;
    const q = qtdItem(item);
    usados.forEach((it) => {
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
/**
 * Entrada de compra: soma no estoque e atualiza o preço. modo "media": média do que já tinha com a compra
 * (o certo para o estoque); modo "ultimo": o preço desta compra (quando o preço muda muito, como a carne).
 * Guarda a última compra para mostrar ("5 kg por R$ 150,00 em 21/11").
 */
export async function entradaInsumo(insumo, qtd, valorPago, por, modo = "media") {
  const q = r3(Number(qtd || 0));
  if (!(q > 0)) throw new Error("quantidade");
  const valor = Math.round(Number(valorPago || 0) * 100) / 100;
  const custo = novoCustoCompra(insumo, q, valor, modo);
  const agora = new Date().toISOString();
  await updateDoc(doc(db, ...L(), "insumos", insumo.id), {
    quantidade: increment(q),
    ...(custo !== null ? { custo: Math.round(custo * 10000) / 10000 } : {}),
    ...(valor > 0 ? { ultimaCompra: { qtd: q, valor, em: agora, porUnidade: Math.round((valor / q) * 10000) / 10000 } } : {}),
    atualizadoEm: agora,
  });
  await addDoc(collection(db, ...L(), "insumosMov"), { insumoId: insumo.id, nome: insumo.nome, tipo: "compra", qtd: q, valor, em: agora, por: por || "", criadoEm: serverTimestamp() });
}

/** Preço por unidade depois da compra (null quando não muda: compra sem valor). */
export function novoCustoCompra(insumo, q, valor, modo = "media") {
  const atual = Math.max(0, Number(insumo.quantidade || 0));
  const custoAtual = typeof insumo.custo === "number" ? insumo.custo : null;
  if (!(valor > 0) || !(q > 0)) return custoAtual;
  if (modo === "ultimo" || custoAtual === null || atual <= 0) return valor / q;
  return (atual * custoAtual + valor) / (atual + q);
}

/** Valor em R$ do que saiu/entrou num ajuste (pelo preço do insumo na hora). Negativo = prejuízo. */
function valorMov(insumo, qtdComSinal) {
  if (typeof insumo.custo !== "number") return {};
  return { valorAjuste: Math.round(qtdComSinal * insumo.custo * 100) / 100, custoNaHora: insumo.custo };
}

/** Perda (estragou, caiu, venceu) ou contagem (a quantidade real que tem na prateleira). */
export async function ajustarInsumo(insumo, tipo, qtd, motivo, por) {
  const q = r3(Number(qtd || 0));
  const agora = new Date().toISOString();
  const atual = Number(insumo.quantidade || 0);
  if (tipo === "perda") {
    if (!(q > 0)) throw new Error("quantidade");
    await updateDoc(doc(db, ...L(), "insumos", insumo.id), { quantidade: increment(-q), atualizadoEm: agora });
    await addDoc(collection(db, ...L(), "insumosMov"), { insumoId: insumo.id, nome: insumo.nome, tipo: "perda", qtd: -q, ...valorMov(insumo, -q), motivo: motivo || "", em: agora, por: por || "", criadoEm: serverTimestamp() });
  } else {
    if (!(q >= 0)) throw new Error("quantidade");
    await updateDoc(doc(db, ...L(), "insumos", insumo.id), { quantidade: q, atualizadoEm: agora });
    await addDoc(collection(db, ...L(), "insumosMov"), { insumoId: insumo.id, nome: insumo.nome, tipo: "contagem", qtd: r3(q - atual), ...valorMov(insumo, q - atual), antes: atual, depois: q, motivo: motivo || "", em: agora, por: por || "", criadoEm: serverTimestamp() });
  }
}

/**
 * Inventário: grava a contagem de vários insumos de uma vez. contagens = [{ insumo, qtd }].
 * Só grava o que mudou; devolve quantos mudaram.
 */
export async function inventario(contagens, por) {
  let mudou = 0;
  for (const { insumo, qtd } of contagens) {
    const q = r3(Number(qtd));
    if (!Number.isFinite(q) || q < 0) continue;
    if (r3(Number(insumo.quantidade || 0)) === q) continue;
    await ajustarInsumo(insumo, "contagem", q, "Inventário", por);
    mudou += 1;
  }
  return mudou;
}

/** Quantas unidades do produto dá para fazer com o estoque de hoje (null sem ficha). */
export function daParaQuantos(ficha, insumosPorId) {
  const itens = itensDaOpcao(ficha).filter((it) => Number(it.qtd) > 0);
  if (!itens.length) return null;
  let min = Infinity;
  let limitante = null;
  for (const it of itens) {
    const ins = insumosPorId[it.insumoId];
    if (!ins) return null;
    const n = Math.max(0, Math.floor((Number(ins.quantidade || 0) + 1e-9) / Number(it.qtd)));
    if (n < min) {
      min = n;
      limitante = ins.nome;
    }
  }
  return { quantos: min, limitante };
}

/**
 * Consumo médio por dia de cada insumo nas vendas dos últimos `dias` dias e em quantos dias acaba.
 * movs: insumosMov. Devolve { [insumoId]: { porDia, acabaEm } } (acabaEm null sem consumo).
 */
export function previsao(insumos, movs, dias = 14, agora = Date.now()) {
  const desde = new Date(agora - dias * 86400000).toISOString();
  const gasto = {};
  (movs || []).forEach((m) => {
    if (m.tipo !== "venda" || String(m.em) < desde) return;
    gasto[m.insumoId] = (gasto[m.insumoId] || 0) + Math.abs(Number(m.qtd || 0));
  });
  const out = {};
  (insumos || []).forEach((i) => {
    const porDia = (gasto[i.id] || 0) / dias;
    out[i.id] = { porDia: r3(porDia), acabaEm: porDia > 0 ? Math.max(0, Math.floor(Number(i.quantidade || 0) / porDia)) : null };
  });
  return out;
}

/**
 * Perdas em R$ no período (AAAA-MM-DD, horário do aparelho): o que foi lançado como perda e o que faltou
 * nas contagens. Sobra na contagem não vira lucro (só corrige o estoque).
 */
export function perdasNoPeriodo(movs, de, ate) {
  const dia = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  let perdas = 0;
  let faltas = 0;
  const lista = [];
  (movs || []).forEach((m) => {
    if (!m.em || typeof m.valorAjuste !== "number" || m.valorAjuste >= 0) return;
    const d = dia(m.em);
    if ((de && d < de) || (ate && d > ate)) return;
    if (m.tipo === "perda") perdas += -m.valorAjuste;
    else if (m.tipo === "contagem") faltas += -m.valorAjuste;
    else return;
    lista.push(m);
  });
  return { perdas: Math.round(perdas * 100) / 100, faltas: Math.round(faltas * 100) / 100, total: Math.round((perdas + faltas) * 100) / 100, lista: lista.sort((a, b) => String(b.em).localeCompare(String(a.em))) };
}
