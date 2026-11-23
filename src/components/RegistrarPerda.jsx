// Registrar uma saída de alimento sem venda: o motivo (queimou, estragou, doação…) e o que saiu — um ou
// vários itens no mesmo lançamento (2 marmitas M + 1 kg de arroz + 1 kg de feijão), prato pronto (pela ficha)
// ou ingrediente (em g ou kg, ml ou litro, unidade). Mostra o que sai do estoque e quanto custou antes de salvar.
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { L } from "../loja";
import { MOTIVOS, contaDaPerda, registrarPerda } from "../utils/perdas";
import { mostrarQtd } from "../utils/insumos";
import "../styles/Garcom/Insumos.css";

const R = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const semAcento = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const num = (v) => {
  const n = Number(String(v ?? "").trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
/** Unidades para digitar: kg ou g, litro ou ml, unidade. */
const MEDIDAS = { kg: [["kg", 1], ["g", 1000]], L: [["litro", 1], ["ml", 1000]], un: [["un", 1]] };

function useColecao(nome) {
  const [lista, setLista] = useState(null);
  useEffect(() => onSnapshot(collection(db, ...L(), nome), (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLista([])), [nome]);
  return lista;
}

export default function RegistrarPerda({ fechar, inicial = {} }) {
  const produtos = useColecao("produtos");
  const fichas = useColecao("fichas");
  const insumos = useColecao("insumos");
  const [motivoId, setMotivoId] = useState(inicial.motivoId || "");
  const [busca, setBusca] = useState("");
  // Itens: { k, produto, opcao, qtdProduto } ou { k, insumo, qtdTxt, medida }
  const [itens, setItens] = useState(() => (inicial.insumo ? [{ k: 1, insumo: inicial.insumo, qtdTxt: "", medida: MEDIDAS[inicial.insumo.unidade]?.[0]?.[0] || "un" }] : []));
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const porId = useMemo(() => Object.fromEntries((insumos || []).map((i) => [i.id, i])), [insumos]);
  const fichaDe = useMemo(() => Object.fromEntries((fichas || []).map((f) => [f.id, f])), [fichas]);

  const achados = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return [];
    const ps = (produtos || []).filter((p) => p.ativo !== false && (semAcento(p.nome).includes(q) || semAcento(p.categoria).includes(q))).map((p) => ({ tipo: "produto", x: p }));
    const is = (insumos || []).filter((i) => i.ativo !== false && semAcento(i.nome).includes(q)).map((i) => ({ tipo: "insumo", x: i }));
    return [...is, ...ps].sort((a, b) => String(a.x.nome).localeCompare(String(b.x.nome), "pt-BR")).slice(0, 10);
  }, [busca, produtos, insumos]);

  const por = (a) => {
    const k = Date.now() + Math.random();
    setItens((l) => [...l, a.tipo === "produto" ? { k, produto: a.x, opcao: "", qtdProduto: 1 } : { k, insumo: a.x, qtdTxt: "", medida: MEDIDAS[a.x.unidade]?.[0]?.[0] || "un" }]);
    setBusca("");
  };
  const mudar = (k, campos) => setItens((l) => l.map((it) => (it.k === k ? { ...it, ...campos } : it)));
  const tirar = (k) => setItens((l) => l.filter((it) => it.k !== k));

  /** O item como o registro espera (ingrediente na unidade do estoque: 1 kg, 0,5 L…). */
  const paraRegistro = (it) => {
    if (it.produto) {
      const ficha = fichaDe[it.produto.id];
      const ops = ficha?.variaPor?.opcoes || [];
      return { produto: it.produto, ficha, opcao: ops.length ? it.opcao || ops[0] : "", qtdProduto: it.qtdProduto };
    }
    const fator = (MEDIDAS[it.insumo.unidade] || MEDIDAS.un).find(([m]) => m === it.medida)?.[1] || 1;
    return { insumo: it.insumo, qtdInsumo: num(it.qtdTxt) / fator };
  };
  const contas = itens.map((it) => contaDaPerda(paraRegistro(it), porId));
  const total = Math.round(contas.reduce((s, c) => s + c.total, 0) * 100) / 100;
  const semPreco = [...new Set(contas.flatMap((c) => c.semPreco))];
  const validos = itens.filter((it) => (it.produto ? it.qtdProduto > 0 : num(it.qtdTxt) > 0));
  const pronto = motivoId && itens.length > 0 && validos.length === itens.length;

  async function salvar() {
    if (!motivoId) return setErro("Escolha o que aconteceu.");
    if (!itens.length) return setErro("Ponha o que saiu (busque o prato ou o ingrediente).");
    if (validos.length !== itens.length) return setErro("Diga a quantidade de cada item.");
    setSalvando(true);
    setErro("");
    try {
      await registrarPerda({ motivoId, obs, por: auth.currentUser?.email || "", itens: itens.map(paraRegistro) }, porId);
      fechar(true);
    } catch {
      setErro("Não foi possível salvar. Confira a internet.");
      setSalvando(false);
    }
  }

  const carregando = produtos === null || insumos === null || fichas === null;
  return (
    <div className="ins-modal" role="dialog" aria-modal="true" aria-label="Saída de alimento" onClick={() => fechar(false)}>
      <div className="ins-modal-caixa pd-caixa" onClick={(e) => e.stopPropagation()}>
        <h2>🍽️ Saída de alimento</h2>
        <p className="fin-explica">Queimou, estragou, doou, a equipe comeu… Pode pôr vários itens de uma vez: pratos prontos (sai o que a ficha leva) e ingredientes (em kg ou g).</p>

        <p className="pd-rotulo">1. O que aconteceu?</p>
        <div className="pd-motivos">
          {MOTIVOS.map((m) => (
            <button key={m.id} type="button" className={motivoId === m.id ? "on" : ""} aria-pressed={motivoId === m.id} onClick={() => setMotivoId(m.id)}>
              <span aria-hidden="true">{m.emoji}</span> {m.nome}
            </button>
          ))}
        </div>

        <p className="pd-rotulo">2. O que saiu?</p>
        {itens.map((it, n) => {
          const c = contas[n];
          if (it.produto) {
            const ops = fichaDe[it.produto.id]?.variaPor?.opcoes || [];
            const grupo = fichaDe[it.produto.id]?.variaPor?.grupo;
            return (
              <div key={it.k} className="pd-item">
                <div className="pd-item-topo">
                  <span className="pd-tipo">Prato</span>
                  <strong>{it.produto.nome}</strong>
                  <button type="button" className="fin-btn-x" aria-label={`Tirar ${it.produto.nome}`} onClick={() => tirar(it.k)}>✕</button>
                </div>
                <div className="pd-qtd">
                  <button type="button" onClick={() => mudar(it.k, { qtdProduto: Math.max(1, it.qtdProduto - 1) })} aria-label="Menos">−</button>
                  <b>{it.qtdProduto}</b>
                  <button type="button" onClick={() => mudar(it.k, { qtdProduto: it.qtdProduto + 1 })} aria-label="Mais">+</button>
                  <span>{it.qtdProduto === 1 ? "unidade" : "unidades"}</span>
                  <em>{c.linhas.length ? (c.total > 0 ? R(c.total) : "sem preço") : "sem ficha"}</em>
                </div>
                {ops.length > 0 && (
                  <div className="pd-opcoes">
                    <small>{grupo}:</small>
                    {ops.map((o) => (
                      <button key={o} type="button" className={(it.opcao || ops[0]) === o ? "on" : ""} onClick={() => mudar(it.k, { opcao: o })}>{o}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          const medidas = MEDIDAS[it.insumo.unidade] || MEDIDAS.un;
          return (
            <div key={it.k} className="pd-item">
              <div className="pd-item-topo">
                <span className="pd-tipo ing">Ingrediente</span>
                <strong>{it.insumo.nome}</strong>
                <button type="button" className="fin-btn-x" aria-label={`Tirar ${it.insumo.nome}`} onClick={() => tirar(it.k)}>✕</button>
              </div>
              <div className="pd-ing">
                <input autoFocus inputMode="decimal" placeholder="0" value={it.qtdTxt} onChange={(e) => mudar(it.k, { qtdTxt: e.target.value })} aria-label={`Quantidade de ${it.insumo.nome}`} />
                {medidas.length > 1 ? (
                  <div className="pd-medida" role="group" aria-label="Unidade">
                    {medidas.map(([m]) => (
                      <button key={m} type="button" className={it.medida === m ? "on" : ""} onClick={() => mudar(it.k, { medida: m })}>{m}</button>
                    ))}
                  </div>
                ) : (
                  <span>un</span>
                )}
                <em>{c.linhas.length ? (c.linhas[0].valor === null ? "sem preço" : R(c.total)) : ""}</em>
              </div>
              <small className="pd-tem">Tem agora: {mostrarQtd(it.insumo.quantidade, it.insumo.unidade)}</small>
            </div>
          );
        })}

        <input className="pd-busca" placeholder={itens.length ? "➕ Pôr mais um: arroz, feijão, marmita…" : "🔍 Buscar prato ou ingrediente: marmita, arroz, frango…"} value={busca} onChange={(e) => setBusca(e.target.value)} />
        {carregando && busca ? (
          <p className="fin-carregando">Carregando…</p>
        ) : (
          busca.trim() && (
            <ul className="pd-lista">
              {achados.map((a) => (
                <li key={`${a.tipo}:${a.x.id}`}>
                  <button type="button" onClick={() => por(a)}>
                    <span>
                      <span className={`pd-tipo${a.tipo === "insumo" ? " ing" : ""}`}>{a.tipo === "produto" ? "Prato" : "Ingrediente"}</span> {a.x.nome}
                    </span>
                    <small>{a.tipo === "produto" ? a.x.categoria : `tem ${mostrarQtd(a.x.quantidade, a.x.unidade)}`}</small>
                  </button>
                </li>
              ))}
              {!achados.length && <li className="pd-vazio">Nada encontrado.</li>}
            </ul>
          )
        )}

        {itens.length > 0 && (
          <>
            <label className="pd-campo">
              Observação (opcional)
              <input placeholder="Ex.: doado para o abrigo, fritadeira desregulou" value={obs} onChange={(e) => setObs(e.target.value)} />
            </label>
            <div className="pd-conta">
              <p>Sai do estoque:</p>
              <ul>
                {Object.values(
                  contas.flatMap((c) => c.linhas).reduce((acc, l) => {
                    const a = acc[l.insumo.id] || { insumo: l.insumo, cru: 0, valor: 0, semPreco: false };
                    a.cru += l.cru;
                    if (l.valor === null) a.semPreco = true;
                    else a.valor += l.valor;
                    acc[l.insumo.id] = a;
                    return acc;
                  }, {})
                ).map((l) => (
                  <li key={l.insumo.id}>
                    <span>{l.insumo.nome} · {mostrarQtd(l.cru, l.insumo.unidade)}</span>
                    <span>{l.semPreco ? "sem preço" : R(l.valor)}</span>
                  </li>
                ))}
              </ul>
              <p className="pd-total">
                <span>Custo</span>
                <b>{R(total)}</b>
              </p>
              {semPreco.length > 0 && <small>Sem preço: {semPreco.join(", ")}. O custo conta só o que tem preço.</small>}
            </div>
          </>
        )}

        {erro && <p className="fin-erro">{erro}</p>}
        <div className="ins-modal-botoes">
          <button type="button" className="ins-btn" onClick={() => fechar(false)}>Cancelar</button>
          <button type="button" className="btn-verde" disabled={salvando || !pronto} onClick={salvar}>
            {salvando ? "Salvando…" : `Registrar${itens.length > 1 ? ` ${itens.length} itens` : ""}${total > 0 ? ` · ${R(total)}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
