// Conta da mesa: conta parcial, dividir (igual ou pelo que cada um consumiu) e pagar uma parte.
//
// Pagamento de uma parte fica em mesas/<n>.pagamentos = [{ id, valor, forma, taxaCartao?, taxaCartaoPct?, em, por }]
// (valor = parte da conta; taxaCartao = taxa da maquininha que o cliente pagou junto, fora da conta).
// Ao encerrar, o que falta é cobrado numa forma e a venda guarda tudo em "pagamentos" (o 1º registro
// da mesa); os outros registros da mesma mesa ficam com formaPagamento "Dividido" e não contam de novo.

const c = (v) => Math.round(Number(v || 0) * 100);
const r = (cents) => cents / 100;

/** Total ÷ pessoas, em centavos certos: os centavos que sobram ficam com as primeiras (R$ 100 ÷ 3 = 33,34 + 33,33 + 33,33). */
export function dividirIgual(total, pessoas) {
  const n = Math.max(1, Math.floor(Number(pessoas) || 1));
  const t = c(total);
  const base = Math.floor(t / n);
  const sobra = t - base * n;
  return Array.from({ length: n }, (_, i) => r(base + (i < sobra ? 1 : 0)));
}

/**
 * Pelo que cada um consumiu. unidades: [{ chave, preco }] (cada unidade de cada item);
 * dono: { chave: índice da pessoa | "todos" }. O que é de todos (ou de ninguém ainda) é dividido igual.
 * Devolve { porPessoa: [valor…], semDono: valor (ainda não marcado) }.
 */
export function dividirPorConsumo(unidades, dono, pessoas) {
  const n = Math.max(1, Math.floor(Number(pessoas) || 1));
  const cents = Array(n).fill(0);
  let todos = 0;
  let semDono = 0;
  (unidades || []).forEach((u) => {
    const d = dono?.[u.chave];
    const p = c(u.preco);
    if (Number.isInteger(d) && d >= 0 && d < n) cents[d] += p;
    else if (d === "todos") todos += p;
    else semDono += p;
  });
  dividirIgual(r(todos), n).forEach((v, i) => (cents[i] += c(v)));
  return { porPessoa: cents.map(r), semDono: r(semDono) };
}

/** Soma do que já foi pago da conta (sem a taxa do cartão, que é à parte). */
export const totalPago = (pagamentos) => r((pagamentos || []).reduce((s, p) => s + c(p.valor), 0));

/** Quanto falta (nunca negativo). */
export const falta = (total, pagamentos) => r(Math.max(0, c(total) - c(totalPago(pagamentos))));

/**
 * O que entrou em cada forma numa venda (para o Caixa e as Finanças): [{ forma, valor (com a taxa do
 * cartão), taxaCartaoPct }]. Venda dividida conta pelo "pagamentos"; os outros registros da mesma mesa
 * ("Dividido", sem pagamentos) não contam de novo.
 */
export function partesDaVenda(v) {
  if (Array.isArray(v?.pagamentos) && v.pagamentos.length)
    return v.pagamentos.map((p) => ({ forma: p.forma || "Não informado", valor: r(c(p.valor) + c(p.taxaCartao)), taxaCartaoPct: Number(p.taxaCartaoPct || 0) }));
  if (v?.formaPagamento === "Dividido") return [];
  return [{ forma: v?.formaPagamento || "Não informado", valor: r(c(v?.total) + c(v?.taxaCartao)), taxaCartaoPct: Number(v?.taxaCartaoPct || 0) }];
}

/** "Pix R$ 30,00 + Dinheiro R$ 45,00" (para o comprovante e o histórico). */
export const textoPagamentos = (pagamentos) =>
  (pagamentos || []).map((p) => `${p.forma} R$ ${Number(p.valor || 0).toFixed(2).replace(".", ",")}`).join(" + ");

/**
 * Formas de pagamento escolhidas na tela ([{ forma, valor }]) ajustadas ao valor que o sistema
 * conferiu ao encerrar (ex.: centavos de diferença): a diferença fica na última forma.
 */
export function ajustarPartes(partes, total) {
  const alvo = c(total);
  const lista = (partes || []).filter((p) => c(p.valor) > 0).map((p) => ({ forma: p.forma, valor: r(c(p.valor)) }));
  if (alvo <= 0 || !lista.length) return [];
  const dif = alvo - lista.reduce((s, p) => s + c(p.valor), 0);
  const ultima = lista[lista.length - 1];
  ultima.valor = r(c(ultima.valor) + dif);
  if (ultima.valor <= 0) return [{ forma: lista[0].forma, valor: r(alvo) }];
  return lista;
}
