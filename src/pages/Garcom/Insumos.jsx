import { L } from "../../loja";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { UNIDADES, ajustarInsumo, custoDaFicha, daFicha, daParaQuantos, entradaInsumo, inventario, mostrarQtd, paraFicha, perdasNoPeriodo, previsao, unidadeDe } from "../../utils/insumos";
import { isoDia, periodo } from "../../utils/financas";
import { lerValor } from "../../utils/financas";
import "../../styles/Garcom/RelatorioGerencial.css";
import "../../styles/Garcom/Financas.css";
import "../../styles/Garcom/Insumos.css";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R = (v) => `R$ ${fmt(v)}`;
const num = (v) => {
  const t = String(v ?? "").trim();
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
};
const ABAS = [
  { id: "estoque", nome: "Estoque" },
  { id: "contagem", nome: "Contagem" },
  { id: "fichas", nome: "Fichas técnicas" },
  { id: "perdas", nome: "Perdas" },
  { id: "historico", nome: "Histórico" },
];
const quem = () => auth.currentUser?.email || "";

/** Histórico de movimentos (para a previsão e as perdas): os mais recentes primeiro. */
function useMovs() {
  const [lista, setLista] = useState(null);
  useEffect(() => onSnapshot(query(collection(db, ...L(), "insumosMov"), orderBy("em", "desc"), limit(3000)), (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLista([])), []);
  return lista;
}

function useColecao(nome) {
  const [lista, setLista] = useState(null);
  useEffect(() => onSnapshot(collection(db, ...L(), nome), (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLista([])), [nome]);
  return lista;
}

function Insumos() {
  const insumos = useColecao("insumos");
  const produtos = useColecao("produtos");
  const fichas = useColecao("fichas");
  const movs = useMovs();
  const [aba, setAba] = useState("estoque");
  const ativos = useMemo(() => (insumos || []).filter((i) => i.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")), [insumos]);
  const porId = useMemo(() => Object.fromEntries((insumos || []).map((i) => [i.id, i])), [insumos]);
  const carregando = insumos === null || produtos === null || fichas === null || movs === null;
  const prev = useMemo(() => previsao(insumos || [], movs || []), [insumos, movs]);
  const mes = periodo("mes");
  const perdasMes = useMemo(() => perdasNoPeriodo(movs || [], mes.de, mes.ate), [movs, mes.de, mes.ate]);
  const baixos = ativos.filter((i) => Number(i.quantidade || 0) <= Number(i.minimo || 0) && Number(i.minimo || 0) > 0);

  return (
    <div className="container relatorio-page fin-page">
      <Link to="/config" className="voltar">← Voltar</Link>
      <div className="relatorio-filtros">
        <h1>Matéria-prima</h1>
        <p>Carne, arroz, pão, refrigerante… O sistema desconta sozinho o que cada venda usa, pela ficha técnica do produto.</p>
        <div className="fin-abas ins-abas" role="tablist">
          {ABAS.map((a) => (
            <button key={a.id} role="tab" aria-selected={aba === a.id} className={aba === a.id ? "ativa" : ""} onClick={() => setAba(a.id)}>
              {a.nome}
            </button>
          ))}
        </div>
        {!carregando && baixos.length > 0 && aba === "estoque" && (
          <p className="fin-aviso ins-aviso">⚠️ Acabando: {baixos.map((i) => `${i.nome} (${mostrarQtd(i.quantidade, i.unidade)})`).join(", ")}</p>
        )}
      </div>
      {carregando ? (
        <p className="fin-carregando">Carregando…</p>
      ) : aba === "estoque" ? (
        <Estoque insumos={ativos} prev={prev} perdasMes={perdasMes} verPerdas={() => setAba("perdas")} />
      ) : aba === "contagem" ? (
        <Contagem insumos={ativos} />
      ) : aba === "fichas" ? (
        <Fichas produtos={produtos} fichas={fichas} insumos={ativos} porId={porId} />
      ) : aba === "perdas" ? (
        <Perdas movs={movs} porId={porId} />
      ) : (
        <Historico porId={porId} />
      )}
    </div>
  );
}

function Estoque({ insumos, prev, perdasMes, verPerdas }) {
  const [novo, setNovo] = useState({ nome: "", unidade: "kg", quantidade: "", minimo: "", valor: "" });
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState(null); // { insumo, tipo: "compra" | "perda" | "contagem" }
  const [salvando, setSalvando] = useState(false);

  async function criar(e) {
    e.preventDefault();
    const nome = novo.nome.trim();
    if (nome.length < 2) return setErro("Informe o nome (ex.: Carne moída).");
    if (insumos.some((i) => String(i.nome).toLowerCase() === nome.toLowerCase())) return setErro("Já tem um insumo com esse nome.");
    const quantidade = Math.max(0, num(novo.quantidade) || 0);
    const valor = lerValor(novo.valor);
    setSalvando(true);
    setErro("");
    try {
      const ref = await addDoc(collection(db, ...L(), "insumos"), {
        nome: nome.slice(0, 60),
        unidade: novo.unidade,
        quantidade,
        minimo: Math.max(0, num(novo.minimo) || 0),
        ...(valor > 0 && quantidade > 0 ? { custo: Math.round((valor / quantidade) * 10000) / 10000 } : {}),
        ativo: true,
        criadoEm: serverTimestamp(),
        atualizadoEm: new Date().toISOString(),
      });
      if (quantidade > 0)
        await addDoc(collection(db, ...L(), "insumosMov"), { insumoId: ref.id, nome, tipo: "contagem", qtd: quantidade, antes: 0, depois: quantidade, motivo: "Cadastro", em: new Date().toISOString(), por: quem(), criadoEm: serverTimestamp() });
      setNovo({ nome: "", unidade: novo.unidade, quantidade: "", minimo: "", valor: "" });
    } catch {
      setErro("Não foi possível salvar. Confira a internet.");
    }
    setSalvando(false);
  }

  return (
    <>
      <div className="relatorio-documento">
        <h2>Estoque de matéria-prima</h2>
        {perdasMes.total > 0 && (
          <button type="button" className="ins-perdas-resumo" onClick={verPerdas}>
            <span>Perdas este mês</span>
            <strong>− {R(perdasMes.total)}</strong>
            <small>Ver o que foi →</small>
          </button>
        )}
        {insumos.length === 0 ? (
          <p>Nenhum insumo cadastrado. Cadastre abaixo o que você compra para fazer os pratos (ex.: Carne moída em kg, Pão de hambúrguer em unidade).</p>
        ) : (
          <ul className="ins-lista">
            {insumos.map((i) => {
              const q = Number(i.quantidade || 0);
              const min = Number(i.minimo || 0);
              const estado = q <= 0 ? "zerado" : min > 0 && q <= min ? "baixo" : "ok";
              return (
                <li key={i.id} className={`ins-item ${estado}`}>
                  <div className="ins-info">
                    <strong>{i.nome}</strong>
                    <small>
                      {typeof i.custo === "number" ? `${R(i.custo)} por ${unidadeDe(i.unidade).nomeLongo}` : "sem preço"}
                      {min > 0 ? ` · mínimo ${mostrarQtd(min, i.unidade)}` : ""}
                      {typeof i.custo === "number" && q > 0 ? ` · vale ${R(q * i.custo)}` : ""}
                    </small>
                    {prev[i.id]?.porDia > 0 && (
                      <small className={`ins-prev ${prev[i.id].acabaEm <= 3 ? "perto" : ""}`}>
                        Gasta ~{mostrarQtd(prev[i.id].porDia, i.unidade)} por dia · {prev[i.id].acabaEm === 0 ? "já acabou" : `dá para ~${prev[i.id].acabaEm} ${prev[i.id].acabaEm === 1 ? "dia" : "dias"}`}
                      </small>
                    )}
                  </div>
                  <span className={`ins-qtd ${estado}`}>{mostrarQtd(q, i.unidade)}</span>
                  <div className="ins-acoes">
                    <button type="button" className="ins-btn entrada" onClick={() => setAcao({ insumo: i, tipo: "compra" })}>+ Compra</button>
                    <button type="button" className="ins-btn" onClick={() => setAcao({ insumo: i, tipo: "perda" })}>Perda</button>
                    <button type="button" className="ins-btn" onClick={() => setAcao({ insumo: i, tipo: "contagem" })}>Contar</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form className="relatorio-documento fin-form" onSubmit={criar}>
        <h2>Cadastrar insumo</h2>
        <div className="fin-campos">
          <label className="fin-largo">
            Nome
            <input placeholder="Ex.: Carne moída, Arroz, Pão de hambúrguer, Coca lata" maxLength={60} value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          </label>
          <div className="fin-largo ins-rotulo" role="group" aria-label="Controlar em">
            <span>Controlar em</span>
            <div className="fin-tipos">
              {UNIDADES.map((u) => (
                <button type="button" key={u.id} aria-pressed={novo.unidade === u.id} className={novo.unidade === u.id ? "ativo" : ""} onClick={() => setNovo({ ...novo, unidade: u.id })}>
                  {u.nomeLongo}
                </button>
              ))}
            </div>
          </div>
          <label>
            Quantidade que tem agora ({unidadeDe(novo.unidade).id === "un" ? "unidades" : unidadeDe(novo.unidade).id})
            <input inputMode="decimal" placeholder="0" value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} />
          </label>
          <label>
            Avisar quando chegar em
            <input inputMode="decimal" placeholder="0" value={novo.minimo} onChange={(e) => setNovo({ ...novo, minimo: e.target.value })} />
          </label>
          <label className="fin-largo">
            Quanto pagou por essa quantidade (R$, opcional)
            <input inputMode="decimal" placeholder="0,00" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} />
          </label>
        </div>
        {erro && <p className="fin-erro">{erro}</p>}
        <button className="btn-verde" disabled={salvando}>{salvando ? "Salvando…" : "Cadastrar insumo"}</button>
      </form>

      {acao && <Movimentar acao={acao} fechar={() => setAcao(null)} />}
    </>
  );
}

function Movimentar({ acao, fechar }) {
  const { insumo, tipo } = acao;
  const u = unidadeDe(insumo.unidade);
  const [qtd, setQtd] = useState(tipo === "contagem" ? String(Number(insumo.quantidade || 0)).replace(".", ",") : "");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [lancar, setLancar] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const titulo = tipo === "compra" ? `Compra de ${insumo.nome}` : tipo === "perda" ? `Perda de ${insumo.nome}` : `Contagem de ${insumo.nome}`;

  async function salvar(e) {
    e.preventDefault();
    const q = num(qtd);
    if (!(q > 0) && !(tipo === "contagem" && q === 0)) return setErro("Informe a quantidade.");
    setSalvando(true);
    setErro("");
    try {
      if (tipo === "compra") {
        const v = lerValor(valor);
        await entradaInsumo(insumo, q, v, quem());
        // A compra também vai para Finanças (Compras de mercadoria), se o dono quiser.
        if (v > 0 && lancar) {
          const hoje = new Date();
          const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
          await addDoc(collection(db, ...L(), "despesas"), { data, tipo: "insumos", grupo: "compra", valor: v, descricao: `${insumo.nome}: ${mostrarQtd(q, insumo.unidade)}`.slice(0, 120), categoria: "", insumoId: insumo.id, criadoEm: serverTimestamp() });
        }
      } else await ajustarInsumo(insumo, tipo, q, motivo.trim().slice(0, 120), quem());
      fechar();
    } catch {
      setErro("Não foi possível salvar. Confira a internet.");
      setSalvando(false);
    }
  }

  return (
    <div className="ins-modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={fechar}>
      <form className="ins-modal-caixa" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h2>{titulo}</h2>
        <p className="fin-explica">Tem agora: {mostrarQtd(insumo.quantidade, insumo.unidade)}</p>
        <div className="fin-campos">
          <label className={tipo === "compra" ? "" : "fin-largo"}>
            {tipo === "contagem" ? `Quanto tem de verdade (${u.id})` : `Quantidade (${u.id})`}
            <input autoFocus inputMode="decimal" placeholder="0" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </label>
          {tipo === "compra" && (
            <label>
              Valor pago (R$)
              <input inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
            </label>
          )}
          {tipo !== "compra" && (
            <label className="fin-largo">
              {tipo === "perda" ? "O que aconteceu? (opcional)" : "Observação (opcional)"}
              <input placeholder={tipo === "perda" ? "Ex.: estragou, venceu, caiu" : "Ex.: contagem de segunda"} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
          )}
        </div>
        {tipo === "compra" && (
          <label className="ins-check">
            <input type="checkbox" checked={lancar} onChange={(e) => setLancar(e.target.checked)} /> Lançar em Finanças como compra de mercadoria
          </label>
        )}
        {tipo === "compra" && <p className="fin-explica">O preço do {u.nomeLongo} é atualizado pela média do que já tinha com essa compra.</p>}
        {erro && <p className="fin-erro">{erro}</p>}
        <div className="ins-modal-botoes">
          <button type="button" className="ins-btn" onClick={fechar}>Cancelar</button>
          <button className="btn-verde" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </div>
  );
}

function Fichas({ produtos, fichas, insumos, porId }) {
  const [aberto, setAberto] = useState(null);
  const fichaDe = useMemo(() => Object.fromEntries((fichas || []).map((f) => [f.id, f])), [fichas]);
  const lista = useMemo(() => (produtos || []).filter((p) => p.nome && p.ativo !== false).sort((a, b) => String(a.categoria || "").localeCompare(String(b.categoria || ""), "pt-BR") || String(a.nome).localeCompare(String(b.nome), "pt-BR")), [produtos]);
  if (!insumos.length)
    return (
      <div className="relatorio-documento">
        <p>Cadastre primeiro a matéria-prima na aba Estoque. Depois, aqui, diga quanto de cada uma vai em cada produto.</p>
      </div>
    );
  return (
    <div className="relatorio-documento">
      <h2>Ficha técnica de cada produto</h2>
      <p className="fin-explica">Quanto de cada insumo vai em 1 unidade do produto. Ex.: X-Burguer = 1 pão + 150 g de carne + 1 fatia de queijo. Com a ficha, cada venda desconta o estoque sozinha e o custo do produto é calculado.</p>
      <ul className="ins-fichas">
        {lista.map((p) => {
          const f = fichaDe[p.id];
          const custo = custoDaFicha(f, porId);
          const da = daParaQuantos(f, porId);
          return (
            <li key={p.id}>
              <button type="button" className="ins-ficha-linha" aria-expanded={aberto === p.id} onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                <span>
                  <strong>{p.nome}</strong>
                  <small>
                    {p.categoria || "Sem categoria"} · {f?.itens?.length ? `${f.itens.length} ${f.itens.length === 1 ? "insumo" : "insumos"}` : "sem ficha"}
                    {custo !== null ? ` · custo ${R(custo)} · vende ${R(p.preco)}` : ""}
                  </small>
                  {da && (
                    <small className={`ins-da ${da.quantos <= 5 ? "pouco" : ""}`}>
                      {da.quantos === 0 ? `Não dá para fazer: acabou ${da.limitante}` : `Dá para mais ${da.quantos}${da.quantos <= 5 ? ` · ${da.limitante} acabando` : ""}`}
                    </small>
                  )}
                </span>
                <span aria-hidden="true">{aberto === p.id ? "▴" : "▾"}</span>
              </button>
              {aberto === p.id && <EditarFicha produto={p} ficha={f} insumos={insumos} porId={porId} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EditarFicha({ produto, ficha, insumos, porId }) {
  const [linhas, setLinhas] = useState(() => (ficha?.itens || []).map((it) => ({ insumoId: it.insumoId, qtd: String(paraFicha(it.qtd, porId[it.insumoId]?.unidade)).replace(".", ",") })));
  const [msg, setMsg] = useState("");
  const custo = custoDaFicha({ itens: linhas.filter((l) => l.insumoId).map((l) => ({ insumoId: l.insumoId, qtd: daFicha(l.qtd, porId[l.insumoId]?.unidade) })) }, porId);

  async function salvar() {
    const itens = linhas
      .filter((l) => l.insumoId && num(l.qtd) > 0)
      .map((l) => ({ insumoId: l.insumoId, qtd: daFicha(l.qtd, porId[l.insumoId]?.unidade) }));
    await setDoc(doc(db, ...L(), "fichas", produto.id), { itens, nome: produto.nome, atualizadoEm: new Date().toISOString() });
    setMsg("✓ Ficha salva");
    setTimeout(() => setMsg(""), 1800);
  }

  return (
    <div className="ins-ficha">
      {linhas.map((l, n) => {
        const u = unidadeDe(porId[l.insumoId]?.unidade);
        return (
          <div key={n} className="ins-ficha-item">
            <select aria-label="Insumo" value={l.insumoId} onChange={(e) => setLinhas(linhas.map((x, k) => (k === n ? { ...x, insumoId: e.target.value } : x)))}>
              <option value="">Escolha o insumo</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>{i.nome}</option>
              ))}
            </select>
            <input aria-label={`Quantidade em ${u.sub}`} inputMode="decimal" placeholder="0" value={l.qtd} onChange={(e) => setLinhas(linhas.map((x, k) => (k === n ? { ...x, qtd: e.target.value } : x)))} />
            <span className="ins-un">{l.insumoId ? u.sub : ""}</span>
            <button type="button" className="fin-btn-x" aria-label="Tirar da ficha" onClick={() => setLinhas(linhas.filter((_, k) => k !== n))}>✕</button>
          </div>
        );
      })}
      <button type="button" className="ins-btn" onClick={() => setLinhas([...linhas, { insumoId: "", qtd: "" }])}>+ Adicionar insumo</button>
      <p className="fin-explica">
        {custo !== null ? `Custo de 1 ${produto.nome}: ${R(custo)}${Number(produto.preco) > 0 ? ` · lucro ${R(Number(produto.preco) - custo)} (${Math.round(((Number(produto.preco) - custo) / Number(produto.preco)) * 100)}%)` : ""}` : "O custo aparece quando todos os insumos da ficha tiverem preço (registre uma compra)."}
      </p>
      <div className="ins-modal-botoes">
        <span className="fin-ok">{msg}</span>
        <button type="button" className="btn-verde" onClick={salvar}>Salvar ficha</button>
      </div>
    </div>
  );
}

function Contagem({ insumos }) {
  const [contado, setContado] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const preenchidos = insumos.filter((i) => contado[i.id] !== undefined && String(contado[i.id]).trim() !== "" && Number.isFinite(num(contado[i.id])));
  let faltou = 0;
  let sobrou = 0;
  preenchidos.forEach((i) => {
    const dif = num(contado[i.id]) - Number(i.quantidade || 0);
    if (typeof i.custo === "number") {
      if (dif < 0) faltou += -dif * i.custo;
      else sobrou += dif * i.custo;
    }
  });
  async function salvar() {
    setSalvando(true);
    try {
      const n = await inventario(preenchidos.map((i) => ({ insumo: i, qtd: num(contado[i.id]) })), quem());
      setContado({});
      setMsg(n ? `✓ Contagem salva: ${n} ${n === 1 ? "insumo corrigido" : "insumos corrigidos"}.` : "✓ Contagem salva: tudo batia com o sistema.");
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
    setSalvando(false);
  }
  if (!insumos.length) return <div className="relatorio-documento"><p>Cadastre a matéria-prima na aba Estoque primeiro.</p></div>;
  return (
    <div className="relatorio-documento">
      <h2>Contagem do estoque</h2>
      <p className="fin-explica">Conte o que tem na prateleira e digite. Deixe em branco o que não contou. O sistema mostra a diferença e, ao salvar, corrige o estoque. O que faltou vira perda.</p>
      <ul className="ins-cont">
        {insumos.map((i) => {
          const u = unidadeDe(i.unidade);
          const tem = contado[i.id] !== undefined && String(contado[i.id]).trim() !== "" && Number.isFinite(num(contado[i.id]));
          const dif = tem ? Math.round((num(contado[i.id]) - Number(i.quantidade || 0)) * 1000) / 1000 : null;
          return (
            <li key={i.id} className="ins-cont-linha">
              <div>
                <strong>{i.nome}</strong>
                <small>No sistema: {mostrarQtd(i.quantidade, i.unidade)}</small>
                {dif !== null && (
                  <small className={`ins-cont-dif ${dif === 0 ? "ok" : dif < 0 ? "falta" : "sobra"}`}>
                    {dif === 0 ? "✓ Bateu" : dif < 0 ? `Faltando ${mostrarQtd(-dif, i.unidade)}${typeof i.custo === "number" ? ` (− ${R(-dif * i.custo)})` : ""}` : `Sobrando ${mostrarQtd(dif, i.unidade)}`}
                  </small>
                )}
              </div>
              <label>
                <input inputMode="decimal" placeholder="—" aria-label={`Contado de ${i.nome} (${u.id})`} value={contado[i.id] ?? ""} onChange={(e) => setContado({ ...contado, [i.id]: e.target.value })} />
                <span>{u.id}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {preenchidos.length > 0 && (
        <p className="ins-cont-total">
          {preenchidos.length} {preenchidos.length === 1 ? "contado" : "contados"}
          {faltou > 0 ? ` · faltando − ${R(faltou)}` : ""}
          {sobrou > 0 ? ` · sobrando ${R(sobrou)}` : ""}
        </p>
      )}
      {msg && <p className="fin-dica">{msg}</p>}
      <button type="button" className="btn-verde cx-fechar" disabled={salvando || !preenchidos.length} onClick={salvar}>
        {salvando ? "Salvando…" : `Salvar contagem${preenchidos.length ? ` (${preenchidos.length})` : ""}`}
      </button>
    </div>
  );
}

function Perdas({ movs, porId }) {
  const [per, setPer] = useState("mes");
  const f = periodo(per);
  const r = perdasNoPeriodo(movs, f.de, f.ate);
  return (
    <div className="relatorio-documento">
      <h2>Perdas · − {R(r.total)}</h2>
      <div className="fin-periodos">
        {[{ id: "7dias", nome: "7 dias" }, { id: "mes", nome: "Este mês" }, { id: "mesPassado", nome: "Mês passado" }, { id: "ano", nome: "Este ano" }].map((p) => (
          <button key={p.id} className={per === p.id ? "ativo" : ""} onClick={() => setPer(p.id)}>{p.nome}</button>
        ))}
      </div>
      <div className="fin-conta">
        <div className="fin-linha"><div><span>Estragou, venceu, caiu</span><small>Lançado como perda</small></div><strong className="fin-neg">− {R(r.perdas)}</strong></div>
        <div className="fin-linha"><div><span>Faltou na contagem</span><small>Sumiu sem explicação</small></div><strong className="fin-neg">− {R(r.faltas)}</strong></div>
        <div className="fin-linha fin-total"><div><span>Total perdido</span><small>Entra no lucro em Finanças</small></div><strong className="fin-neg">− {R(r.total)}</strong></div>
      </div>
      {r.lista.length === 0 ? (
        <p>Nenhuma perda no período. 👏</p>
      ) : (
        <ul className="fin-despesas">
          {r.lista.map((m) => (
            <li key={m.id}>
              <div>
                <strong>{m.nome}</strong>
                <small>
                  {new Date(m.em).toLocaleDateString("pt-BR")} · {m.tipo === "perda" ? "Perda" : "Faltou na contagem"} · {mostrarQtd(Math.abs(Number(m.qtd || 0)), porId[m.insumoId]?.unidade)}
                  {m.motivo && m.motivo !== "Inventário" ? ` · ${m.motivo}` : ""}
                </small>
              </div>
              <span className="fin-valor fin-neg">− {R(-m.valorAjuste)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="relatorio-nota">Só conta o que tem preço (registre as compras para o sistema saber quanto custa cada insumo). Hoje: {isoDia().split("-").reverse().join("/")}.</p>
    </div>
  );
}

function Historico({ porId }) {
  const [lista, setLista] = useState(null);
  useEffect(() => onSnapshot(query(collection(db, ...L(), "insumosMov"), orderBy("em", "desc"), limit(150)), (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLista([])), []);
  const NOME = { venda: "Venda", compra: "Compra", perda: "Perda", contagem: "Contagem" };
  if (lista === null) return <p className="fin-carregando">Carregando…</p>;
  return (
    <div className="relatorio-documento">
      <h2>Entradas e saídas</h2>
      {lista.length === 0 ? (
        <p>Nada ainda. Compras, perdas, contagens e o que as vendas usaram aparecem aqui.</p>
      ) : (
        <ul className="fin-despesas">
          {lista.map((m) => (
            <li key={m.id}>
              <div>
                <strong>{m.nome}</strong>
                <small>
                  {new Date(m.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {NOME[m.tipo] || m.tipo}
                  {m.valor ? ` · ${R(m.valor)}` : ""}
                  {m.motivo ? ` · ${m.motivo}` : ""}
                </small>
              </div>
              <span className={`fin-valor ${Number(m.qtd) > 0 ? "fin-pos" : ""}`}>{Number(m.qtd) > 0 ? "+ " : "− "}{mostrarQtd(Math.abs(Number(m.qtd || 0)), porId[m.insumoId]?.unidade)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Insumos;
