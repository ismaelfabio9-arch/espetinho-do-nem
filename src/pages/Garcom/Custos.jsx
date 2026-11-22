// Custos: o custo de todos os produtos num lugar só (Cardápio e estoque → Custos, só o dono).
// - Busca pelo nome e filtros (Todos · Sem custo · Mexidos).
// - Marca "✏️ alterado" nos 3 últimos produtos mexidos: mexeu no 4º, a marca do mais antigo some.
// - "✓ Terminei": o sistema confere tudo (sem custo, abaixo do preço) e as marcas recomeçam.
// O custo vem dos ingredientes (fichas/<id>) ou do digitado (custos/<id>); os dois guardam atualizadoEm.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { L } from "../../loja";
import { FichaDoProduto } from "../../components/FichaTecnica";
import { percentuaisFinais, precoDoProduto } from "../../utils/precificacao";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R = (v) => (v < 0 ? `− R$ ${fmt(-v)}` : `R$ ${fmt(v)}`);
const semAcento = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const quando = (ms) =>
  new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Recife", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const MARCADOS = 3;

/** Os ids dos últimos produtos mexidos (custo ou ingredientes) depois do último "Terminei", do mais novo ao mais velho. */
export function ultimosMexidos(produtos, custosDocs, fichas, desde = 0, n = MARCADOS) {
  const em = {};
  const marca = (id, iso) => {
    const t = Date.parse(iso || "");
    if (Number.isFinite(t) && t > (em[id] || 0)) em[id] = t;
  };
  (custosDocs || []).forEach((c) => marca(c.id, c.atualizadoEm));
  (fichas || []).forEach((f) => marca(f.id, f.atualizadoEm));
  const ativos = new Set((produtos || []).filter((x) => x.nome && x.ativo !== false).map((x) => x.id));
  return Object.entries(em)
    .filter(([id, t]) => ativos.has(id) && t > desde)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, t]) => ({ id, em: t }));
}

export default function Custos({ produtos, custos, daFicha, custosDocs, fichas }) {
  const [params] = useSearchParams();
  const [busca, setBusca] = useState(() => params.get("busca") || "");
  const [filtro, setFiltro] = useState("todos");
  const [salvo, setSalvo] = useState(null); // configuracoes/precificacao (custosConferidoEm e o Preço certo)
  const [montar, setMontar] = useState(null);
  const [fila, setFila] = useState(null); // { ids, i }: um produto depois do outro
  const [conferido, setConferido] = useState(null); // resultado do "Terminei"
  const [msg, setMsg] = useState("");
  useEffect(() => onSnapshot(doc(db, ...L(), "configuracoes", "precificacao"), (s) => setSalvo(s.data() || {}), () => setSalvo({})), []);

  const ativos = useMemo(
    () =>
      (produtos || [])
        .filter((x) => x.nome && x.ativo !== false)
        .sort((a, b) => String(a.categoria || "").localeCompare(String(b.categoria || ""), "pt-BR") || String(a.nome).localeCompare(String(b.nome), "pt-BR")),
    [produtos]
  );
  const desde = Date.parse(salvo?.custosConferidoEm || "") || 0;
  const mexidos = useMemo(() => ultimosMexidos(produtos, custosDocs, fichas, desde), [produtos, custosDocs, fichas, desde]);
  const mexidoEm = Object.fromEntries(mexidos.map((m) => [m.id, m.em]));
  if (salvo === null) return <p className="fin-carregando">Carregando…</p>;

  const temCusto = (x) => typeof custos[x.id] === "number";
  const semCusto = ativos.filter((x) => !temCusto(x));
  const termo = semAcento(busca.trim());
  const mostrar = ativos.filter(
    (x) =>
      (!termo || semAcento(x.nome).includes(termo) || semAcento(x.categoria).includes(termo)) &&
      (filtro === "sem" ? !temCusto(x) : filtro === "mexidos" ? mexidoEm[x.id] : true)
  );
  const abrirFila = (lista) => {
    if (!lista.length) return;
    setFila({ ids: lista.map((x) => x.id), i: 0 });
    setMontar(lista[0]);
  };
  const irPara = (i) => {
    setFila({ ...fila, i });
    setMontar(ativos.find((x) => x.id === fila.ids[i]) || null);
  };

  async function terminei() {
    // Confere tudo com o que está cadastrado agora (o Preço certo usa o que o dono preencheu; em branco = 0).
    const p = percentuaisFinais(salvo);
    const abaixo = [];
    ativos.forEach((x) => {
      if (!temCusto(x)) return;
      const r = precoDoProduto(custos[x.id], x.preco, p);
      if (r.situacao === "baixo") abaixo.push({ id: x.id, nome: x.nome, preco: Number(x.preco || 0), sugerido: r.sugerido });
    });
    const custoMaiorQuePreco = ativos.filter((x) => temCusto(x) && Number(x.preco || 0) > 0 && custos[x.id] >= Number(x.preco));
    setConferido({ total: ativos.length, comCusto: ativos.length - semCusto.length, semCusto: semCusto.map((x) => x.nome), abaixo, custoMaiorQuePreco: custoMaiorQuePreco.map((x) => x.nome), impossivel: p.soIngredientes ? false : precoDoProduto(1, 1, p).situacao === "impossivel" });
    try {
      await setDoc(doc(db, ...L(), "configuracoes", "precificacao"), { custosConferidoEm: new Date().toISOString() }, { merge: true });
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
  }

  return (
    <div className="relatorio-documento cu">
      <p className="fin-explica">
        Aqui fica o custo de cada produto: monte com os ingredientes (pratos, lanches) ou digite o custo de 1 unidade (bebida pronta). O Preço certo e o lucro do Dinheiro usam esses valores.
      </p>
      <div className="cu-resumo">
        <span><b>{ativos.length - semCusto.length}</b> de {ativos.length} com custo</span>
        {semCusto.length > 0 && (
          <button type="button" className="btn-verde" onClick={() => abrirFila(semCusto)}>
            🧮 Pôr o custo dos que faltam ({semCusto.length}), um por um
          </button>
        )}
      </div>
      <input
        className="cu-busca"
        type="search"
        placeholder="🔎 Procurar produto pelo nome"
        aria-label="Procurar produto pelo nome"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      <div className="fin-periodos cu-filtros" role="group" aria-label="Filtrar produtos">
        {[
          { id: "todos", nome: `Todos (${ativos.length})` },
          { id: "sem", nome: `Sem custo (${semCusto.length})` },
          { id: "mexidos", nome: `✏️ Mexidos (${mexidos.length})` },
        ].map((f) => (
          <button key={f.id} type="button" className={filtro === f.id ? "ativo" : ""} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.nome}
          </button>
        ))}
      </div>
      {mostrar.length === 0 && <p className="fin-explica">{termo ? "Nenhum produto com esse nome." : "Nenhum produto aqui."}</p>}
      <ul className="pc-lista cu-lista">
        {mostrar.map((x) => {
          const c = custos[x.id];
          const ficha = typeof daFicha?.[x.id] === "number";
          return (
            <li key={x.id} className={`cu-item ${mexidoEm[x.id] ? "mexido" : ""}`}>
              <button type="button" className="cu-linha" onClick={() => { setFila(null); setMontar(x); }} aria-label={`Mudar o custo de ${x.nome}`}>
                <span className="cu-nome">
                  <strong>{x.nome}</strong>
                  <small>
                    {x.categoria || "Sem categoria"} · vende por {R(x.preco)}
                  </small>
                  {mexidoEm[x.id] && <small className="cu-marca">✏️ alterado {quando(mexidoEm[x.id])}</small>}
                </span>
                <span className="cu-custo">
                  {typeof c === "number" ? (
                    <>
                      <b>{R(c)}</b>
                      <small>{ficha ? "ingredientes" : "digitado"}</small>
                    </>
                  ) : (
                    <b className="pc-chip baixo">Sem custo</b>
                  )}
                </span>
              </button>
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
          <p>✓ {conferido.comCusto} de {conferido.total} produtos com custo.</p>
          {conferido.semCusto.length > 0 && <p>⚠️ Sem custo ({conferido.semCusto.length}): {conferido.semCusto.join(", ")}. Sem o custo o lucro desses produtos não entra certo.</p>}
          {conferido.custoMaiorQuePreco.length > 0 && <p>⚠️ Custo igual ou maior que o preço: {conferido.custoMaiorQuePreco.join(", ")}. Confira o custo ou o preço.</p>}
          {conferido.impossivel ? (
            <p>⚠️ No Preço certo as despesas e o que você quer tirar chegaram ao que a loja vende: confira lá antes de olhar os preços.</p>
          ) : conferido.abaixo.length > 0 ? (
            <p>
              Abaixo do preço sugerido ({conferido.abaixo.length}): {conferido.abaixo.map((a) => `${a.nome} (vende ${R(a.preco)}, sugerido ${R(a.sugerido)})`).join("; ")}.
            </p>
          ) : (
            conferido.comCusto > 0 && <p>✓ Todos os produtos com custo estão no preço sugerido ou acima.</p>
          )}
          <Link to="/cardapio?aba=preco" className="cu-link">Ver no Preço certo →</Link>
        </div>
      )}
      {montar && (
        <div className="ins-modal" role="dialog" aria-modal="true" aria-label={`Custo de ${montar.nome}`} onClick={() => { setMontar(null); setFila(null); }}>
          <div className="ins-modal-caixa pc-montar" onClick={(e) => e.stopPropagation()}>
            <div className="pc-montar-topo">
              <h2>{montar.nome}</h2>
              <button type="button" className="prod-ficha-x" aria-label="Fechar" onClick={() => { setMontar(null); setFila(null); }}>✕</button>
            </div>
            {fila && <p className="pc-fila">Produto {fila.i + 1} de {fila.ids.length}</p>}
            <p className="fin-explica">Diga o que vai em 1 {montar.nome} e quanto de cada, ou digite o custo de 1 unidade. Salva sozinho.</p>
            <FichaDoProduto key={montar.id} produto={montar} precoAtual={montar.preco} />
            {fila ? (
              <div className="pc-fila-botoes">
                <button type="button" className="ins-btn" disabled={fila.i === 0} onClick={() => irPara(fila.i - 1)}>← Anterior</button>
                {fila.i < fila.ids.length - 1 ? (
                  <button type="button" className="btn-verde" onClick={() => irPara(fila.i + 1)}>Próximo produto →</button>
                ) : (
                  <button type="button" className="btn-verde" onClick={() => { setFila(null); setMontar(null); }}>✓ Pronto</button>
                )}
              </div>
            ) : (
              <div className="pc-fila-botoes">
                <span />
                <button type="button" className="btn-verde" onClick={() => setMontar(null)}>✓ Pronto</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
