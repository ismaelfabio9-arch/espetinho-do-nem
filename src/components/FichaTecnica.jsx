// Ficha técnica (o que vai em cada produto), cadastro de ingrediente e o preço certo do produto.
// Usado dentro do cadastro do produto (Cardápio e estoque → Produtos → editar) e na Matéria-prima.
import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { L } from "../loja";
import { custoDaFicha, daFicha, daParaQuantos, paraFicha, unidadeDe } from "../utils/insumos";
import { calcularFinancas, isoDia, juntarVendas, lerValor } from "../utils/financas";
import { percentuaisDaLoja, percentuaisFinais, precoDoProduto } from "../utils/precificacao";
import { useTaxas } from "../utils/taxas";
import "../styles/Garcom/Financas.css";
import "../styles/Garcom/Insumos.css";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R = (v) => (v < 0 ? `− R$ ${fmt(-v)}` : `R$ ${fmt(v)}`);
const num = (v) => {
  const t = String(v ?? "").trim();
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
};
const quem = () => auth.currentUser?.email || "";
/** Nome sem acento e minúsculo, para achar "Feijão" em "Feijão carioca". */
const sem = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
/** O que vem no prato pelo cadastro dele (vem no prato + os grupos de escolha, ex.: Feijão). */
function doCadastro(produto) {
  const m = produto?.montagem;
  if (!m) return [];
  const nomes = [...(m.vem || []), ...(m.escolhas || []).map((e) => e.nome)].map((n) => String(n || "").trim()).filter(Boolean);
  return nomes.filter((n, i) => nomes.findIndex((x) => sem(x) === sem(n)) === i);
}
/** O ingrediente que corresponde a um item do prato ("Arroz" → "Arroz branco"). */
const acharInsumo = (lista, nome) => lista.find((i) => sem(i.nome) === sem(nome)) || lista.find((i) => sem(i.nome).startsWith(sem(nome)) || sem(nome).startsWith(sem(i.nome)));

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
export function NovoInsumo({ insumos, editar, fechar, aoCriar, nomeInicial = "" }) {
  const ed = !!editar;
  const [f, setF] = useState(() => ({
    nome: editar?.nome || nomeInicial,
    unidade: editar?.unidade || SUGESTOES.find((x) => sem(x.nome) === sem(nomeInicial))?.unidade || "kg",
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

  // Compra em fardo/saco/caixa: "veio 20 pacotes de 1 kg por R$ 120" → cada quilo saiu por R$ 6,00.
  const pacoteTotal = pacote ? (num(pacote.n) || 0) * (f.unidade === "un" ? 1 : num(pacote.tam) || 0) : 0;
  const pacotePagou = pacote ? lerValor(pacote.pagou) : 0;
  const pacoteCada = pacoteTotal > 0 && pacotePagou > 0 ? pacotePagou / pacoteTotal : null;
  function calcularPacote() {
    if (pacoteCada === null) return;
    setF({ ...f, preco: fmt(pacoteCada), quantidade: f.quantidade || String(Math.round(pacoteTotal * 1000) / 1000).replace(".", ",") });
    setPacote(null);
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
                <strong>Comprei em fardo, saco ou caixa:</strong>
                <span className="ni-pac-linha">
                  Veio
                  <input aria-label={f.unidade === "un" ? "Quantas unidades vieram" : "Quantos pacotes vieram"} inputMode="decimal" placeholder="20" value={pacote.n} onChange={(e) => setPacote({ ...pacote, n: e.target.value })} />
                  {f.unidade === "un" ? (
                    "unidades"
                  ) : (
                    <>
                      pacotes de
                      <input aria-label={`Tamanho de cada pacote (${u.id})`} inputMode="decimal" placeholder="1" value={pacote.tam} onChange={(e) => setPacote({ ...pacote, tam: e.target.value })} />
                      {u.id}
                    </>
                  )}
                </span>
                <span className="ni-pac-linha">
                  e paguei R$
                  <input aria-label="Quanto pagou por tudo (R$)" inputMode="decimal" placeholder="0,00" value={pacote.pagou} onChange={(e) => setPacote({ ...pacote, pagou: e.target.value })} />
                  por tudo
                </span>
                {pacoteCada !== null && (
                  <p className="ni-pac-res">
                    {f.unidade === "un" ? `${fmt(pacoteTotal)} unidades` : `${String(Math.round(pacoteTotal * 1000) / 1000).replace(".", ",")} ${u.id} no total`} → <b>cada {nomeUn} saiu por {R(pacoteCada)}</b>
                  </p>
                )}
                <button type="button" className="ins-btn entrada" disabled={pacoteCada === null} onClick={calcularPacote}>Usar esse preço</button>
              </div>
            ) : (
              <button type="button" className="ni-link" onClick={() => setPacote({ pagou: "", n: "", tam: "1" })}>
                Comprou em fardo, saco ou caixa? Toque aqui que o sistema calcula
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

function EditarFicha({ produto, ficha, insumos, porId, onCusto, precoAtual }) {
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
  const preco = Number(String(precoAtual ?? produto.preco ?? "").replace(",", ".")) || 0;
  const custoTxt = custo === null ? "" : String(custo);
  const temItens = itens.length > 0;
  useEffect(() => {
    onCusto?.(custoTxt === "" ? null : Number(custoTxt), temItens);
  }, [custoTxt, temItens, onCusto]);
  const fora = [...insumos, ...Object.values(criados).filter((c) => !porId[c.id])].filter((i) => !linhas.some((l) => l.insumoId === i.id));
  const padrao = (i) => (i.unidade === "un" ? "1" : "100");
  const passo = (un) => (un === "un" ? 1 : 10);

  // Salva sozinha um instante depois de cada mudança (sem botão a mais na tela do produto).
  const itensJson = JSON.stringify(itens);
  useEffect(() => {
    if (!mudou) return undefined;
    const t = setTimeout(async () => {
      try {
        await setDoc(doc(db, ...L(), "fichas", produto.id), { itens: JSON.parse(itensJson), nome: produto.nome, atualizadoEm: new Date().toISOString() });
        setMudou(false);
        setMsg("✓ Ingredientes salvos");
      } catch {
        setMsg("Não foi possível salvar. Confira a internet.");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [itensJson, mudou, produto.id, produto.nome]);

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

      {(() => {
        const todosIns = [...insumos, ...Object.values(criados).filter((c) => !porId[c.id])];
        const faltam = doCadastro(produto).filter((n) => {
          const ins = acharInsumo(todosIns, n);
          return !ins || !linhas.some((l) => l.insumoId === ins.id);
        });
        if (!faltam.length) return null;
        return (
          <div className="ficha-por ficha-cadastro">
            <span>Vem neste prato (do cadastro dele):</span>
            <div className="ni-sug">
              {faltam.map((n) => {
                const ins = acharInsumo(todosIns, n);
                return ins ? (
                  <button type="button" key={n} className="ficha-do-prato" onClick={() => muda([...linhas, { insumoId: ins.id, qtd: padrao(ins) }])}>
                    + {ins.nome}
                  </button>
                ) : (
                  <button type="button" key={n} className="ficha-do-prato novo" onClick={() => setNovo({ nome: n })}>
                    + {n} <small>(cadastrar o preço)</small>
                  </button>
                );
              })}
            </div>
            <small className="ficha-dica">Falta a carne ou outro item principal? Toque em + Novo ingrediente abaixo.</small>
          </div>
        );
      })()}

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
            <span>Só de ingredientes, 1 {produto.nome} custa</span>
            <strong>{R(custo)}</strong>
            {(() => {
              const da = daParaQuantos({ itens }, todos);
              return da ? <small className="ficha-da">{da.quantos === 0 ? `${da.limitante} está sem estoque registrado (registre a compra em Estoque para o sistema contar quantos dá para fazer)` : `Com o estoque de hoje dá para fazer mais ${da.quantos}${da.quantos <= 5 ? ` (${da.limitante} acabando)` : ""}`}</small> : null;
            })()}
            {preco > 0 && (
              <small>
                vende por {R(preco)} · sobra {R(preco - custo)} ({Math.round(((preco - custo) / preco) * 100)}%) depois do custo
              </small>
            )}
          </>
        ) : (
          <span>{itens.length ? "O custo aparece quando todos os ingredientes tiverem preço." : "Ponha os ingredientes para ver quanto custa."}</span>
        )}
      </div>

      <p className={mudou ? "ficha-pendente" : "fin-ok ficha-ok"} aria-live="polite">{mudou ? "Salvando…" : msg}</p>
      {novo && (
        <NovoInsumo
          insumos={[...insumos, ...Object.values(criados)]}
          nomeInicial={typeof novo === "object" ? novo.nome : ""}
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


/** Percentuais do Preço certo (Finanças) já calculados: config salva + movimento dos últimos 30 dias. */
export function usePercentuaisPreco() {
  const taxas = useTaxas();
  const [salvo, setSalvo] = useState(null);
  const [dias, setDias] = useState(null);
  const [hoje, setHoje] = useState(null);
  const [lanc, setLanc] = useState(null);
  useEffect(() => onSnapshot(doc(db, ...L(), "configuracoes", "precificacao"), (s) => setSalvo(s.data() || {}), () => setSalvo({})), []);
  useEffect(() => onSnapshot(query(collection(db, ...L(), "relatorioGerencial"), orderBy("criadoEm", "desc"), limit(40)), (s) => setDias(s.docs.map((d) => d.data())), () => setDias([])), []);
  useEffect(() => onSnapshot(collection(db, ...L(), "vendasDia"), (s) => setHoje(s.docs.map((d) => d.data())), () => setHoje([])), []);
  useEffect(() => onSnapshot(collection(db, ...L(), "despesas"), (s) => setLanc(s.docs.map((d) => d.data())), () => setLanc([])), []);
  if (salvo === null || dias === null || hoje === null || lanc === null) return null;
  const agora = new Date();
  const de = isoDia(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 29));
  const f30 = calcularFinancas({ vendas: juntarVendas(dias, hoje), produtos: [], custos: {}, lancamentos: lanc, taxas, de, ate: isoDia(agora) });
  return percentuaisFinais(salvo, percentuaisDaLoja(f30, taxas));
}

/** Resumo do preço certo de um produto (custo, preço de hoje e o sugerido). */
export function PrecoNoProduto({ custo, preco }) {
  const p = usePercentuaisPreco();
  if (p === null || typeof custo !== "number") return null;
  const r = precoDoProduto(custo, Number(String(preco ?? "").replace(",", ".")) || 0, p);
  if (r.situacao === "impossivel")
    return <p className="pnp baixo pnp-aviso">⚠️ As despesas e o lucro que você quer passaram de 100% de cada venda: não tem preço que pague. Confira em Cardápio e estoque → Preço certo (e o "Quanto a loja vende por mês").</p>;
  if (r.situacao !== "bom" && r.situacao !== "baixo") return null;
  const d = r.noSugerido;
  return (
    <div className={`pnp ${r.situacao}`}>
      <div className="pnp-conta">
        <span>Só de ingredientes (comida)</span><b>{R(d.custo)}</b>
        {d.taxas > 0 && (<><span>+ Maquininha e impostos</span><b>{R(d.taxas)}</b></>)}
        {d.fixas > 0 && (<><span>+ Parte do aluguel, funcionários e contas</span><b>{R(d.fixas)}</b></>)}
        <span>+ Seu lucro</span><b>{R(d.lucro)}</b>
        <span className="pnp-total">= Preço para vender</span><b className="pnp-total">{R(r.sugerido)}</b>
      </div>
      <p>
        {r.situacao === "bom" ? `✓ Vendendo a ${R(r.hoje.preco)} (hoje) está bom: lucro limpo de ${R(r.lucroReal)} em cada um.` : `Vendendo a ${R(r.hoje.preco)} (hoje) o lucro limpo é ${R(r.lucroReal)}: abaixo do que você quer.`}
      </p>
    </div>
  );
}

/** Ficha técnica + custo (ou custo digitado) + preço certo, dentro do cadastro do produto. */
export function FichaDoProduto({ produto, precoAtual }) {
  const [insumos, setInsumos] = useState(null);
  const [ficha, setFicha] = useState(undefined);
  const [custoManual, setCustoManual] = useState(undefined);
  const [texto, setTexto] = useState(null);
  const [custoFicha, setCustoFicha] = useState({ custo: null, temItens: false });
  useEffect(() => onSnapshot(collection(db, ...L(), "insumos"), (s) => setInsumos(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setInsumos([])), []);
  useEffect(() => onSnapshot(doc(db, ...L(), "fichas", produto.id), (s) => setFicha(s.exists() ? s.data() : null), () => setFicha(null)), [produto.id]);
  useEffect(() => onSnapshot(doc(db, ...L(), "custos", produto.id), (s) => setCustoManual(typeof s.data()?.custo === "number" ? s.data().custo : null), () => setCustoManual(null)), [produto.id]);
  const aoCusto = useCallback((custo, temItens) => setCustoFicha({ custo, temItens }), []);
  if (insumos === null || ficha === undefined || custoManual === undefined) return <p className="fin-carregando">Carregando…</p>;
  const ativos = insumos.filter((i) => i.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  const porId = Object.fromEntries(insumos.map((i) => [i.id, i]));
  const custo = custoFicha.temItens ? custoFicha.custo : custoManual;
  async function gravarManual() {
    if (texto === null) return;
    const vazio = texto.trim() === "";
    await setDoc(doc(db, ...L(), "custos", produto.id), { custo: vazio ? null : lerValor(texto), nome: produto.nome, atualizadoEm: new Date().toISOString() }, { merge: true });
    setTexto(null);
  }
  return (
    <div className="fdp">
      <EditarFicha produto={produto} ficha={ficha} insumos={ativos} porId={porId} onCusto={aoCusto} precoAtual={precoAtual} />
      {!custoFicha.temItens && (
        <label className="fdp-manual">
          <span>Não usa ingredientes (ex.: bebida pronta)? Digite o custo de 1 unidade:</span>
          <span className="pc-input">
            R$
            <input inputMode="decimal" placeholder="0,00" aria-label={`Custo de ${produto.nome}`} value={texto ?? (typeof custoManual === "number" ? fmt(custoManual) : "")} onChange={(e) => setTexto(e.target.value)} onBlur={gravarManual} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
          </span>
        </label>
      )}
      <PrecoNoProduto custo={custo} preco={precoAtual ?? produto.preco} />
    </div>
  );
}
