import { L } from "../../loja";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { ajustarInsumo, custoDaFicha, daFicha, daParaQuantos, entradaInsumo, inventario, mostrarQtd, paraFicha, perdasNoPeriodo, previsao, unidadeDe } from "../../utils/insumos";
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
  const [acao, setAcao] = useState(null); // { insumo, tipo: "compra" | "perda" | "contagem" }
  const [form, setForm] = useState(null); // { insumo? } novo ou editar
  return (
    <>
      <div className="relatorio-documento">
        <div className="ins-topo">
          <h2>Estoque de matéria-prima</h2>
          <button type="button" className="btn-verde" onClick={() => setForm({})}>+ Novo ingrediente</button>
        </div>
        {perdasMes.total > 0 && (
          <button type="button" className="ins-perdas-resumo" onClick={verPerdas}>
            <span>Perdas este mês</span>
            <strong>− {R(perdasMes.total)}</strong>
            <small>Ver o que foi →</small>
          </button>
        )}
        {insumos.length === 0 ? (
          <p>Nenhum ingrediente ainda. Toque em <b>+ Novo ingrediente</b> e cadastre o que você compra para fazer os pratos: carne, arroz, pão, refrigerante…</p>
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
                      {typeof i.custo === "number" ? `${R(i.custo)} ${i.unidade === "un" ? "a" : "o"} ${unidadeDe(i.unidade).nomeLongo}` : "sem preço"}
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
                    <button type="button" className="ins-btn" onClick={() => setForm({ insumo: i })}>Editar</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>



      {acao && <Movimentar acao={acao} fechar={() => setAcao(null)} />}
      {form && <NovoInsumo insumos={insumos} editar={form.insumo} fechar={() => setForm(null)} />}
    </>
  );
}

const SUGESTOES = [
  { nome: "Carne moída", unidade: "kg", icone: "🥩" },
  { nome: "Frango", unidade: "kg", icone: "🍗" },
  { nome: "Arroz", unidade: "kg", icone: "🍚" },
  { nome: "Feijão", unidade: "kg", icone: "🫘" },
  { nome: "Batata", unidade: "kg", icone: "🥔" },
  { nome: "Pão de hambúrguer", unidade: "un", icone: "🍞" },
  { nome: "Queijo (fatia)", unidade: "un", icone: "🧀" },
  { nome: "Ovo", unidade: "un", icone: "🥚" },
  { nome: "Refrigerante lata", unidade: "un", icone: "🥤" },
  { nome: "Embalagem", unidade: "un", icone: "📦" },
  { nome: "Óleo", unidade: "L", icone: "🛢️" },
  { nome: "Leite", unidade: "L", icone: "🥛" },
];
const COMO = [
  { id: "kg", titulo: "Por peso", sub: "quilo (kg)", icone: "⚖️" },
  { id: "L", titulo: "Por volume", sub: "litro", icone: "🧴" },
  { id: "un", titulo: "Por unidade", sub: "pão, lata, ovo, fatia", icone: "🔢" },
];

/** Cadastro (ou edição) de um ingrediente, em perguntas simples. aoCriar(insumo) recebe o novo. */
function NovoInsumo({ insumos, editar, fechar, aoCriar }) {
  const ed = !!editar;
  const [f, setF] = useState(() => ({
    nome: editar?.nome || "",
    unidade: editar?.unidade || "kg",
    preco: typeof editar?.custo === "number" ? fmt(editar.custo) : "",
    quantidade: "",
    minimo: editar && Number(editar.minimo) > 0 ? String(editar.minimo).replace(".", ",") : "",
  }));
  const [pacote, setPacote] = useState(null); // { pagou, qtd } calcular o preço de um pacote
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [tirar, setTirar] = useState(false);
  const u = unidadeDe(f.unidade);
  const nomeUn = f.unidade === "un" ? "unidade" : u.nomeLongo;
  const sufixo = f.unidade === "un" ? "unidades" : u.id;

  function calcularPacote() {
    const pagou = lerValor(pacote?.pagou);
    const q = num(pacote?.qtd);
    if (pagou > 0 && q > 0) {
      setF({ ...f, preco: fmt(pagou / q), quantidade: f.quantidade || String(q).replace(".", ",") });
      setPacote(null);
    }
  }

  async function salvar(e) {
    e.preventDefault();
    const nome = f.nome.trim();
    if (nome.length < 2) return setErro("Escreva o nome do ingrediente.");
    if (insumos.some((i) => i.id !== editar?.id && String(i.nome).toLowerCase() === nome.toLowerCase())) return setErro("Já tem um ingrediente com esse nome.");
    const preco = lerValor(f.preco);
    const quantidade = Math.max(0, num(f.quantidade) || 0);
    const minimo = Math.max(0, num(f.minimo) || 0);
    setSalvando(true);
    setErro("");
    try {
      const agora = new Date().toISOString();
      if (ed) {
        await setDoc(doc(db, ...L(), "insumos", editar.id), { nome: nome.slice(0, 60), ...(preco > 0 ? { custo: preco } : {}), minimo, atualizadoEm: agora }, { merge: true });
        fechar();
        return;
      }
      const dados = { nome: nome.slice(0, 60), unidade: f.unidade, quantidade, minimo, ...(preco > 0 ? { custo: preco } : {}), ativo: true, criadoEm: serverTimestamp(), atualizadoEm: agora };
      const ref = await addDoc(collection(db, ...L(), "insumos"), dados);
      if (quantidade > 0)
        await addDoc(collection(db, ...L(), "insumosMov"), { insumoId: ref.id, nome, tipo: "contagem", qtd: quantidade, antes: 0, depois: quantidade, motivo: "Cadastro", em: agora, por: quem(), criadoEm: serverTimestamp() });
      aoCriar?.({ id: ref.id, ...dados });
      fechar();
    } catch {
      setErro("Não foi possível salvar. Confira a internet.");
      setSalvando(false);
    }
  }

  async function tirarDaLista() {
    await setDoc(doc(db, ...L(), "insumos", editar.id), { ativo: false, atualizadoEm: new Date().toISOString() }, { merge: true });
    fechar();
  }

  return (
    <div className="ins-modal" role="dialog" aria-modal="true" aria-label={ed ? "Editar ingrediente" : "Novo ingrediente"} onClick={fechar}>
      <form className="ins-modal-caixa ni" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h2>{ed ? `Editar ${editar.nome}` : "Novo ingrediente"}</h2>

        <div className="ni-passo">
          <span className="ni-num">1</span>
          <div>
            <label htmlFor="ni-nome">O que é?</label>
            <input id="ni-nome" autoFocus={!ed} placeholder="Ex.: Carne moída" maxLength={60} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
            {!ed && !f.nome && (
              <div className="ni-sug" aria-label="Sugestões">
                {SUGESTOES.filter((x) => !insumos.some((i) => String(i.nome).toLowerCase() === x.nome.toLowerCase())).map((x) => (
                  <button type="button" key={x.nome} onClick={() => setF({ ...f, nome: x.nome, unidade: x.unidade })}>
                    {x.icone} {x.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ni-passo">
          <span className="ni-num">2</span>
          <div>
            <span className="ni-rot">Como você compra e usa?</span>
            {ed ? (
              <p className="ni-fixo">{COMO.find((c) => c.id === f.unidade)?.titulo} ({COMO.find((c) => c.id === f.unidade)?.sub})</p>
            ) : (
              <div className="ni-como" role="radiogroup" aria-label="Como você compra e usa?">
                {COMO.map((c) => (
                  <button type="button" role="radio" aria-checked={f.unidade === c.id} key={c.id} className={f.unidade === c.id ? "ativo" : ""} onClick={() => setF({ ...f, unidade: c.id })}>
                    <span>{c.icone}</span>
                    <b>{c.titulo}</b>
                    <small>{c.sub}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ni-passo">
          <span className="ni-num">3</span>
          <div>
            <label htmlFor="ni-preco">Quanto custa {f.unidade === "un" ? "a" : "o"} {nomeUn}?</label>
            <div className="ni-linha">
              <span>R$</span>
              <input id="ni-preco" inputMode="decimal" placeholder="0,00" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} />
              <span>por {nomeUn}</span>
            </div>
            {pacote ? (
              <div className="ni-pacote">
                <span>Paguei R$</span>
                <input aria-label="Quanto pagou (R$)" inputMode="decimal" placeholder="0,00" value={pacote.pagou} onChange={(e) => setPacote({ ...pacote, pagou: e.target.value })} />
                <span>em</span>
                <input aria-label={`Quantidade do pacote (${sufixo})`} inputMode="decimal" placeholder="0" value={pacote.qtd} onChange={(e) => setPacote({ ...pacote, qtd: e.target.value })} />
                <span>{sufixo}</span>
                <button type="button" className="ins-btn entrada" onClick={calcularPacote}>Calcular</button>
              </div>
            ) : (
              <button type="button" className="ni-link" onClick={() => setPacote({ pagou: "", qtd: "" })}>
                Comprou em pacote, fardo ou saco? Calcular o preço
              </button>
            )}
          </div>
        </div>

        {!ed && (
          <div className="ni-passo">
            <span className="ni-num">4</span>
            <div>
              <label htmlFor="ni-qtd">Quanto tem agora? <small>(pode deixar em branco)</small></label>
              <div className="ni-linha">
                <input id="ni-qtd" inputMode="decimal" placeholder="0" value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} />
                <span>{sufixo}</span>
              </div>
            </div>
          </div>
        )}

        <div className="ni-passo">
          <span className="ni-num">{ed ? 4 : 5}</span>
          <div>
            <label htmlFor="ni-min">Me avise quando ficar com menos de <small>(opcional)</small></label>
            <div className="ni-linha">
              <input id="ni-min" inputMode="decimal" placeholder="0" value={f.minimo} onChange={(e) => setF({ ...f, minimo: e.target.value })} />
              <span>{sufixo}</span>
            </div>
          </div>
        </div>

        {erro && <p className="fin-erro">{erro}</p>}
        <div className="ins-modal-botoes">
          {ed && !tirar && <button type="button" className="ni-tirar" onClick={() => setTirar(true)}>Tirar da lista</button>}
          {ed && tirar && (
            <span className="fin-confirma">
              Tirar {editar.nome}? <button type="button" className="fin-btn-perigo" onClick={tirarDaLista}>Tirar</button>
              <button type="button" onClick={() => setTirar(false)}>Não</button>
            </span>
          )}
          <button type="button" className="ins-btn" onClick={fechar}>Cancelar</button>
          <button className="btn-verde" disabled={salvando}>{salvando ? "Salvando…" : ed ? "Salvar" : "Cadastrar"}</button>
        </div>
      </form>
    </div>
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
  const [soSem, setSoSem] = useState(false);
  const fichaDe = useMemo(() => Object.fromEntries((fichas || []).map((f) => [f.id, f])), [fichas]);
  const lista = useMemo(() => (produtos || []).filter((p) => p.nome && p.ativo !== false).sort((a, b) => String(a.categoria || "").localeCompare(String(b.categoria || ""), "pt-BR") || String(a.nome).localeCompare(String(b.nome), "pt-BR")), [produtos]);
  const semFicha = lista.filter((p) => !fichaDe[p.id]?.itens?.length).length;
  const mostrar = soSem ? lista.filter((p) => !fichaDe[p.id]?.itens?.length) : lista;
  return (
    <div className="relatorio-documento">
      <h2>Ficha técnica de cada produto</h2>
      <div className="fin-periodos">
        <button type="button" className={!soSem ? "ativo" : ""} onClick={() => setSoSem(false)}>Todos ({lista.length})</button>
        <button type="button" className={soSem ? "ativo" : ""} onClick={() => setSoSem(true)}>Sem ficha ({semFicha})</button>
      </div>
      <p className="fin-explica">Toque no produto e diga o que vai nele. Ex.: X-Burguer = 1 pão + 150 g de carne + 1 fatia de queijo. Com a ficha, cada venda desconta o estoque sozinha e o custo do produto é calculado.</p>
      <ul className="ins-fichas">
        {mostrar.map((p) => {
          const f = fichaDe[p.id];
          const custo = custoDaFicha(f, porId);
          const da = daParaQuantos(f, porId);
          return (
            <li key={p.id}>
              <button type="button" className="ins-ficha-linha" aria-expanded={aberto === p.id} onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                <span>
                  <strong>{p.nome}</strong>
                  <small>
                    {p.categoria || "Sem categoria"} · {f?.itens?.length ? `${f.itens.length} ${f.itens.length === 1 ? "ingrediente" : "ingredientes"}` : "sem ficha"}
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
  const [criados, setCriados] = useState({}); // ingredientes criados aqui (até o banco devolver)
  const todos = { ...criados, ...porId };
  const inicial = () => (ficha?.itens || []).map((it) => ({ insumoId: it.insumoId, qtd: String(paraFicha(it.qtd, porId[it.insumoId]?.unidade)).replace(".", ",") }));
  const [linhas, setLinhas] = useState(inicial);
  const [mudou, setMudou] = useState(false);
  const [novo, setNovo] = useState(false);
  const [msg, setMsg] = useState("");
  const muda = (l) => {
    setLinhas(l);
    setMudou(true);
    setMsg("");
  };
  const itens = linhas.filter((l) => l.insumoId && num(l.qtd) > 0).map((l) => ({ insumoId: l.insumoId, qtd: daFicha(l.qtd, todos[l.insumoId]?.unidade) }));
  const custo = custoDaFicha({ itens }, todos);
  const preco = Number(produto.preco || 0);
  const fora = [...insumos, ...Object.values(criados).filter((c) => !porId[c.id])].filter((i) => !linhas.some((l) => l.insumoId === i.id));
  const padrao = (i) => (i.unidade === "un" ? "1" : "100");
  const passo = (un) => (un === "un" ? 1 : 10);

  async function salvar() {
    await setDoc(doc(db, ...L(), "fichas", produto.id), { itens, nome: produto.nome, atualizadoEm: new Date().toISOString() });
    setMudou(false);
    setMsg("✓ Ficha salva");
  }

  return (
    <div className="ins-ficha">
      <p className="ficha-titulo">O que vai em 1 <b>{produto.nome}</b>?</p>
      {linhas.length === 0 && <p className="fin-explica">Toque nos ingredientes abaixo para pôr na ficha.</p>}
      {linhas.map((l, n) => {
        const ins = todos[l.insumoId];
        const u = unidadeDe(ins?.unidade);
        const q = num(l.qtd);
        const linhaCusto = ins && typeof ins.custo === "number" && q > 0 ? daFicha(l.qtd, ins.unidade) * ins.custo : null;
        const ajustar = (delta) => muda(linhas.map((x, k) => (k === n ? { ...x, qtd: String(Math.max(0, Math.round(((num(x.qtd) || 0) + delta) * 1000) / 1000)).replace(".", ",") } : x)));
        return (
          <div key={l.insumoId || n} className="ficha-linha">
            <div className="ficha-nome">
              <strong>{ins?.nome || "Ingrediente"}</strong>
              <small>{linhaCusto !== null ? `= ${R(linhaCusto)}` : ins && typeof ins.custo !== "number" ? "sem preço (edite o ingrediente)" : ""}</small>
            </div>
            <div className="ficha-qtd">
              <button type="button" aria-label={`Menos ${ins?.nome || ""}`} onClick={() => ajustar(-passo(ins?.unidade))}>−</button>
              <input aria-label={`Quantidade de ${ins?.nome || "ingrediente"} em ${u.sub}`} inputMode="decimal" value={l.qtd} onChange={(e) => muda(linhas.map((x, k) => (k === n ? { ...x, qtd: e.target.value } : x)))} />
              <span>{u.sub}</span>
              <button type="button" aria-label={`Mais ${ins?.nome || ""}`} onClick={() => ajustar(passo(ins?.unidade))}>+</button>
            </div>
            <button type="button" className="fin-btn-x" aria-label={`Tirar ${ins?.nome || "ingrediente"} da ficha`} onClick={() => muda(linhas.filter((_, k) => k !== n))}>✕</button>
          </div>
        );
      })}

      <div className="ficha-por">
        <span>Pôr ingrediente:</span>
        <div className="ni-sug">
          {fora.map((i) => (
            <button type="button" key={i.id} onClick={() => muda([...linhas, { insumoId: i.id, qtd: padrao(i) }])}>
              + {i.nome}
            </button>
          ))}
          <button type="button" className="ficha-novo" onClick={() => setNovo(true)}>+ Novo ingrediente</button>
        </div>
      </div>

      <div className={`ficha-custo ${custo !== null && preco > 0 && preco - custo < 0 ? "ruim" : ""}`}>
        {custo !== null ? (
          <>
            <span>Custo de 1 {produto.nome}</span>
            <strong>{R(custo)}</strong>
            {preco > 0 && (
              <small>
                vende por {R(preco)} · sobra {R(preco - custo)} ({Math.round(((preco - custo) / preco) * 100)}%) antes das taxas e despesas. Veja o preço ideal em Finanças → Preço certo.
              </small>
            )}
          </>
        ) : (
          <span>{itens.length ? "O custo aparece quando todos os ingredientes tiverem preço." : "Ponha os ingredientes para ver quanto custa."}</span>
        )}
      </div>

      <div className="ins-modal-botoes">
        <span className={mudou ? "ficha-pendente" : "fin-ok"}>{mudou ? "Alterações não salvas" : msg}</span>
        <button type="button" className="btn-verde" onClick={salvar} disabled={!mudou}>Salvar ficha</button>
      </div>
      {novo && (
        <NovoInsumo
          insumos={[...insumos, ...Object.values(criados)]}
          fechar={() => setNovo(false)}
          aoCriar={(ins) => {
            setCriados((c) => ({ ...c, [ins.id]: ins }));
            muda([...linhas, { insumoId: ins.id, qtd: padrao(ins) }]);
          }}
        />
      )}
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
