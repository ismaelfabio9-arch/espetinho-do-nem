import { L } from "../../loja";
import useNomeLoja from "../../hooks/useNomeLoja";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { lerValor } from "../../utils/financas";
import { resumoCaixa, vendasDoCaixa } from "../../utils/caixa";
import "../../styles/Garcom/RelatorioGerencial.css";
import "../../styles/Garcom/Financas.css";
import "../../styles/Garcom/Insumos.css";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R = (v) => (v < 0 ? `− R$ ${fmt(-v)}` : `R$ ${fmt(v)}`);
const hora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const quem = () => auth.currentUser?.email || "";

function useLista(q, deps) {
  const [lista, setLista] = useState(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onSnapshot(q(), (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLista([])), deps);
  return lista;
}

function Caixa() {
  const nomeLoja = useNomeLoja();
  const caixas = useLista(() => query(collection(db, ...L(), "caixas"), orderBy("abertoEm", "desc"), limit(40)), []);
  const movs = useLista(() => query(collection(db, ...L(), "caixaMov"), orderBy("em", "desc"), limit(300)), []);
  const hoje = useLista(() => collection(db, ...L(), "vendasDia"), []);
  const dias = useLista(() => query(collection(db, ...L(), "relatorioGerencial"), orderBy("criadoEm", "desc"), limit(15)), []);
  const [ver, setVer] = useState(null);
  const carregando = caixas === null || movs === null || hoje === null || dias === null;
  const aberto = (caixas || []).find((c) => c.status === "aberto") || null;
  const fechados = (caixas || []).filter((c) => c.status === "fechado");

  return (
    <div className="container relatorio-page fin-page">
      <div className="no-print">
        <Link to="/config" className="voltar">← Voltar</Link>
        <div className="relatorio-filtros">
          <h1>Caixa</h1>
          <p>Dinheiro da gaveta: abra com o troco, registre retiradas e reforços e feche conferindo o que tem.</p>
        </div>
      </div>
      {carregando ? (
        <p className="fin-carregando">Carregando…</p>
      ) : ver ? (
        <Fechamento caixa={ver} r={resumoCaixa(ver, vendasDoCaixa(ver, dias, hoje), movs)} nomeLoja={nomeLoja} voltar={() => setVer(null)} />
      ) : aberto ? (
        <Aberto caixa={aberto} r={resumoCaixa(aberto, vendasDoCaixa(aberto, dias, hoje), movs)} />
      ) : (
        <Abrir ultimo={fechados[0]} />
      )}
      {!carregando && !ver && fechados.length > 0 && (
        <div className="relatorio-documento no-print">
          <h2>Caixas fechados</h2>
          <ul className="fin-despesas">
            {fechados.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{hora(c.abertoEm)} até {hora(c.fechadoEm)}</strong>
                  <small>
                    Vendas {R(c.resumo?.total || 0)} · na gaveta {R(c.contado || 0)}
                    {c.fechadoPor ? ` · ${c.fechadoPor}` : ""}
                  </small>
                </div>
                <span className={`fin-valor ${Number(c.diferenca) < 0 ? "fin-neg" : Number(c.diferenca) > 0 ? "fin-pos" : ""}`}>
                  {Number(c.diferenca) === 0 ? "Bateu" : Number(c.diferenca) > 0 ? `Sobrou ${R(c.diferenca)}` : `Faltou ${R(-c.diferenca)}`}
                </span>
                <button type="button" className="ins-btn" onClick={() => setVer(c)}>Ver</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Abrir({ ultimo }) {
  const sugerido = ultimo ? Math.max(0, Number(ultimo.contado || 0) - Number(ultimo.retiradoNoFechamento || 0)) : 0;
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  async function abrir(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      await addDoc(collection(db, ...L(), "caixas"), { status: "aberto", abertoEm: new Date().toISOString(), abertoPor: quem(), valorInicial: lerValor(valor), criadoEm: serverTimestamp() });
    } catch {
      setErro("Não foi possível abrir. Confira a internet.");
      setSalvando(false);
    }
  }
  return (
    <form className="relatorio-documento fin-form" onSubmit={abrir}>
      <h2>Abrir o caixa do dia</h2>
      {ultimo && Date.now() - Date.parse(ultimo.fechadoEm || 0) < 12 * 3600000 && (
        <p className="fin-dica">✓ Caixa fechado às {new Date(ultimo.fechadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Terminou o expediente? Vá em <Link to="/config">Configurações → Encerrar o dia</Link>.</p>
      )}
      <p className="fin-explica">Conte o dinheiro que está na gaveta para começar (o troco).{sugerido > 0 ? ` No último fechamento ficaram ${R(sugerido)}.` : ""}</p>
      <div className="fin-campos">
        <label className="fin-largo">
          Troco na gaveta (R$)
          <input autoFocus inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
        </label>
      </div>
      {erro && <p className="fin-erro">{erro}</p>}
      <button className="btn-verde" disabled={salvando}>{salvando ? "Abrindo…" : "Abrir caixa"}</button>
    </form>
  );
}

function Aberto({ caixa, r }) {
  const [mov, setMov] = useState(null); // "sangria" | "suprimento"
  const [fechar, setFechar] = useState(false);
  return (
    <>
      <div className="relatorio-documento">
        <div className="cx-topo">
          <span className="cx-status">● Caixa aberto</span>
          <small>desde {hora(caixa.abertoEm)}{caixa.abertoPor ? ` · ${caixa.abertoPor}` : ""}</small>
        </div>
        <div className="fin-conta">
          <Linha nome="Troco inicial" valor={r.inicial} />
          <Linha nome="Vendas em dinheiro" valor={r.dinheiro} />
          {r.suprimentos > 0 && <Linha nome="Reforço de troco (suprimento)" valor={r.suprimentos} />}
          {r.sangrias > 0 && <Linha nome="Retiradas (sangria)" valor={-r.sangrias} />}
          <Linha nome="Deve ter na gaveta" valor={r.esperado} total />
        </div>
        <div className="ins-modal-botoes cx-botoes">
          <button type="button" className="ins-btn" onClick={() => setMov("sangria")}>− Sangria (retirar)</button>
          <button type="button" className="ins-btn entrada" onClick={() => setMov("suprimento")}>+ Suprimento (troco)</button>
        </div>
      </div>
      <div className="relatorio-documento">
        <h2>Vendas deste caixa · {R(r.total)}</h2>
        <p className="fin-explica">{r.pedidos} {r.pedidos === 1 ? "pedido fechado" : "pedidos fechados"} desde a abertura. Pix e cartão não ficam na gaveta: confira no banco e na maquininha.</p>
        <ul className="fin-lista">
          {r.formas.map((f) => (
            <li key={f.nome}><span>{f.nome}</span><strong>{R(f.valor)}</strong></li>
          ))}
        </ul>
        {r.movimentos.length > 0 && (
          <>
            <h3 className="cx-sub">Sangrias e suprimentos</h3>
            <ul className="fin-lista">
              {r.movimentos.map((m) => (
                <li key={m.id}><span>{hora(m.em)} · {m.tipo === "sangria" ? "Sangria" : "Suprimento"}{m.motivo ? ` · ${m.motivo}` : ""}</span><strong className={m.tipo === "sangria" ? "fin-neg" : "fin-pos"}>{m.tipo === "sangria" ? "− " : "+ "}R$ {fmt(m.valor)}</strong></li>
              ))}
            </ul>
          </>
        )}
        <button type="button" className="btn-verde cx-fechar" onClick={() => setFechar(true)}>Fechar caixa</button>
      </div>
      {mov && <Movimento caixa={caixa} tipo={mov} fechar={() => setMov(null)} />}
      {fechar && <Fechar caixa={caixa} r={r} cancelar={() => setFechar(false)} />}
    </>
  );
}

function Movimento({ caixa, tipo, fechar }) {
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  async function salvar(e) {
    e.preventDefault();
    const v = lerValor(valor);
    if (!v) return setErro("Informe o valor.");
    try {
      await addDoc(collection(db, ...L(), "caixaMov"), { caixaId: caixa.id, tipo, valor: v, motivo: motivo.trim().slice(0, 100), em: new Date().toISOString(), por: quem(), criadoEm: serverTimestamp() });
      fechar();
    } catch {
      setErro("Não foi possível salvar. Confira a internet.");
    }
  }
  return (
    <div className="ins-modal" role="dialog" aria-modal="true" aria-label={tipo === "sangria" ? "Sangria" : "Suprimento"} onClick={fechar}>
      <form className="ins-modal-caixa" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h2>{tipo === "sangria" ? "Sangria: tirar dinheiro da gaveta" : "Suprimento: colocar troco na gaveta"}</h2>
        <div className="fin-campos">
          <label>
            Valor (R$)
            <input autoFocus inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
          </label>
          <label>
            Motivo (opcional)
            <input placeholder={tipo === "sangria" ? "Ex.: guardar no cofre, pagar o gás" : "Ex.: troco do banco"} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
        </div>
        {tipo === "sangria" && <p className="fin-explica">Se o dinheiro foi para pagar uma conta, lance também em Finanças → Lançamentos.</p>}
        {erro && <p className="fin-erro">{erro}</p>}
        <div className="ins-modal-botoes">
          <button type="button" className="ins-btn" onClick={fechar}>Cancelar</button>
          <button className="btn-verde">Salvar</button>
        </div>
      </form>
    </div>
  );
}

function Fechar({ caixa, r, cancelar }) {
  const [contado, setContado] = useState("");
  const [fica, setFica] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const c = contado === "" ? null : lerValor(contado);
  const dif = c === null ? null : Math.round((c - r.esperado) * 100) / 100;
  async function confirmar(e) {
    e.preventDefault();
    if (c === null) return setErro("Conte o dinheiro da gaveta e informe o valor.");
    setSalvando(true);
    try {
      const deixar = fica === "" ? c : Math.min(c, lerValor(fica));
      await updateDoc(doc(db, ...L(), "caixas", caixa.id), {
        status: "fechado",
        fechadoEm: new Date().toISOString(),
        fechadoPor: quem(),
        contado: c,
        esperado: r.esperado,
        diferenca: dif,
        retiradoNoFechamento: Math.round((c - deixar) * 100) / 100,
        obs: obs.trim().slice(0, 200),
        resumo: { total: r.total, pedidos: r.pedidos, formas: r.formas, inicial: r.inicial, dinheiro: r.dinheiro, suprimentos: r.suprimentos, sangrias: r.sangrias },
      });
    } catch {
      setErro("Não foi possível fechar. Confira a internet.");
      setSalvando(false);
    }
  }
  return (
    <div className="ins-modal" role="dialog" aria-modal="true" aria-label="Fechar caixa" onClick={cancelar}>
      <form className="ins-modal-caixa" onClick={(e) => e.stopPropagation()} onSubmit={confirmar}>
        <h2>Fechar o caixa</h2>
        <p className="fin-explica">Conte o dinheiro da gaveta. O sistema compara com o que deveria ter ({R(r.esperado)}).</p>
        <div className="fin-campos">
          <label>
            Dinheiro contado (R$)
            <input autoFocus inputMode="decimal" placeholder="0,00" value={contado} onChange={(e) => setContado(e.target.value)} />
          </label>
          <label>
            Fica na gaveta para amanhã (R$)
            <input inputMode="decimal" placeholder="Tudo" value={fica} onChange={(e) => setFica(e.target.value)} />
          </label>
          <label className="fin-largo">
            Observação (opcional)
            <input placeholder="Ex.: troco errado na mesa 4" value={obs} onChange={(e) => setObs(e.target.value)} />
          </label>
        </div>
        {dif !== null && (
          <p className={`cx-dif ${dif === 0 ? "ok" : dif > 0 ? "sobra" : "falta"}`}>
            {dif === 0 ? "✓ Bateu certinho" : dif > 0 ? `Sobrando ${R(dif)}` : `Faltando ${R(-dif)}`}
          </p>
        )}
        {erro && <p className="fin-erro">{erro}</p>}
        <div className="ins-modal-botoes">
          <button type="button" className="ins-btn" onClick={cancelar}>Cancelar</button>
          <button className="btn-verde" disabled={salvando}>{salvando ? "Fechando…" : "Confirmar fechamento"}</button>
        </div>
      </form>
    </div>
  );
}

function Fechamento({ caixa, r, nomeLoja, voltar }) {
  const res = caixa.resumo || r;
  return (
    <div className="relatorio-documento">
      <div className="relatorio-cabecalho">
        <div>
          <span>Fechamento de caixa</span>
          <h1>{nomeLoja || "Caixa"}</h1>
          <p>{hora(caixa.abertoEm)} até {hora(caixa.fechadoEm)}</p>
        </div>
        <div className="relatorio-emissao">
          <strong>Fechado por</strong>
          <span>{caixa.fechadoPor || "–"}</span>
        </div>
      </div>
      <div className="fin-conta">
        <Linha nome="Troco inicial" valor={res.inicial} />
        <Linha nome="Vendas em dinheiro" valor={res.dinheiro} />
        <Linha nome="Suprimentos" valor={res.suprimentos} />
        <Linha nome="Sangrias" valor={-res.sangrias} />
        <Linha nome="Deveria ter" valor={caixa.esperado} total />
        <Linha nome="Contado" valor={caixa.contado} />
        <Linha nome={Number(caixa.diferenca) < 0 ? "Faltou" : Number(caixa.diferenca) > 0 ? "Sobrou" : "Diferença"} valor={caixa.diferenca} total />
        {Number(caixa.retiradoNoFechamento) > 0 && <Linha nome="Retirado no fechamento" valor={caixa.retiradoNoFechamento} />}
      </div>
      <div className="relatorio-secao">
        <h2>Vendas · {R(res.total)} ({res.pedidos} pedidos)</h2>
        <ul className="fin-lista">
          {(res.formas || []).map((f) => (
            <li key={f.nome}><span>{f.nome}</span><strong>{R(f.valor)}</strong></li>
          ))}
        </ul>
        {caixa.obs && <p className="relatorio-nota">Obs.: {caixa.obs}</p>}
      </div>
      <div className="ins-modal-botoes no-print">
        <button type="button" className="ins-btn" onClick={voltar}>← Voltar</button>
        <button type="button" className="btn-verde" onClick={() => window.print()}>Imprimir / PDF</button>
      </div>
    </div>
  );
}

function Linha({ nome, valor, total }) {
  return (
    <div className={`fin-linha${total ? " fin-total" : ""}`}>
      <div><span>{nome}</span></div>
      <strong className={Number(valor) < 0 ? "fin-neg" : ""}>{R(Number(valor || 0))}</strong>
    </div>
  );
}

export default Caixa;
