// Ficha técnica (o que vai em cada produto), cadastro de ingrediente e o preço certo do produto.
// Usado dentro do cadastro do produto (Cardápio e estoque → Produtos → editar) e na Matéria-prima.
import { useCallback, useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { L } from "../loja";
import { custoDaFicha, custosPorOpcao, daFicha, daParaQuantos, itensJuntos, mostrarQtd, paraFicha, unidadeDe } from "../utils/insumos";
import { tipoDe } from "../utils/montagem";
import { lerValor } from "../utils/financas";
import { contaDoProduto, pesoIngredientes, precoBonito } from "../utils/precificacao";
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
  // Os grupos de escolha (Feijão, Salada) são comida só no prato de almoço; no pastel "Recheio" não é ingrediente.
  const grupos = tipoDe(produto) === "prato" ? (m.escolhas || []).map((e) => e.nome) : [];
  const nomes = [...(m.vem || []), ...grupos].map((n) => String(n || "").trim()).filter(Boolean);
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
    quantidade: editar && Number(editar.quantidade) > 0 ? String(editar.quantidade).replace(".", ",") : "",
    minimo: editar && Number(editar.minimo) > 0 ? String(editar.minimo).replace(".", ",") : "",
  }));
  const [pacote, setPacote] = useState(null); // { pagou, qtd } calcular o preço de um pacote
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [tirar, setTirar] = useState(false);
  const u = unidadeDe(f.unidade);
  // Editando: dá para trocar a unidade (cadastrou por kg, mas era por unidade).
  const trocouUnidade = ed && f.unidade !== (editar.unidade || "un");
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
        const antes = Number(editar.quantidade || 0);
        await setDoc(
          doc(db, ...L(), "insumos", editar.id),
          { nome: nome.slice(0, 60), ...(preco > 0 ? { custo: preco } : {}), ...(preco > 0 && preco !== editar.custo ? { custoEm: agora } : {}), minimo, ...(trocouUnidade ? { unidade: f.unidade, quantidade } : {}), atualizadoEm: agora },
          { merge: true }
        );
        if (trocouUnidade && quantidade !== antes)
          await addDoc(collection(db, ...L(), "insumosMov"), { insumoId: editar.id, nome, tipo: "contagem", qtd: quantidade - antes, antes, depois: quantidade, motivo: `Trocou a unidade para ${unidadeDe(f.unidade).nome}`, em: agora, por: quem(), criadoEm: serverTimestamp() });
        fechar();
        return;
      }
      const dados = { nome: nome.slice(0, 60), unidade: f.unidade, quantidade, minimo, ...(preco > 0 ? { custo: preco, custoEm: agora } : {}), ativo: true, criadoEm: serverTimestamp(), atualizadoEm: agora };
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
            {(
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
            {trocouUnidade && (
              <p className="fin-aviso ni-troca">
                Trocando de {unidadeDe(editar.unidade).nomeLongo} para {nomeUn}: confira o preço e o quanto tem abaixo, e a quantidade de {f.nome || "dele"} nos produtos que usam (Produtos → editar → Ingredientes).
              </p>
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

        {(!ed || trocouUnidade) && (
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
          <span className="ni-num">{ed && !trocouUnidade ? 4 : 5}</span>
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

/** Linhas de ingredientes (quanto de cada, quanto custa e para quantos o estoque dá) + os botões para pôr mais. */
function LinhasFicha({ linhas, muda, todos, lista, novo, extra = null, vazio, preco = 0 }) {
  const fora = lista.filter((i) => !linhas.some((l) => l.insumoId === i.id));
  const passo = (un) => (un === "un" ? 1 : 10);
  return (
    <>
      {linhas.length === 0 && vazio && <p className="fin-explica">{vazio}</p>}
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
              <small>{linhaCusto !== null ? `= ${R(linhaCusto)}${preco > 0 ? ` · ${pctPreco(linhaCusto, preco)} do preço` : ""}` : ins && typeof ins.custo !== "number" ? "sem preço (edite o ingrediente)" : ""}</small>
              {ins && q > 0 && (
                <small className="ficha-estoque">
                  {Number(ins.quantidade || 0) > 0
                    ? `Estoque ${mostrarQtd(ins.quantidade, ins.unidade)} → dá para ${Math.floor(Number(ins.quantidade) / daFicha(l.qtd, ins.unidade) + 1e-9)}`
                    : "Sem estoque registrado"}
                </small>
              )}
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
      {extra}
      <div className="ficha-por">
        <span>Pôr ingrediente:</span>
        <div className="ni-sug">
          {fora.map((i) => (
            <button type="button" key={i.id} onClick={() => muda([...linhas, { insumoId: i.id, qtd: i.unidade === "un" ? "1" : "100" }])}>
              + {i.nome}
            </button>
          ))}
          <button type="button" className="ficha-novo" onClick={() => novo()}>+ Novo ingrediente</button>
        </div>
      </div>
    </>
  );
}

/** 0,75 de 13,00 → "6%" (menos de 1% → "menos de 1%"). */
const pctPreco = (v, preco) => {
  const x = (v / preco) * 100;
  return x > 0 && x < 1 ? "menos de 1%" : `${Math.round(x)}%`;
};
const paraLinhas = (itens, porId) => (itens || []).map((it) => ({ insumoId: it.insumoId, qtd: String(paraFicha(it.qtd, porId[it.insumoId]?.unidade)).replace(".", ",") }));

function EditarFicha({ produto, ficha, insumos, porId, onCusto, precoAtual, onNomes, grupos = [] }) {
  const [criados, setCriados] = useState({}); // ingredientes criados aqui (até o banco devolver)
  const todos = { ...criados, ...porId };
  const [linhas, setLinhas] = useState(() => paraLinhas(itensJuntos(ficha), porId));
  const [mudou, setMudou] = useState(false);
  const [novo, setNovo] = useState(false); // { nome? }
  const [msg, setMsg] = useState("");
  const muda = (l) => {
    setLinhas(l);
    setMudou(true);
    setMsg("");
  };
  const itens = linhas.filter((l) => l.insumoId && num(l.qtd) > 0).map((l) => ({ insumoId: l.insumoId, qtd: daFicha(l.qtd, todos[l.insumoId]?.unidade) }));
  // Ingrediente que muda com uma escolha (ex.: o peixe pelo tamanho): quantidade em cada opção.
  const [varia, setVaria] = useState(() => ({
    grupo: ficha?.variaPor?.grupo || "",
    linhas: (ficha?.variaPor?.itens || []).map((it) => ({
      insumoId: it.insumoId,
      qtd: Object.fromEntries(Object.entries(it.qtd || {}).map(([op, q]) => [op, String(paraFicha(q, porId[it.insumoId]?.unidade)).replace(".", ",")])),
    })),
  }));
  const mudaVaria = (v) => {
    setVaria(v);
    setMudou(true);
    setMsg("");
  };
  const grupoVaria = grupos.find((g) => g.nome === varia.grupo) || grupos.find((g) => /tamanh/i.test(g.nome)) || grupos[0] || null;
  const variaPor = (() => {
    if (!grupoVaria) return null;
    const vItens = varia.linhas
      .filter((l) => l.insumoId)
      .map((l) => ({ insumoId: l.insumoId, qtd: Object.fromEntries(grupoVaria.opcoes.map((op) => [op, daFicha(l.qtd?.[op] || "0", todos[l.insumoId]?.unidade)])) }))
      .filter((it) => Object.values(it.qtd).some((q) => q > 0));
    return vItens.length ? { grupo: grupoVaria.nome, opcoes: grupoVaria.opcoes, itens: vItens } : null;
  })();
  const fichaAtual = { itens, variaPor };
  const porOpcao = custosPorOpcao(fichaAtual, todos);
  // Com tamanho, o custo do produto é o da 1ª opção (a do preço do produto).
  const custo = custoDaFicha(fichaAtual, todos);
  const preco = Number(String(precoAtual ?? produto.preco ?? "").replace(",", ".")) || 0;
  const custoTxt = custo === null ? "" : String(custo);
  const temItens = itens.length > 0 || !!variaPor;
  useEffect(() => {
    onCusto?.(custoTxt === "" ? null : Number(custoTxt), temItens);
  }, [custoTxt, temItens, onCusto]);
  // Os nomes dos ingredientes (na ordem) viram o "O que vem" do cardápio quando o produto é salvo. O que já vinha
  // no prato e ainda não é ingrediente cadastrado (ex.: Salada) continua no cardápio.
  const nomesJson = JSON.stringify(
    (() => {
      const daFichaNomes = [...linhas, ...varia.linhas].filter((l) => l.insumoId && todos[l.insumoId]?.nome).map((l) => todos[l.insumoId].nome);
      const semCadastro = doCadastro(produto).filter((n) => !acharInsumo(Object.values(todos), n) && !daFichaNomes.some((x) => sem(x) === sem(n)));
      return daFichaNomes.length ? [...daFichaNomes, ...semCadastro] : [];
    })()
  );
  useEffect(() => {
    onNomes?.(JSON.parse(nomesJson));
  }, [nomesJson, onNomes]);
  const lista = [...insumos, ...Object.values(criados).filter((c) => !porId[c.id])];

  // Salva sozinha um instante depois de cada mudança (sem botão a mais na tela do produto).
  const itensJson = JSON.stringify({ itens, variaPor });
  useEffect(() => {
    if (!mudou) return undefined;
    const t = setTimeout(async () => {
      try {
        await setDoc(doc(db, ...L(), "fichas", produto.id), { ...JSON.parse(itensJson), nome: produto.nome, atualizadoEm: new Date().toISOString() });
        setMudou(false);
        setMsg("✓ Ingredientes salvos");
      } catch {
        setMsg("Não foi possível salvar. Confira a internet.");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [itensJson, mudou, produto.id, produto.nome]);
  // Fechou a tela antes do salvamento automático (ex.: tocou em Salvar logo depois de pôr um
  // ingrediente): grava na hora o que estava pendente, para não perder.
  const pendente = useRef(null);
  pendente.current = mudou ? { id: produto.id, nome: produto.nome, itens: itensJson } : null;
  useEffect(
    () => () => {
      const p = pendente.current;
      if (p) setDoc(doc(db, ...L(), "fichas", p.id), { ...JSON.parse(p.itens), nome: p.nome, atualizadoEm: new Date().toISOString() }).catch(() => {});
    },
    []
  );

  const doPrato = (() => {
    const faltam = doCadastro(produto).filter((n) => {
      const ins = acharInsumo(lista, n);
      return !ins || !linhas.some((l) => l.insumoId === ins.id);
    });
    if (!faltam.length) return null;
    return (
      <div className="ficha-por ficha-cadastro">
        <span>Vem neste prato (do cadastro dele):</span>
        <div className="ni-sug">
          {faltam.map((n) => {
            const ins = acharInsumo(lista, n);
            return ins ? (
              <button type="button" key={n} className="ficha-do-prato" onClick={() => muda([...linhas, { insumoId: ins.id, qtd: ins.unidade === "un" ? "1" : "100" }])}>
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
  })();

  return (
    <div className="ins-ficha">
      <p className="ficha-titulo">O que vai em 1 <b>{produto.nome}</b>?</p>
      <LinhasFicha linhas={linhas} muda={muda} todos={todos} lista={lista} novo={() => setNovo({})} extra={doPrato} preco={preco} vazio="Toque nos ingredientes abaixo para pôr na ficha." />

      {grupoVaria && (
        <div className="ficha-varia">
          <span className="ficha-varia-titulo">Algum ingrediente muda com {grupoVaria.nome.toLowerCase()}?</span>
          {grupos.length > 1 && (
            <select value={grupoVaria.nome} onChange={(e) => mudaVaria({ ...varia, grupo: e.target.value })} aria-label="Escolha que muda a quantidade">
              {grupos.map((g) => (
                <option key={g.nome} value={g.nome}>{g.nome}</option>
              ))}
            </select>
          )}
          <small className="ficha-dica">
            Ex.: o peixe: 200 g no {grupoVaria.opcoes[0]}, 300 g no {grupoVaria.opcoes[1] || "outro"}. O que é igual em todos (arroz, feijão, salada…) fica nos ingredientes acima.
          </small>
          {varia.linhas.map((l, k) => {
            const ins = todos[l.insumoId];
            const u = unidadeDe(ins?.unidade);
            return (
              <div key={l.insumoId || k} className="ficha-varia-linha">
                <div className="ficha-varia-nome">
                  <b>{ins?.nome || "Ingrediente"}</b>
                  <button type="button" className="eo-x" aria-label={`Tirar ${ins?.nome || "ingrediente"}`} onClick={() => mudaVaria({ ...varia, linhas: varia.linhas.filter((_, j) => j !== k) })}>✕</button>
                </div>
                <div className="ficha-varia-qtds">
                  {grupoVaria.opcoes.map((op) => (
                    <label key={op}>
                      <span>{op}</span>
                      <span className="ficha-varia-campo">
                        <input
                          inputMode="decimal"
                          value={l.qtd?.[op] ?? ""}
                          onChange={(e) => mudaVaria({ ...varia, linhas: varia.linhas.map((x, j) => (j === k ? { ...x, qtd: { ...x.qtd, [op]: e.target.value } } : x)) })}
                          aria-label={`${ins?.nome || "Ingrediente"} no ${op}, em ${u.sub}`}
                        />
                        {u.sub}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              const naBase = linhas.find((x) => x.insumoId === id);
              const ins = todos[id];
              const q = naBase?.qtd || (ins?.unidade === "un" ? "1" : "100");
              // Já estava nos ingredientes de sempre: passa para cá (com a mesma quantidade em todos, para ajustar).
              if (naBase) setLinhas(linhas.filter((x) => x.insumoId !== id));
              mudaVaria({ grupo: grupoVaria.nome, linhas: [...varia.linhas, { insumoId: id, qtd: Object.fromEntries(grupoVaria.opcoes.map((op) => [op, q])) }] });
            }}
            aria-label="Pôr ingrediente que muda com a escolha"
          >
            <option value="">+ Ingrediente que muda com {grupoVaria.nome.toLowerCase()}…</option>
            {lista.filter((i) => !varia.linhas.some((l) => l.insumoId === i.id)).map((i) => (
              <option key={i.id} value={i.id}>{i.nome}</option>
            ))}
          </select>
        </div>
      )}

      {porOpcao && (
        <div className="ficha-custo ficha-custo-opcoes">
          <span>Só de ingredientes, por {grupoVaria.nome.toLowerCase()}:</span>
          {porOpcao.map(({ opcao, custo: c }) => {
            const p = grupoVaria.preco?.[opcao] ?? preco;
            return (
              <small key={opcao} className={c !== null && p > 0 && p - c < 0 ? "ficha-op-ruim" : ""}>
                <b>{opcao}</b>: {c === null ? "falta o preço de algum ingrediente" : `custa ${R(c)}${p > 0 ? ` · vende ${R(p)} · sobra ${R(p - c)} (${Math.round(((p - c) / p) * 100)}%)` : ""}`}
              </small>
            );
          })}
        </div>
      )}
      {!porOpcao && (
      <div className={`ficha-custo ${custo !== null && preco > 0 && preco - custo < 0 ? "ruim" : ""}`}>
        {custo !== null ? (
          <>
            <span>Só de ingredientes, 1 {produto.nome} custa</span>
            <strong>{R(custo)}</strong>
            {(() => {
              const da = daParaQuantos(fichaAtual, todos);
              return da ? <small className="ficha-da">{da.quantos === 0 ? `${da.limitante} está sem estoque registrado (registre a compra em Ingredientes para o sistema contar quantos dá para fazer)` : `Com o estoque de hoje dá para fazer mais ${da.quantos}${da.limitante ? ` (quem acaba primeiro: ${da.limitante})` : ""}`}</small> : null;
            })()}
            {preco > 0 && (
              <small>
                vende por {R(preco)} · sobra {R(preco - custo)} ({Math.round(((preco - custo) / preco) * 100)}%) depois do custo
              </small>
            )}
            {(() => {
              // O que mais pesa no preço: os 3 ingredientes mais caros deste produto.
              if (!(preco > 0) || itens.length < 3) return null;
              const caros = itens
                .map((it) => ({ nome: todos[it.insumoId]?.nome, v: Number(it.qtd) * Number(todos[it.insumoId]?.custo || 0) }))
                .filter((x) => x.nome && x.v > 0)
                .sort((a, b) => b.v - a.v)
                .slice(0, 3);
              return caros.length ? <small className="ficha-pesa">O que mais pesa: {caros.map((x) => `${x.nome} ${R(x.v)} (${pctPreco(x.v, preco)})`).join(" · ")}</small> : null;
            })()}
          </>
        ) : (
          <span>{itens.length ? "O custo aparece quando todos os ingredientes tiverem preço." : "Ponha os ingredientes para ver quanto custa."}</span>
        )}
      </div>
      )}

      <p className={mudou ? "ficha-pendente" : "fin-ok ficha-ok"} aria-live="polite">{mudou ? "Salvando…" : msg}</p>
      {novo && (
        <NovoInsumo
          insumos={lista}
          nomeInicial={novo.nome || ""}
          fechar={() => setNovo(false)}
          aoCriar={(ins) => {
            setCriados((c) => ({ ...c, [ins.id]: ins }));
            muda([...linhas, { insumoId: ins.id, qtd: ins.unidade === "un" ? "1" : "100" }]);
          }}
        />
      )}
    </div>
  );
}

/** O que o dono salvou no Preço certo (configuracoes/precificacao); null enquanto carrega. */
export function usePrecificacao() {
  const [salvo, setSalvo] = useState(null);
  useEffect(() => onSnapshot(doc(db, ...L(), "configuracoes", "precificacao"), (s) => setSalvo(s.data() || {}), () => setSalvo({})), []);
  return salvo;
}

/** Resumo do produto pelo custo dos ingredientes: quanto sobra em cada unidade (sem despesa fixa nem meta, que
 *  ficam no resultado do mês do Preço certo). */
export function PrecoNoProduto({ custo, preco, digitado = false }) {
  const salvo = usePrecificacao();
  if (salvo === null || typeof custo !== "number") return null;
  const p = Number(String(preco ?? "").replace(",", ".")) || 0;
  if (salvo.conta === "ingredientes") {
    const peso = pesoIngredientes(salvo);
    const minimo = precoBonito(custo / (peso / 100));
    const bom = p >= minimo - 0.004;
    return (
      <div className={`pnp ${bom ? "bom" : "baixo"}`}>
        <div className="pnp-conta">
          <span>Ingredientes (comida)</span><b>{R(custo)}</b>
          <span>Preço de hoje</span><b>{R(p)}</b>
          <span className="pnp-total">Preço mínimo ({String(peso).replace(".", ",")}% de ingredientes)</span><b className="pnp-total">{R(minimo)}</b>
        </div>
        <p>{bom ? `✓ Preço bom: os ingredientes são ${p > 0 ? Math.round((custo / p) * 100) : 0}% do preço.` : `Abaixo do mínimo: os ingredientes pesam demais no preço.`}</p>
      </div>
    );
  }
  const c = contaDoProduto(custo, p, salvo);
  if (!c) return null;
  return (
    <div className={`pnp ${c.lucro > 0 ? "bom" : "baixo"}`}>
      <div className="pnp-conta">
        <span>Preço de hoje</span><b>{R(p)}</b>
        <span>{digitado ? "− Custo digitado" : "− Ingredientes (com a embalagem)"}</span><b>{R(custo)}</b>
        {c.taxas > 0 && (<><span>− Maquininha e impostos</span><b>{R(c.taxas)}</b></>)}
        {c.parteContas > 0 && (<><span>− Parte das contas da loja</span><b>{R(c.parteContas)}</b></>)}
        <span className="pnp-total">= Lucro para você</span><b className="pnp-total">{R(c.lucro)}</b>
      </div>
      <p>
        {c.faltaVendas
          ? "Falta a parte das contas: diga quanto a loja vende por mês em Preço certo."
          : c.lucro < 0
          ? `Prejuízo de ${R(-c.lucro)} em cada um.${c.minimo ? ` Precisa vender por pelo menos ${R(c.minimo)}.` : ""}`
          : `${String(c.margem).replace(".", ",")}% do preço é lucro.${c.minimo ? ` Abaixo de ${R(c.minimo)} dá prejuízo.` : ""}`}
      </p>
    </div>
  );
}

/** Ingredientes do produto (o custo sai deles: o preço de cada um fica em Cardápio e estoque → Custos) + preço certo. */
export function FichaDoProduto({ produto, precoAtual, onNomes, grupos = [] }) {
  const [insumos, setInsumos] = useState(null);
  const [ficha, setFicha] = useState(undefined);
  const [custoManual, setCustoManual] = useState(undefined);
  const [custoFicha, setCustoFicha] = useState({ custo: null, temItens: false });
  useEffect(() => onSnapshot(collection(db, ...L(), "insumos"), (s) => setInsumos(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setInsumos([])), []);
  useEffect(() => onSnapshot(doc(db, ...L(), "fichas", produto.id), (s) => setFicha(s.exists() ? s.data() : null), () => setFicha(null)), [produto.id]);
  useEffect(() => onSnapshot(doc(db, ...L(), "custos", produto.id), (s) => setCustoManual(typeof s.data()?.custo === "number" ? s.data().custo : null), () => setCustoManual(null)), [produto.id]);
  const aoCusto = useCallback((custo, temItens) => setCustoFicha({ custo, temItens }), []);
  if (insumos === null || ficha === undefined || custoManual === undefined) return <p className="fin-carregando">Carregando…</p>;
  const ativos = insumos.filter((i) => i.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  const porId = Object.fromEntries(insumos.map((i) => [i.id, i]));
  const custo = custoFicha.temItens ? custoFicha.custo : custoManual;
  const digitado = !custoFicha.temItens && typeof custoManual === "number";
  // Custo digitado antes (sem ingredientes): fica valendo até o dono pôr os ingredientes ou apagar.
  async function apagarDigitado() {
    await setDoc(doc(db, ...L(), "custos", produto.id), { custo: null, nome: produto.nome, atualizadoEm: new Date().toISOString() }, { merge: true });
  }
  return (
    <div className="fdp">
      <EditarFicha produto={produto} ficha={ficha} insumos={ativos} porId={porId} onCusto={aoCusto} precoAtual={precoAtual} onNomes={onNomes} grupos={grupos} />
      {digitado && (
        <p className="fin-aviso fdp-digitado">
          Este produto está com um custo digitado antes ({R(custoManual)}), sem ingredientes. Ponha os ingredientes acima (em gramas: ex. 150 g de arroz por porção) que o custo passa a ser deles.{" "}
          <button type="button" className="ni-link" onClick={apagarDigitado}>Apagar o custo digitado</button>
        </p>
      )}
      <PrecoNoProduto custo={custo} preco={precoAtual ?? produto.preco} digitado={digitado} />
    </div>
  );
}
