// Caixa (gaveta de dinheiro): abre com o troco, registra sangria (tirou dinheiro da gaveta) e
// suprimento (colocou troco), e fecha conferindo o dinheiro contado com o que deveria ter.
//
// - caixas/<id>: { status: "aberto" | "fechado", abertoEm, abertoPor, valorInicial,
//   fechadoEm?, fechadoPor?, contado?, esperado?, diferenca?, resumo?, obs? }
// - caixaMov/<id>: { caixaId, tipo: "sangria" | "suprimento", valor, motivo, em, por }
// Vendas do caixa: as finalizadas entre a abertura e o fechamento (vendasDia + dias encerrados).
// Só "Dinheiro" mexe na gaveta; Pix e cartão aparecem para conferir com o banco e a maquininha.

const r2 = (v) => Math.round(v * 100) / 100;
export const FORMAS_CAIXA = ["Dinheiro", "Pix", "Débito", "Crédito"];

/** Vendas finalizadas dentro do caixa (ISO de abertura e, se fechado, de fechamento). */
export function vendasDoCaixa(caixa, diasFechados, vendasHoje) {
  const de = String(caixa?.abertoEm || "");
  const ate = caixa?.fechadoEm ? String(caixa.fechadoEm) : null;
  const todas = [...(diasFechados || []).flatMap((d) => d.vendasDia || []), ...(vendasHoje || [])];
  const vistas = new Set();
  return todas.filter((v) => {
    const em = String(v.finalizadoEm || "");
    if (!em || em < de || (ate && em > ate)) return false;
    // A mesma venda pode estar no dia aberto e no encerrado por um instante: conta uma vez.
    const chave = `${em}|${v.total}|${v.titulo || ""}|${v.mesa || ""}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

export function resumoCaixa(caixa, vendas, movs) {
  const porForma = {};
  let total = 0;
  (vendas || []).forEach((v) => {
    const forma = v.formaPagamento || "Não informado";
    const valor = Number(v.total || 0) + Number(v.taxaCartao || 0);
    porForma[forma] = r2((porForma[forma] || 0) + valor);
    total += valor;
  });
  const meus = (movs || []).filter((m) => m.caixaId === caixa?.id);
  const suprimentos = r2(meus.filter((m) => m.tipo === "suprimento").reduce((s, m) => s + Number(m.valor || 0), 0));
  const sangrias = r2(meus.filter((m) => m.tipo === "sangria").reduce((s, m) => s + Number(m.valor || 0), 0));
  const inicial = Number(caixa?.valorInicial || 0);
  const dinheiro = porForma.Dinheiro || 0;
  const formas = [...FORMAS_CAIXA, ...Object.keys(porForma).filter((f) => !FORMAS_CAIXA.includes(f))]
    .filter((f) => porForma[f] || FORMAS_CAIXA.includes(f))
    .map((f) => ({ nome: f, valor: porForma[f] || 0 }));
  return {
    pedidos: (vendas || []).length,
    total: r2(total),
    formas,
    inicial: r2(inicial),
    dinheiro: r2(dinheiro),
    suprimentos,
    sangrias,
    esperado: r2(inicial + dinheiro + suprimentos - sangrias),
    movimentos: meus.sort((a, b) => String(a.em).localeCompare(String(b.em))),
  };
}
