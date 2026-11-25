// Ingredientes: preço e estoque de cada INGREDIENTE (arroz, feijão, frango, farofa…), num lugar só (Cardápio e estoque → Custos,
// só o dono). Produto pronto (Coca, água) não entra aqui: aqui é o que se usa para FAZER o PF, o pastel, o hambúrguer.
// - "Comprei 10 kg por R$ 100,00" → R$ 10,00 o quilo (insumos/<id>.custo). Não mexe no estoque (compra com
//   estoque é no botão "+ Compra" da própria linha).
// - Busca pelo nome, filtros (Todos · Sem preço · Mexidos) e "usado em" (os produtos que levam o ingrediente).
// - Marca "✏️ alterado" nos 3 últimos ingredientes que tiveram o preço mexido (insumos/<id>.custoEm).
// - "✓ Terminei": confere tudo e as marcas recomeçam. O custo de cada produto sai dos ingredientes dele
//   (Preço certo → Ingredientes do produto).
import { useEffect, useMemo, useState } from "react";
import RegistrarPerda from "../../components/RegistrarPerda";
import { Link, useSearchParams } from "react-router-dom";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { L } from "../../loja";
import { NovoInsumo } from "../../components/FichaTecnica";
import { custoDaFicha, custoPronto, itensJuntos, rendimentoDe, unidadeDe } from "../../utils/insumos";
import { lerValor } from "../../utils/financas";
import { ehCategoriaDeBebida } from "../../utils/montagem";
import { contaDoProduto } from "../../utils/precificacao";
import { Movimentar } from "./Insumos";
import { mostrarQtd } from "../../utils/insumos";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R = (v) => (v < 0 ? `− R$ ${fmt(-v)}` : `R$ ${fmt(v)}`);
const num = (t) => {
  const s = String(t ?? "").trim();
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return s !== "" && Number.isFinite(n) ? n : NaN;
};
const qtdTxt = (n) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const semAcento = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const quando = (ms) =>
  new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Recife", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const MARCADOS = 3;
const porUn = (u) => (u === "un" ? "a unidade" : u === "L" ? "o litro" : "o quilo");
const unTxt = (u, n) => (u === "un" ? (n === 1 ? "unidade" : "unidades") : u === "L" ? (n === 1 ? "litro" : "litros") : "kg");

/** Os ids dos últimos ingredientes com o preço mexido depois do último "Terminei", do mais novo ao mais velho. */
export function ultimosMexidos(insumos, desde = 0, n = MARCADOS) {
  return (insumos || [])
    .filter((i) => i.ativo !== false)
    .map((i) => ({ id: i.id, em: Date.parse(i.custoEm || "") }))
    .filter((x) => Number.isFinite(x.em) && x.em > desde)
    .sort((a, b) => b.em - a.em)
    .slice(0, n);
}

/** "Comprei [10] kg por R$ [100]" → o preço do quilo. Salva só o preço (o estoque não muda). */
function PrecoDoIngrediente({ insumo, fechar }) {
  const u = insumo.unidade || "un";
  const ref = insumo.compraRef;
  const [qtd, setQtd] = useState(ref?.qtd ? qtdTxt(ref.qtd) : "1");
  const [valor, setValor] = useState(ref?.valor ? fmt(ref.valor) : typeof insumo.custo === "number" ? fmt(insumo.custo) : "");
  const [msg, setMsg] = useState("");
  const q = num(qtd);
  const v = lerValor(valor);
  const cada = q > 0 && v > 0 ? v / q : null;
  async function salvar(e) {
    e.preventDefault();
    if (cada === null) return setMsg("Diga quanto comprou e quanto pagou.");
    try {
      const agora = new Date().toISOString();
      await setDoc(
        doc(db, ...L(), "insumos", insumo.id),
        { custo: Math.round(cada * 10000) / 10000, compraRef: { qtd: Math.round(q * 1000) / 1000, valor: v }, custoEm: agora, atualizadoEm: agora },
        { merge: true }
      );
      fechar();
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
  }
  return (
    <div className="ins-modal" role="dialog" aria-modal="true" aria-label={`Preço de ${insumo.nome}`} onClick={fechar}>
      <form className="ins-modal-caixa cu-form" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h2>{insumo.nome}</h2>
        <p className="fin-explica">Quanto você comprou e quanto pagou. O sistema calcula o preço de {porUn(u)}.</p>
        <div className="cu-comprei">
          <span>Comprei</span>
          <input aria-label={`Quanto comprou (${unTxt(u, 2)})`} inputMode="decimal" value={qtd} onChange={(e) => { setQtd(e.target.value); setMsg(""); }} />
          <span>{unTxt(u, q)}</span>
          <span>por R$</span>
          <input aria-label="Quanto pagou (R$)" inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => { setValor(e.target.value); setMsg(""); }} />
        </div>
        {cada !== null && (
          <p className="cu-cada">
            = <b>{R(cada)}</b> {u === "un" ? "cada unidade" : `cada ${unidadeDe(u).nomeLongo}`}
          </p>
        )}
        {msg && <p className="fin-erro">{msg}</p>}
        <div className="ins-modal-botoes">
          <button type="button" className="ins-btn" onClick={fechar}>Cancelar</button>
          <button className="btn-verde" disabled={cada === null}>Salvar</button>
        </div>
      </form>
    </div>
  );
}

export default function Custos({ produtos, insumos, fichas }) {
  const [params] = useSearchParams();
  const [busca, setBusca] = useState(() => params.get("busca") || "");
  const [filtro, setFiltro] = useState("todos");
  const [salvo, setSalvo] = useState(null); // configuracoes/precificacao (custosConferidoEm e o Preço certo)
  const [editar, setEditar] = useState(null); // ingrediente com o "Comprei…" aberto
  const [novo, setNovo] = useState(false);
  const [acao, setAcao] = useState(null); // { insumo, tipo: "compra" | "contagem" }
  const [perdaDe, setPerdaDe] = useState(null);
  const [editarCadastro, setEditarCadastro] = useState(null);
  const [conferido, setConferido] = useState(null);
  const [msg, setMsg] = useState("");
  useEffect(() => onSnapshot(doc(db, ...L(), "configuracoes", "precificacao"), (s) => setSalvo(s.data() || {}), () => setSalvo({})), []);

  const ativos = useMemo(() => (insumos || []).filter((i) => i.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")), [insumos]);
  const porId = useMemo(() => Object.fromEntries((insumos || []).map((i) => [i.id, i])), [insumos]);
  const produtosAtivos = useMemo(() => (produtos || []).filter((x) => x.nome && x.ativo !== false), [produtos]);
  // Em que produtos cada ingrediente vai (pela lista de ingredientes de cada produto).
  const usadoEm = useMemo(() => {
    const nomeDe = Object.fromEntries(produtosAtivos.map((x) => [x.id, x.nome]));
    const m = {};
    (fichas || []).forEach((f) => {
      if (!nomeDe[f.id]) return;
      // Também o que muda com a escolha (açaí pelo copo, carne pela marmita).
      [...itensJuntos(f), ...(f.variaPor?.itens || [])].forEach((it) => {
        if (!it?.insumoId) return;
        (m[it.insumoId] = m[it.insumoId] || []).includes(nomeDe[f.id]) || m[it.insumoId].push(nomeDe[f.id]);
      });
    });
    return m;
  }, [fichas, produtosAtivos]);
  const desde = Date.parse(salvo?.custosConferidoEm || "") || 0;
  const mexidos = useMemo(() => ultimosMexidos(insumos, desde), [insumos, desde]);
  const mexidoEm = Object.fromEntries(mexidos.map((m) => [m.id, m.em]));
  if (salvo === null) return <p className="fin-carregando"><span className="if-carrega" aria-hidden="true"><i /></span>Carregando…</p>;

  const temPreco = (i) => typeof i.custo === "number" && i.custo > 0;
  const semPreco = ativos.filter((i) => !temPreco(i));
  const termo = semAcento(busca.trim());
  const mostrar = ativos.filter(
    (i) => (!termo || semAcento(i.nome).includes(termo)) && (filtro === "sem" ? !temPreco(i) : filtro === "mexidos" ? mexidoEm[i.id] : true)
  );

  async function terminei() {
    // Confere com o que está cadastrado agora: ingredientes sem preço, produtos com o custo incompleto ou sem
    // ingredientes, e quem está abaixo do preço mínimo no Preço certo.
    const fichaDe = Object.fromEntries((fichas || []).map((f) => [f.id, f]));
    const feitos = produtosAtivos.filter((x) => !ehCategoriaDeBebida(x.categoria));
    const semIngredientes = [];
    const incompletos = [];
    const abaixo = [];
    feitos.forEach((x) => {
      const f = fichaDe[x.id];
      if (!f || (!itensJuntos(f).length && !(f.variaPor?.itens || []).length)) return semIngredientes.push(x.nome);
      const c = custoDaFicha(f, porId);
      if (c === null) return incompletos.push(x.nome);
      // Dá prejuízo depois de tudo (ingredientes, taxas e a parte das contas): o mesmo do Preço certo.
      const r = salvo.conta === "ingredientes" ? null : contaDoProduto(c, x.preco, salvo);
      if (r && r.lucro < 0) abaixo.push(`${x.nome} (vende ${R(Number(x.preco || 0))}, prejuízo de ${R(-r.lucro)})`);
    });
    setConferido({
      total: ativos.length,
      comPreco: ativos.length - semPreco.length,
      semPreco: semPreco.map((i) => i.nome),
      semIngredientes,
      incompletos,
      abaixo,
    });
    try {
      await setDoc(doc(db, ...L(), "configuracoes", "precificacao"), { custosConferidoEm: new Date().toISOString() }, { merge: true });
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
  }

  return (
    <div className="relatorio-documento cu">
      <p className="fin-explica">
        Tudo o que se usa para fazer os produtos (arroz, feijão, frango, farofa, massa…): o preço de cada um e quanto tem. Toque no ingrediente e diga quanto comprou e quanto pagou. Cada venda desconta o estoque sozinha. Contagem, perdas e histórico ficam em Estoque.
      </p>
      <div className="cu-resumo">
        <span><b>{ativos.length - semPreco.length}</b> de {ativos.length} ingredientes com preço</span>
        <button type="button" className="btn-verde" onClick={() => setNovo(true)}>+ Novo ingrediente</button>
        <button type="button" className="pd-novo" style={{ margin: "8px 0 0" }} onClick={() => setPerdaDe(true)}>Registrar saída de alimento</button>
      </div>
      <input className="cu-busca" type="search" placeholder="🔎 Procurar ingrediente pelo nome" aria-label="Procurar ingrediente pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="fin-periodos cu-filtros" role="group" aria-label="Filtrar ingredientes">
        {[
          { id: "todos", nome: `Todos (${ativos.length})` },
          { id: "sem", nome: `Sem preço (${semPreco.length})` },
          { id: "mexidos", nome: `✏️ Mexidos (${mexidos.length})` },
        ].map((f) => (
          <button key={f.id} type="button" className={filtro === f.id ? "ativo" : ""} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.nome}
          </button>
        ))}
      </div>
      {ativos.length === 0 && <p className="fin-explica">Nenhum ingrediente ainda. Toque em "+ Novo ingrediente" (ex.: Arroz, Feijão, Frango).</p>}
      {ativos.length > 0 && mostrar.length === 0 && <p className="fin-explica">{termo ? "Nenhum ingrediente com esse nome." : "Nenhum ingrediente aqui."}</p>}
      <ul className="pc-lista cu-lista">
        {mostrar.map((i) => {
          const u = i.unidade || "un";
          const usos = usadoEm[i.id] || [];
          return (
            <li key={i.id} className={`cu-item ${mexidoEm[i.id] ? "mexido" : ""}`}>
              <button type="button" className="cu-linha" onClick={() => setEditar(i)} aria-label={`Preço de ${i.nome}`}>
                <span className="cu-nome">
                  <strong>{i.nome}</strong>
                  {i.compraRef?.qtd > 0 && i.compraRef?.valor > 0 && (
                    <small>Comprei {qtdTxt(i.compraRef.qtd)} {unTxt(u, i.compraRef.qtd)} por {R(i.compraRef.valor)}</small>
                  )}
                  <small>{usos.length ? `Vai em: ${usos.slice(0, 4).join(", ")}${usos.length > 4 ? ` e mais ${usos.length - 4}` : ""}` : "Ainda não está em nenhum produto"}</small>
                  {mexidoEm[i.id] && <small className="cu-marca">✏️ alterado {quando(mexidoEm[i.id])}</small>}
                </span>
                <span className="cu-custo">
                  {temPreco(i) ? (
                    <>
                      <b>{R(i.custo)}</b>
                      <small>{u === "un" ? "a unidade" : `o ${unidadeDe(u).nomeLongo}`}</small>
                      {rendimentoDe(i) < 1 && <small>pronto {R(custoPronto(i))} · rende {Math.round(rendimentoDe(i) * 100)}%</small>}
                    </>
                  ) : (
                    <b className="pc-chip baixo">Sem preço</b>
                  )}
                  <small className={`cu-estoque ${Number(i.quantidade || 0) <= 0 ? "zerado" : Number(i.minimo || 0) > 0 && Number(i.quantidade || 0) <= Number(i.minimo) ? "baixo" : ""}`}>tem {mostrarQtd(Number(i.quantidade || 0), u)}</small>
                </span>
              </button>
              <div className="ins-acoes cu-acoes">
                <button type="button" className="ins-btn" onClick={() => setEditar(i)}>Preço</button>
                <button type="button" className="ins-btn entrada" onClick={() => setAcao({ insumo: i, tipo: "compra" })}>+ Compra</button>
                <button type="button" className="ins-btn" onClick={() => setPerdaDe(i)}>Perda</button>
                <button type="button" className="ins-btn" onClick={() => setAcao({ insumo: i, tipo: "contagem" })}>Contar</button>
                <button type="button" className="ins-btn" onClick={() => setEditarCadastro(i)}>Editar</button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="cu-fim">
        <button type="button" className="btn-verde" onClick={terminei}>✓ Terminei: conferir tudo</button>
        {msg && <p className="fin-aviso">{msg}</p>}
      </div>
      {conferido && (
        <div className="cu-conferido" role="status">
          <h3>Conferido</h3>
          <p>✓ {conferido.comPreco} de {conferido.total} ingredientes com preço.</p>
          {conferido.semPreco.length > 0 && <p>⚠️ Sem preço: {conferido.semPreco.join(", ")}.</p>}
          {conferido.incompletos.length > 0 && <p>⚠️ Custo incompleto (algum ingrediente sem preço): {conferido.incompletos.join(", ")}.</p>}
          {conferido.semIngredientes.length > 0 && <p>⚠️ Ainda sem ingredientes (Produtos → editar): {conferido.semIngredientes.join(", ")}.</p>}
          {conferido.abaixo.length > 0 && <p>⚠️ Dão prejuízo (ingredientes, taxas e contas passam do preço): {conferido.abaixo.join("; ")}.</p>}
          <Link to="/cardapio?aba=preco" className="cu-link">Ver no Preço certo →</Link>
        </div>
      )}
      {editar && <PrecoDoIngrediente key={editar.id} insumo={editar} fechar={() => setEditar(null)} />}
      {novo && <NovoInsumo insumos={ativos} fechar={() => setNovo(false)} />}
      {editarCadastro && <NovoInsumo insumos={ativos} editar={editarCadastro} fechar={() => setEditarCadastro(null)} />}
      {acao && <Movimentar acao={acao} fechar={() => setAcao(null)} />}
      {perdaDe && <RegistrarPerda inicial={perdaDe === true ? {} : { insumo: perdaDe }} fechar={() => setPerdaDe(null)} />}
    </div>
  );
}
