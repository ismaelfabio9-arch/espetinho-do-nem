// Registrar uma saída de alimento sem venda: o motivo (queimou, estragou, doação…), o que foi (produto pronto
// ou ingrediente) e quanto. Mostra o que sai do estoque e quanto isso custou antes de salvar.
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { L } from "../loja";
import { MOTIVOS, contaDaPerda, registrarPerda } from "../utils/perdas";
import { mostrarQtd, unidadeDe } from "../utils/insumos";
import "../styles/Garcom/Insumos.css";

const R = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const semAcento = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const num = (v) => {
  const n = Number(String(v ?? "").trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

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
  const [modo, setModo] = useState(inicial.insumo ? "insumo" : "produto");
  const [busca, setBusca] = useState("");
  const [produto, setProduto] = useState(null);
  const [insumo, setInsumo] = useState(inicial.insumo || null);
  const [qtdProduto, setQtdProduto] = useState(1);
  const [opcao, setOpcao] = useState("");
  const [qtdInsumo, setQtdInsumo] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const porId = useMemo(() => Object.fromEntries((insumos || []).map((i) => [i.id, i])), [insumos]);
  const fichaDe = useMemo(() => Object.fromEntries((fichas || []).map((f) => [f.id, f])), [fichas]);
  const ficha = produto ? fichaDe[produto.id] : null;
  const opcoes = useMemo(() => ficha?.variaPor?.opcoes || [], [ficha]);

  const achados = useMemo(() => {
    const q = semAcento(busca.trim());
    const base = modo === "produto" ? (produtos || []).filter((p) => p.ativo !== false) : (insumos || []).filter((i) => i.ativo !== false);
    return base.filter((x) => !q || semAcento(x.nome).includes(q) || semAcento(x.categoria).includes(q)).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")).slice(0, 8);
  }, [busca, modo, produtos, insumos]);

  const u = insumo ? unidadeDe(insumo.unidade) : null;
  // Ingrediente: a pessoa digita em g / ml / un; o estoque guarda em kg / L / un.
  const qtdIns = insumo ? num(qtdInsumo) / (u?.fator || 1) : 0;
  const conta = useMemo(
    () => contaDaPerda(modo === "produto" ? { ficha, opcao: opcao || opcoes[0], qtdProduto } : { insumo, qtdInsumo: qtdIns }, porId),
    [modo, ficha, opcao, opcoes, qtdProduto, insumo, qtdIns, porId]
  );
  const escolhido = modo === "produto" ? produto : insumo;
  const pronto = motivoId && escolhido && (modo === "produto" ? qtdProduto > 0 : qtdIns > 0);

  async function salvar() {
    if (!motivoId) return setErro("Escolha o que aconteceu.");
    if (!escolhido) return setErro(modo === "produto" ? "Escolha o produto." : "Escolha o ingrediente.");
    if (!pronto) return setErro("Diga a quantidade.");
    setSalvando(true);
    setErro("");
    try {
      await registrarPerda(
        modo === "produto"
          ? { motivoId, obs, por: auth.currentUser?.email || "", produto, opcao: opcoes.length ? opcao || opcoes[0] : "", qtdProduto, ficha }
          : { motivoId, obs, por: auth.currentUser?.email || "", insumo, qtdInsumo: qtdIns },
        porId
      );
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
        <p className="fin-explica">Queimou, estragou, doou, a equipe comeu… O que sair sem venda fica registrado, sai do estoque e entra no lucro.</p>

        <p className="pd-rotulo">1. O que aconteceu?</p>
        <div className="pd-motivos">
          {MOTIVOS.map((m) => (
            <button key={m.id} type="button" className={motivoId === m.id ? "on" : ""} aria-pressed={motivoId === m.id} onClick={() => setMotivoId(m.id)}>
              <span aria-hidden="true">{m.emoji}</span> {m.nome}
            </button>
          ))}
        </div>

        <p className="pd-rotulo">2. O que foi?</p>
        <div className="pd-modo" role="tablist">
          {[["produto", "Produto pronto"], ["insumo", "Ingrediente"]].map(([id, nome]) => (
            <button key={id} type="button" role="tab" aria-selected={modo === id} className={modo === id ? "on" : ""} onClick={() => { setModo(id); setBusca(""); }}>
              {nome}
            </button>
          ))}
        </div>
        {escolhido ? (
          <div className="pd-escolhido">
            <strong>{escolhido.nome}</strong>
            <button type="button" className="ins-btn" onClick={() => { setProduto(null); setInsumo(null); setOpcao(""); }}>Trocar</button>
          </div>
        ) : (
          <>
            <input className="pd-busca" placeholder={modo === "produto" ? "🔍 Buscar produto: marmita, x bacon…" : "🔍 Buscar ingrediente: carne, arroz…"} value={busca} onChange={(e) => setBusca(e.target.value)} />
            {carregando ? (
              <p className="fin-carregando">Carregando…</p>
            ) : (
              <ul className="pd-lista">
                {achados.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => (modo === "produto" ? setProduto(x) : setInsumo(x))}>
                      <span>{x.nome}</span>
                      <small>{modo === "produto" ? x.categoria : `tem ${mostrarQtd(x.quantidade, x.unidade)}`}</small>
                    </button>
                  </li>
                ))}
                {!achados.length && <li className="pd-vazio">Nada encontrado.</li>}
              </ul>
            )}
          </>
        )}

        {escolhido && (
          <>
            <p className="pd-rotulo">3. Quanto?</p>
            {modo === "produto" ? (
              <>
                <div className="pd-qtd">
                  <button type="button" onClick={() => setQtdProduto((n) => Math.max(1, n - 1))} aria-label="Menos">−</button>
                  <b>{qtdProduto}</b>
                  <button type="button" onClick={() => setQtdProduto((n) => n + 1)} aria-label="Mais">+</button>
                  <span>{qtdProduto === 1 ? "unidade" : "unidades"}</span>
                </div>
                {opcoes.length > 0 && (
                  <div className="pd-opcoes">
                    <small>{ficha.variaPor.grupo}:</small>
                    {opcoes.map((o) => (
                      <button key={o} type="button" className={(opcao || opcoes[0]) === o ? "on" : ""} onClick={() => setOpcao(o)}>{o}</button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <label className="pd-campo">
                Quantidade ({u.sub})
                <input autoFocus inputMode="decimal" placeholder="0" value={qtdInsumo} onChange={(e) => setQtdInsumo(e.target.value)} />
                <small>Tem agora: {mostrarQtd(insumo.quantidade, insumo.unidade)}</small>
              </label>
            )}
            <label className="pd-campo">
              Observação (opcional)
              <input placeholder="Ex.: doado para o abrigo, fritadeira desregulou" value={obs} onChange={(e) => setObs(e.target.value)} />
            </label>

            <div className="pd-conta">
              {conta.linhas.length ? (
                <>
                  <p>Sai do estoque:</p>
                  <ul>
                    {conta.linhas.map((l) => (
                      <li key={l.insumo.id}>
                        <span>{l.insumo.nome} · {mostrarQtd(l.cru, l.insumo.unidade)}</span>
                        <span>{l.valor === null ? "sem preço" : R(l.valor)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="pd-total">
                    <span>Custo</span>
                    <b>{R(conta.total)}</b>
                  </p>
                  {conta.semPreco.length > 0 && <small>Sem preço: {conta.semPreco.join(", ")}. O custo conta só o que tem preço.</small>}
                </>
              ) : modo === "produto" ? (
                <small>Este produto não tem ficha técnica (ingredientes): a saída fica registrada, mas sem valor e sem baixar ingredientes.</small>
              ) : null}
            </div>
          </>
        )}

        {erro && <p className="fin-erro">{erro}</p>}
        <div className="ins-modal-botoes">
          <button type="button" className="ins-btn" onClick={() => fechar(false)}>Cancelar</button>
          <button type="button" className="btn-verde" disabled={salvando || !pronto} onClick={salvar}>
            {salvando ? "Salvando…" : `Registrar${conta.total > 0 ? ` · ${R(conta.total)}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
