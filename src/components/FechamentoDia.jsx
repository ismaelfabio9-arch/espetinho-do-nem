// Fechamento do dia (Configurações → Encerrar o dia): antes de encerrar, o resumo de tudo o que aconteceu —
// vendas, gaveta (abriu com, vendas em dinheiro, reforço, sangria), quanto a dona tirou e quanto fica no caixa,
// saída de alimento (kg, g, un e quanto custou), o que acabou e o que foi mexido nas comandas.
// Encerrar com ou sem impressão.
import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";
import { lerValor, isoDia } from "../utils/financas";
import { resumoCaixa, vendasDoCaixa } from "../utils/caixa";
import { resumoSaidas } from "../utils/perdas";
import { useTaxas } from "../utils/taxas";
import { calcularResumoDia } from "./ResumoDia";
import { gerarResumoDiaHTML, imprimir as imprimirCupom } from "../utils/print";
import { useConfigImpressora } from "../hooks/useConfigImpressora";
import "./FechamentoDia.css";

const R = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
const lista = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

/** Quantidade de cada saída: "1,2 kg", "800 g", "2 un" (somando os ingredientes de um mesmo lançamento). */
function qtdDaSaida(s) {
  if (s.produtoNome && s.qtdProduto) return `${s.qtdProduto} un`;
  const kg = s.itens.reduce((t, i) => t + Number(i.qtd || 0), 0);
  if (!kg) return "";
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${String(Math.round(kg * 100) / 100).replace(".", ",")} kg`;
}

/** Junta tudo o que o fechamento mostra e grava. */
export function montarFechamento({ vendas, caixa, movsCaixa, movsIns, ocorrencias, taxas }) {
  const dia = isoDia();
  const r = calcularResumoDia(vendas);
  const rc = caixa ? resumoCaixa(caixa, vendasDoCaixa(caixa, [], vendas), movsCaixa, taxas) : null;
  const saidas = resumoSaidas(movsIns, dia, dia);
  const oc = ocorrencias || [];
  const conta = (tipo) => oc.filter((o) => o.tipo === tipo);
  const somaValor = (l) => Math.round(l.reduce((s, o) => s + Number(o.valor || 0), 0) * 100) / 100;
  return {
    ...r,
    gaveta: rc
      ? {
          inicial: rc.inicial,
          dinheiro: rc.dinheiro,
          reforcos: rc.suprimentos,
          sangrias: rc.sangrias,
          esperado: rc.formas.find((f) => f.nome === "Dinheiro")?.temQueTer ?? rc.inicial + rc.dinheiro + rc.suprimentos - rc.sangrias,
          movimentos: (movsCaixa || []).filter((m) => m.caixaId === caixa.id).map((m) => ({ tipo: m.tipo, valor: Number(m.valor || 0), motivo: m.motivo || "", em: m.em })),
        }
      : null,
    saidas: saidas.lista.map((s) => ({ texto: s.descricoes.join(" + ") || s.itens.map((i) => i.nome).join(", "), motivo: String(s.motivo || "").split(" · ")[0], qtd: qtdDaSaida(s), valor: s.valor, em: s.em })),
    saidasTotal: saidas.total,
    acabou: conta("acabou").map((o) => ({ nome: o.texto, em: o.em })),
    mexido: {
      tirados: conta("tirou").length,
      tiradosValor: somaValor(conta("tirou")),
      saiuDiferente: conta("saiuDiferente").length,
      cortesias: conta("cortesia").length,
      cortesiasValor: somaValor(conta("cortesia")),
      cancelados: conta("cancelou").length,
      canceladosValor: somaValor(conta("cancelou")),
    },
  };
}

export default function FechamentoDia({ onCancelar, onConfirmar, encerrando }) {
  const taxas = useTaxas();
  const [dados, setDados] = useState(null);
  // Divisão do dinheiro da gaveta: fica na gaveta (troco de amanhã), vai para o caixa da loja e a dona tira.
  const [div, setDiv] = useState(null); // { gaveta, caixa, dona } em texto
  const [meta, setMeta] = useState({ metaDona: 0, gavetaPadrao: 0, tiradoMes: 0 });
  const [editMeta, setEditMeta] = useState(false);
  const [metaTxt, setMetaTxt] = useState("");
  const [abertas, setAbertas] = useState({ n: 0, total: 0 });
  const configImpressora = useConfigImpressora();

  useEffect(() => {
    const inicio = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const dia = isoDia();
    Promise.all([
      getDocs(collection(db, ...L(), "vendasDia")),
      getDocs(query(collection(db, ...L(), "caixas"), orderBy("abertoEm", "desc"), limit(5))),
      getDocs(query(collection(db, ...L(), "caixaMov"), where("em", ">=", inicio))),
      getDocs(query(collection(db, ...L(), "insumosMov"), where("em", ">=", inicio))),
      getDocs(query(collection(db, ...L(), "ocorrencias"), where("dia", "==", dia))),
      getDocs(collection(db, ...L(), "pedidos")),
      getDoc(doc(db, ...L(), "configuracoes", "precificacao")).catch(() => null),
      getDocs(query(collection(db, ...L(), "despesas"), where("data", ">=", `${dia.slice(0, 8)}01`))).catch(() => null),
    ])
      .then(([v, c, cm, im, oc, ped, cfg, desp]) => {
        const c0 = cfg?.data?.() || {};
        const tiradoMes = (desp ? lista(desp) : []).filter((d) => d.tipo === "retirada").reduce((t, d) => t + Number(d.valor || 0), 0);
        setMeta({ metaDona: Number(c0.metaDona || 0), gavetaPadrao: Number(c0.gavetaPadrao || 0), tiradoMes: Math.round(tiradoMes * 100) / 100 });
        const caixa = lista(c).find((x) => x.status === "aberto") || null;
        const daMesa = lista(ped).filter((p) => p.tipo === "mesa" && p.mesa != null);
        setAbertas({ n: new Set(daMesa.map((p) => String(p.mesa))).size, total: Math.round(daMesa.reduce((t, p) => t + Number(p.total || 0), 0) * 100) / 100 });
        setDados({ vendas: lista(v), caixa, movsCaixa: lista(cm), movsIns: lista(im), ocorrencias: lista(oc) });
      })
      .catch(() => setDados({ vendas: [], caixa: null, movsCaixa: [], movsIns: [], ocorrencias: [] }));
  }, []);

  const f = useMemo(() => {
    if (!dados) return null;
    const x = montarFechamento({ ...dados, taxas });
    // Mesas que ainda estão abertas: fecham no encerramento e entram no total (sem forma de pagamento).
    if (abertas.n > 0) {
      x.total = Math.round((x.total + abertas.total) * 100) / 100;
      x.pedidos += abertas.n;
      x.mesas += abertas.n;
      x.formas = [...x.formas, { forma: "Mesas fechadas agora", valor: abertas.total }];
      x.ticket = x.pedidos ? Math.round((x.total / x.pedidos) * 100) / 100 : 0;
    }
    return x;
  }, [dados, taxas, abertas]);
  const esperado = f?.gaveta ? Math.max(0, Math.round(f.gaveta.esperado * 100) / 100) : null;
  const r2 = (v) => Math.round(v * 100) / 100;
  // Quanto a dona deveria tirar hoje para chegar na meta do mês: o que falta ÷ os dias que faltam (com hoje).
  const hojeD = new Date();
  const diasFaltam = new Date(hojeD.getFullYear(), hojeD.getMonth() + 1, 0).getDate() - hojeD.getDate() + 1;
  const falta = Math.max(0, meta.metaDona - meta.tiradoMes);
  const sugerido = meta.metaDona > 0 ? Math.ceil(falta / diasFaltam) : 0;
  /** Divide o que sobra depois da gaveta: a dona fica com o sugerido (até onde der) e o resto vai para o caixa. */
  const dividir = (gaveta, total = esperado) => {
    const g = Math.min(total, Math.max(0, gaveta));
    const resto = r2(total - g);
    const dona = meta.metaDona > 0 ? Math.min(resto, sugerido) : 0;
    return { gaveta: g, caixa: r2(resto - dona), dona: r2(dona) };
  };
  useEffect(() => {
    if (esperado !== null && div === null) {
      const d = dividir(meta.gavetaPadrao || 0);
      setDiv({ gaveta: String(d.gaveta).replace(".", ","), caixa: String(d.caixa).replace(".", ","), dona: String(d.dona).replace(".", ",") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperado, meta]);
  const num = (t) => lerValor(t || "0");
  const g = div ? num(div.gaveta) : 0;
  const cx = div ? num(div.caixa) : 0;
  const dn = div ? num(div.dona) : 0;
  const soma = r2(g + cx + dn);
  const sobra = esperado === null ? 0 : r2(esperado - soma);
  const txt = (v) => String(r2(v)).replace(".", ",");
  function mudarGaveta(t) {
    const d = dividir(num(t));
    setDiv({ gaveta: t, caixa: txt(d.caixa), dona: txt(d.dona) });
  }
  function mudarCaixa(t) {
    const resto = r2(esperado - g);
    setDiv({ ...div, caixa: t, dona: txt(Math.max(0, resto - num(t))) });
  }
  function mudarDona(t) {
    const resto = r2(esperado - g);
    setDiv({ ...div, dona: t, caixa: txt(Math.max(0, resto - num(t))) });
  }
  const atalho = (tipo) => {
    if (esperado === null) return;
    const gv = tipo === "tudoGaveta" ? esperado : tipo === "soDona" ? 0 : Math.min(esperado, g);
    if (tipo === "dividir") return mudarGaveta(div.gaveta);
    if (tipo === "tudoGaveta") return setDiv({ gaveta: txt(esperado), caixa: "0", dona: "0" });
    if (tipo === "gavetaDona") return setDiv({ gaveta: txt(gv), caixa: "0", dona: txt(esperado - gv) });
    if (tipo === "soDona") return setDiv({ gaveta: "0", caixa: "0", dona: txt(esperado) });
  };
  async function salvarMeta() {
    const v = lerValor(metaTxt);
    await setDoc(doc(db, ...L(), "configuracoes", "precificacao"), { metaDona: v, atualizadoEm: new Date().toISOString() }, { merge: true }).catch(() => {});
    setMeta({ ...meta, metaDona: v });
    setEditMeta(false);
    setDiv(null);
  }

  function encerrar(imprimir) {
    if (esperado !== null && Math.abs(sobra) > 0.009) return;
    const fechamento = { ...f, donaTirou: dn, ficaNoCaixa: g, paraCaixaLoja: cx, sugeridoDona: sugerido, metaDona: meta.metaDona, tiradoMesAntes: meta.tiradoMes };
    if (f.gaveta) setDoc(doc(db, ...L(), "configuracoes", "precificacao"), { gavetaPadrao: g }, { merge: true }).catch(() => {});
    // A impressão abre já no toque (depois de encerrar o navegador bloquearia a janela).
    if (imprimir) imprimirCupom(gerarResumoDiaHTML(fechamento, configImpressora), configImpressora?.larguraPapel || "58mm");
    onConfirmar({ imprimir, fechamento, caixa: dados.caixa });
  }

  return (
    <div className="fd-fundo" role="dialog" aria-modal="true" aria-label="Fechamento do dia">
      <div className="fd">
        <div className="fd-cab">
          <h1>Fechamento do dia</h1>
          <small>{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}</small>
        </div>
        {!f ? (
          <p className="fd-vazio">Carregando…</p>
        ) : (
          <div className="fd-grade">
            <section className="fd-card">
              <h3>Vendas</h3>
              {f.formas.map((x) => (
                <div key={x.forma} className="fd-ln"><span>{x.forma}</span><span>{R(x.valor)}</span></div>
              ))}
              <div className="fd-ln fd-t"><span>Total vendido</span><span>{R(f.total)}</span></div>
              <small className="fd-nota">{f.pedidos} {f.pedidos === 1 ? "pedido" : "pedidos"} · ticket médio {R(f.ticket)}</small>
              {abertas.n > 0 && <small className="fd-nota">{abertas.n} {abertas.n === 1 ? "mesa aberta será fechada" : "mesas abertas serão fechadas"} e {abertas.n === 1 ? "entra" : "entram"} no total.</small>}
            </section>

            <section className="fd-card">
              <h3>Gaveta (dinheiro)</h3>
              {f.gaveta ? (
                <>
                  <div className="fd-ln"><span>Abriu com</span><span>{R(f.gaveta.inicial)}</span></div>
                  <div className="fd-ln"><span>Vendas em dinheiro</span><span>{R(f.gaveta.dinheiro)}</span></div>
                  {f.gaveta.movimentos.map((m, i) => (
                    <div key={i} className="fd-ln"><span>{m.tipo === "sangria" ? "Sangria" : "Reforço"}{m.motivo ? ` (${m.motivo})` : ""}</span><span>{m.tipo === "sangria" ? "− " : "+ "}{R(m.valor)}</span></div>
                  ))}
                  <div className="fd-ln fd-t"><span>Tem na gaveta</span><span>{R(esperado)}</span></div>
                  <div className="fd-meta">
                    {meta.metaDona > 0 && !editMeta ? (
                      <span>Meta da dona: {R(meta.metaDona)}/mês · já tirou {R(meta.tiradoMes)} · hoje o certo é {R(sugerido)}</span>
                    ) : !editMeta ? (
                      <span>Sem meta de retirada da dona.</span>
                    ) : null}
                    {editMeta ? (
                      <span className="fd-meta-ed">
                        <input inputMode="decimal" autoFocus placeholder="Quanto quer tirar por mês" value={metaTxt} onChange={(e) => setMetaTxt(e.target.value)} />
                        <button type="button" onClick={salvarMeta}>Salvar</button>
                      </span>
                    ) : (
                      <button type="button" className="fd-link" onClick={() => { setMetaTxt(meta.metaDona ? String(meta.metaDona).replace(".", ",") : ""); setEditMeta(true); }}>{meta.metaDona > 0 ? "mudar meta" : "pôr meta"}</button>
                    )}
                  </div>
                  {div && (
                    <div className="fd-tres">
                      <label>Fica na gaveta<input inputMode="decimal" value={div.gaveta} onChange={(e) => mudarGaveta(e.target.value)} /></label>
                      <label>Vai para o caixa<input inputMode="decimal" value={div.caixa} onChange={(e) => mudarCaixa(e.target.value)} /></label>
                      <label>Dona tira<input inputMode="decimal" value={div.dona} onChange={(e) => mudarDona(e.target.value)} /></label>
                    </div>
                  )}
                  <div className="fd-atalhos">
                    <button type="button" onClick={() => atalho("dividir")}>Dividir pela meta</button>
                    <button type="button" onClick={() => atalho("tudoGaveta")}>Tudo na gaveta</button>
                    <button type="button" onClick={() => atalho("gavetaDona")}>Gaveta e dona</button>
                    <button type="button" onClick={() => atalho("soDona")}>Só a dona</button>
                  </div>
                  {Math.abs(sobra) > 0.009 && <p className="fd-alerta">{sobra > 0 ? `Faltam ${R(sobra)} para fechar a conta da gaveta.` : `Passou ${R(-sobra)} do que tem na gaveta.`}</p>}
                  {meta.metaDona > 0 && dn > sugerido + 0.009 && <p className="fd-alerta">Tirou {R(dn - sugerido)} a mais que o certo para hoje.</p>}
                  {meta.metaDona > 0 && dn + 0.009 < sugerido && <p className="fd-nota">Tirou {R(sugerido - dn)} a menos que o certo para hoje: fica para os próximos dias.</p>}
                </>
              ) : (
                <p className="fd-vazio">O caixa não foi aberto hoje.</p>
              )}
            </section>

            <section className="fd-card">
              <h3>Saída de alimento</h3>
              {f.saidas.length === 0 ? (
                <p className="fd-vazio">Nada lançado.</p>
              ) : (
                <>
                  {f.saidas.map((s, i) => (
                    <div key={i} className="fd-ln"><span>{s.texto}{s.motivo ? ` · ${s.motivo.toLowerCase()}` : ""}</span><span>{s.qtd || R(s.valor)}</span></div>
                  ))}
                  <div className="fd-ln fd-t"><span>Perdido</span><span>{R(f.saidasTotal)}</span></div>
                </>
              )}
            </section>

            <section className="fd-card">
              <h3>Acabou</h3>
              {f.acabou.length === 0 ? <p className="fd-vazio">Nada acabou.</p> : f.acabou.map((a, i) => (
                <div key={i} className="fd-ln"><span>{a.nome}</span><span className="fd-mute">{hora(a.em)}</span></div>
              ))}
              {(f.mexido.tirados > 0 || f.mexido.saiuDiferente > 0 || f.mexido.cortesias > 0) && (
                <>
                  <h3 className="fd-h3b">Nas comandas</h3>
                  {f.mexido.tirados > 0 && <div className="fd-ln"><span>Itens tirados</span><span>{f.mexido.tirados} · {R(f.mexido.tiradosValor)}</span></div>}
                  {f.mexido.saiuDiferente > 0 && <div className="fd-ln"><span>Saiu diferente (cliente ficou)</span><span>{f.mexido.saiuDiferente}</span></div>}
                  {f.mexido.cortesias > 0 && <div className="fd-ln"><span>Cortesias</span><span>{f.mexido.cortesias} · {R(f.mexido.cortesiasValor)}</span></div>}
                </>
              )}
            </section>
          </div>
        )}
        <p className="fd-aviso">Encerrar fecha as mesas abertas, guarda tudo no relatório e zera as vendas do dia. Não dá para desfazer.</p>
        <div className="fd-bt">
          <button type="button" className="fd-cancelar" disabled={encerrando} onClick={onCancelar}>Cancelar</button>
          <button type="button" className="fd-sem" disabled={!f || encerrando || (esperado !== null && Math.abs(sobra) > 0.009)} onClick={() => encerrar(false)}>Encerrar sem imprimir</button>
          <button type="button" className="fd-com" disabled={!f || encerrando || (esperado !== null && Math.abs(sobra) > 0.009)} onClick={() => encerrar(true)}>{encerrando ? "Encerrando…" : "Encerrar e imprimir"}</button>
        </div>
      </div>
    </div>
  );
}
