// Fechamento do dia (Configurações → Encerrar o dia): antes de encerrar, o resumo de tudo o que aconteceu —
// vendas, gaveta (abriu com, vendas em dinheiro, reforço, sangria), quanto a dona tirou e quanto fica no caixa,
// saída de alimento (kg, g, un e quanto custou), o que acabou e o que foi mexido nas comandas.
// Encerrar com ou sem impressão.
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
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
  const [tirou, setTirou] = useState("");
  const [fica, setFica] = useState("");
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
    ])
      .then(([v, c, cm, im, oc, ped]) => {
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
  const esperado = f?.gaveta ? Math.round(f.gaveta.esperado * 100) / 100 : null;
  const tirouN = tirou === "" ? 0 : Math.min(esperado ?? Infinity, lerValor(tirou));
  const ficaN = fica === "" ? (esperado === null ? 0 : Math.max(0, Math.round((esperado - tirouN) * 100) / 100)) : lerValor(fica);

  function encerrar(imprimir) {
    const fechamento = { ...f, donaTirou: tirouN, ficaNoCaixa: ficaN };
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
                  <div className="fd-duo">
                    <label>
                      Dona tirou
                      <input inputMode="decimal" placeholder="R$ 0,00" value={tirou} onChange={(e) => { setTirou(e.target.value); setFica(""); }} />
                    </label>
                    <label>
                      Fica no caixa
                      <input inputMode="decimal" placeholder={R(ficaN)} value={fica} onChange={(e) => setFica(e.target.value)} />
                    </label>
                  </div>
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
          <button type="button" className="fd-sem" disabled={!f || encerrando} onClick={() => encerrar(false)}>Encerrar sem imprimir</button>
          <button type="button" className="fd-com" disabled={!f || encerrando} onClick={() => encerrar(true)}>{encerrando ? "Encerrando…" : "Encerrar e imprimir"}</button>
        </div>
      </div>
    </div>
  );
}
