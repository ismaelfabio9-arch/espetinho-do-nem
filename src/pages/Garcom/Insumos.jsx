import { L } from "../../loja";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { ajustarInsumo, custoPronto, entradaInsumo, novoCustoCompra, inventario, mostrarQtd, perdasNoPeriodo, previsao, rendimentoDe, unidadeDe } from "../../utils/insumos";
import { NovoInsumo } from "../../components/FichaTecnica";
import RegistrarPerda from "../../components/RegistrarPerda";
import { resumoSaidas } from "../../utils/perdas";
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
  { id: "perdas", nome: "Perdas e saídas" },
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

/** embutido: dentro de Cardápio e estoque → Estoque (sem título próprio; uma fileira de abas só). dia: a tela da quantidade do dia por produto. */
function Insumos({ embutido = false, dia = null, semLista = false }) {
  const insumos = useColecao("insumos");
  const movs = useMovs();
  const [params, setParams] = useSearchParams();
  const primeira = semLista ? "contagem" : "estoque";
  const inicial = { ingredientes: primeira, dia: dia ? "dia" : primeira }[params.get("sub")] || params.get("sub") || primeira;
  const [aba, setAbaEstado] = useState([...(semLista ? [] : ["estoque"]), "contagem", "perdas", "historico", "dia"].includes(inicial) ? inicial : primeira);
  const setAba = (id) => {
    setAbaEstado(id);
    if (embutido) {
      const p = new URLSearchParams(params);
      p.set("sub", id === "estoque" ? "ingredientes" : id);
      setParams(p, { replace: true });
    }
  };
  const abas = [...ABAS.filter((a) => !(semLista && a.id === "estoque")).map((a) => (a.id === "estoque" && embutido ? { ...a, nome: "Ingredientes" } : a)), ...(dia ? [{ id: "dia", nome: "Quantidade do dia" }] : [])];
  const ativos = useMemo(() => (insumos || []).filter((i) => i.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")), [insumos]);
  const porId = useMemo(() => Object.fromEntries((insumos || []).map((i) => [i.id, i])), [insumos]);
  const carregando = insumos === null || movs === null;
  const prev = useMemo(() => previsao(insumos || [], movs || []), [insumos, movs]);
  const mes = periodo("mes");
  const perdasMes = useMemo(() => perdasNoPeriodo(movs || [], mes.de, mes.ate), [movs, mes.de, mes.ate]);
  const baixos = ativos.filter((i) => Number(i.quantidade || 0) <= Number(i.minimo || 0) && Number(i.minimo || 0) > 0);

  return (
    <div className="container relatorio-page fin-page">
      {!embutido && <Link to="/config" className="voltar">← Voltar</Link>}
      <div className={embutido ? "ins-topo-embutido" : "relatorio-filtros"}>
        {!embutido && (
          <>
            <h1>Matéria-prima</h1>
            <p>Carne, arroz, pão, refrigerante… O que cada produto leva fica no próprio produto (Produtos → editar). Cada venda desconta daqui sozinha.</p>
          </>
        )}
        <div className={embutido ? "area-sub ins-abas" : "fin-abas ins-abas"} role="tablist" aria-label="Estoque">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              className={aba === a.id ? "ativa" : ""}
              onClick={() => setAba(a.id)}
              ref={aba === a.id ? (el) => el?.scrollIntoView?.({ block: "nearest", inline: "nearest" }) : undefined}
            >
              {a.nome}
            </button>
          ))}
        </div>
        {!carregando && baixos.length > 0 && aba === "estoque" && (
          <p className="fin-aviso ins-aviso">⚠️ Acabando: {baixos.map((i) => `${i.nome} (${mostrarQtd(i.quantidade, i.unidade)})`).join(", ")}</p>
        )}
      </div>
      {aba === "dia" && dia ? (
        <div className="ins-dia">{dia}</div>
      ) : carregando ? (
        <p className="fin-carregando">Carregando…</p>
      ) : aba === "estoque" ? (
        <Estoque insumos={ativos} prev={prev} perdasMes={perdasMes} verPerdas={() => setAba("perdas")} />
      ) : aba === "contagem" ? (
        <Contagem insumos={ativos} />
      ) : aba === "perdas" ? (
        <Perdas movs={movs} porId={porId} />
      ) : (
        <Historico porId={porId} />
      )}
    </div>
  );
}

function Estoque({ insumos, prev, perdasMes, verPerdas }) {
  const [acao, setAcao] = useState(null); // { insumo, tipo: "compra" | "contagem" }
  const [perdaDe, setPerdaDe] = useState(null); // ingrediente (ou true: escolher na janela)
  const [form, setForm] = useState(null); // { insumo? } novo ou editar
  return (
    <>
      <div className="relatorio-documento">
        <div className="ins-topo">
          <h2>Ingredientes</h2>
          <button type="button" className="btn-verde" onClick={() => setForm({})}>+ Novo ingrediente</button>
        </div>
        <button type="button" className="pd-novo" onClick={() => setPerdaDe(true)}>🍽️ Registrar saída de alimento (queimou, estragou, doação…)</button>
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
                      {typeof i.custo === "number" && rendimentoDe(i) < 1 ? ` · pronto ${R(custoPronto(i))} (rende ${Math.round(rendimentoDe(i) * 100)}%)` : ""}
                      {min > 0 ? ` · mínimo ${mostrarQtd(min, i.unidade)}` : ""}
                      {typeof i.custo === "number" && q > 0 ? ` · vale ${R(q * i.custo)}` : ""}
                    </small>
                    {i.ultimaCompra && (
                      <small className="ins-ultima">
                        Última compra: {mostrarQtd(i.ultimaCompra.qtd, i.unidade)} por {R(i.ultimaCompra.valor)} em {new Date(i.ultimaCompra.em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </small>
                    )}
                    {prev[i.id]?.porDia > 0 && (
                      <small className={`ins-prev ${prev[i.id].acabaEm <= 3 ? "perto" : ""}`}>
                        Gasta ~{mostrarQtd(prev[i.id].porDia, i.unidade)} por dia · {prev[i.id].acabaEm === 0 ? "já acabou" : `dá para ~${prev[i.id].acabaEm} ${prev[i.id].acabaEm === 1 ? "dia" : "dias"}`}
                      </small>
                    )}
                  </div>
                  <span className={`ins-qtd ${estado}`}>{mostrarQtd(q, i.unidade)}</span>
                  <div className="ins-acoes">
                    <button type="button" className="ins-btn entrada" onClick={() => setAcao({ insumo: i, tipo: "compra" })}>+ Compra</button>
                    <button type="button" className="ins-btn" onClick={() => setPerdaDe(i)}>Perda</button>
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
      {perdaDe && <RegistrarPerda inicial={perdaDe === true ? {} : { insumo: perdaDe }} fechar={() => setPerdaDe(null)} />}
      {form && <NovoInsumo insumos={insumos} editar={form.insumo} fechar={() => setForm(null)} />}
    </>
  );
}

export function Movimentar({ acao, fechar }) {
  const { insumo, tipo } = acao;
  const u = unidadeDe(insumo.unidade);
  const [qtd, setQtd] = useState(tipo === "contagem" ? String(Number(insumo.quantidade || 0)).replace(".", ",") : "");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [lancar, setLancar] = useState(true);
  const temAntes = Number(insumo.quantidade || 0) > 0 && typeof insumo.custo === "number";
  const [modo, setModo] = useState(temAntes ? "media" : "ultimo");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const titulo = tipo === "compra" ? `Compra de ${insumo.nome}` : tipo === "perda" ? `Perda de ${insumo.nome}` : `Contagem de ${insumo.nome}`;
  // Compra em fardo / caixa / pacote: 1 fardo com 20 pacotes de 1 kg por R$ 120 → 20 kg a R$ 6,00 o quilo.
  const medidas = insumo.unidade === "kg" ? [["kg", 1], ["g", 1000]] : insumo.unidade === "L" ? [["litro", 1], ["ml", 1000]] : [["un", 1]];
  const [fardo, setFardo] = useState(false);
  const [nFardos, setNFardos] = useState("1");
  const [porFardo, setPorFardo] = useState("");
  const [tamPacote, setTamPacote] = useState(insumo.unidade === "un" ? "1" : "1");
  const [medida, setMedida] = useState(medidas[0][0]);
  const [valorFardo, setValorFardo] = useState("");
  const fator = medidas.find(([m]) => m === medida)?.[1] || 1;
  const qtdFardo = (num(nFardos) || 0) * (num(porFardo) || 0) * ((num(tamPacote) || 0) / fator);
  const valorTotalFardo = (num(nFardos) || 0) * lerValor(valorFardo);
  // Pratos que levam este ingrediente: o custo deles muda sozinho com o preço novo.
  const fichas = useColecao("fichas");
  const pratos = (fichas || [])
    .filter((f) => [...(f.itens || []), ...(f.variaPor?.itens || []), ...((f.opcoes || []).flatMap((o) => o.itens || []))].some((it) => it.insumoId === insumo.id || it.passa === insumo.id))
    .map((f) => f.nome)
    .filter(Boolean);

  async function salvar(e) {
    e.preventDefault();
    const q = tipo === "compra" && fardo ? Math.round(qtdFardo * 1000) / 1000 : num(qtd);
    if (!(q > 0) && !(tipo === "contagem" && q === 0)) return setErro(fardo ? "Diga quantos pacotes vêm no fardo e o tamanho de cada um." : "Informe a quantidade.");
    setSalvando(true);
    setErro("");
    try {
      if (tipo === "compra") {
        const v = fardo ? Math.round(valorTotalFardo * 100) / 100 : lerValor(valor);
        await entradaInsumo(insumo, q, v, quem(), modo);
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
        {tipo === "compra" && (
          <div className="pd-modo cp-modo" role="tablist" aria-label="Como comprou">
            <button type="button" role="tab" aria-selected={!fardo} className={!fardo ? "on" : ""} onClick={() => setFardo(false)}>Solto ({insumo.unidade === "un" ? "unidades" : u.id})</button>
            <button type="button" role="tab" aria-selected={fardo} className={fardo ? "on" : ""} onClick={() => setFardo(true)}>Fardo / caixa / pacote</button>
          </div>
        )}
        {tipo === "compra" && fardo && (
          <div className="cp-fardo">
            <label>
              Quantos fardos (ou caixas)
              <input inputMode="decimal" value={nFardos} onChange={(e) => setNFardos(e.target.value)} />
            </label>
            <label>
              Cada fardo vem com quantos pacotes
              <input autoFocus inputMode="decimal" placeholder="Ex.: 20" value={porFardo} onChange={(e) => setPorFardo(e.target.value)} />
            </label>
            <label>
              Cada pacote tem
              <span className="cp-pacote">
                <input inputMode="decimal" placeholder="1" value={tamPacote} onChange={(e) => setTamPacote(e.target.value)} />
                {medidas.length > 1 ? (
                  <span className="pd-medida">
                    {medidas.map(([m]) => (
                      <button key={m} type="button" className={medida === m ? "on" : ""} onClick={() => setMedida(m)}>{m}</button>
                    ))}
                  </span>
                ) : (
                  <span>un</span>
                )}
              </span>
            </label>
            <label>
              Quanto pagou em cada fardo (R$)
              <input inputMode="decimal" placeholder="0,00" value={valorFardo} onChange={(e) => setValorFardo(e.target.value)} />
            </label>
            {qtdFardo > 0 && valorTotalFardo > 0 && (
              <p className="cp-conta">
                {num(nFardos) > 1 ? `${nFardos} fardos = ` : ""}
                <b>{mostrarQtd(qtdFardo, insumo.unidade)}</b> por <b>{R(valorTotalFardo)}</b> → {insumo.unidade === "un" ? "a unidade" : `o ${u.nomeLongo}`} sai a <b>{R(valorTotalFardo / qtdFardo)}</b>
              </p>
            )}
          </div>
        )}
        <div className="fin-campos" style={tipo === "compra" && fardo ? { display: "none" } : undefined}>
          <label className={tipo === "compra" ? "" : "fin-largo"}>
            {tipo === "contagem" ? `Quanto tem de verdade (${u.id})` : tipo === "compra" ? `Quanto comprou (${u.id === "un" ? "unidades" : u.id})` : `Quantidade (${u.id})`}
            <input autoFocus inputMode="decimal" placeholder="0" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </label>
          {tipo === "compra" && (
            <label>
              Quanto pagou por tudo (R$)
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
        {tipo === "compra" && (() => {
          const q = fardo ? qtdFardo : num(qtd);
          const v = fardo ? valorTotalFardo : lerValor(valor);
          if (!(q > 0) || !(v > 0)) return <p className="fin-explica">Diga quanto comprou e quanto pagou: o sistema calcula o preço {insumo.unidade === "un" ? "da unidade" : `do ${u.nomeLongo}`} e todos os pratos com {insumo.nome} recalculam sozinhos.</p>;
          const desta = v / q;
          const media = novoCustoCompra(insumo, q, v, "media");
          const nomeUn = insumo.unidade === "un" ? "a unidade" : `o ${u.nomeLongo}`;
          return (
            <div className="ins-compra-conta">
              <p>
                {R(v)} ÷ {mostrarQtd(q, insumo.unidade)} = <b>{R(desta)} {nomeUn}</b>
              </p>
              {temAntes && Math.abs(media - desta) > 0.005 && (
                <div className="ins-compra-modo" role="radiogroup" aria-label="Qual preço usar">
                  <label>
                    <input type="radio" name="modo" checked={modo === "ultimo"} onChange={() => setModo("ultimo")} />
                    <span>
                      Usar o preço desta compra: <b>{R(desta)}</b>
                      <small>Bom quando o preço muda muito (ex.: carne).</small>
                    </span>
                  </label>
                  <label>
                    <input type="radio" name="modo" checked={modo === "media"} onChange={() => setModo("media")} />
                    <span>
                      Média com o que já tinha: <b>{R(media)}</b>
                      <small>Você tinha {mostrarQtd(insumo.quantidade, insumo.unidade)} a {R(insumo.custo)}.</small>
                    </span>
                  </label>
                </div>
              )}
            </div>
          );
        })()}
        {tipo === "compra" && pratos.length > 0 && (
          <p className="cp-pratos">
            🔄 Com o preço novo, o custo destes pratos muda sozinho: <b>{pratos.slice(0, 8).join(", ")}</b>
            {pratos.length > 8 ? ` e mais ${pratos.length - 8}` : ""}.
          </p>
        )}
        {erro && <p className="fin-erro">{erro}</p>}
        <div className="ins-modal-botoes">
          <button type="button" className="ins-btn" onClick={fechar}>Cancelar</button>
          <button className="btn-verde" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
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
  if (!insumos.length) return <div className="relatorio-documento"><p>Cadastre os ingredientes na aba Ingredientes primeiro.</p></div>;
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
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState(null);
  const f = periodo(per);
  const r = perdasNoPeriodo(movs, f.de, f.ate);
  const s = resumoSaidas(movs, f.de, f.ate);
  const maior = Math.max(1, ...s.porMotivo.map((m) => m.valor));
  const total = Math.round((s.total + r.faltas) * 100) / 100;
  return (
    <div className="relatorio-documento">
      <button type="button" className="pd-novo" onClick={() => setNovo(true)}>🍽️ Registrar saída de alimento</button>
      <h2>Perdas e saídas · − {R(total)}</h2>
      <div className="fin-periodos">
        {[{ id: "hoje", nome: "Hoje" }, { id: "7dias", nome: "7 dias" }, { id: "mes", nome: "Este mês" }, { id: "mesPassado", nome: "Mês passado" }, { id: "ano", nome: "Este ano" }].map((p) => (
          <button key={p.id} className={per === p.id ? "ativo" : ""} onClick={() => setPer(p.id)}>{p.nome}</button>
        ))}
      </div>
      <div className="fin-conta">
        <div className="fin-linha"><div><span>Perdas</span><small>Queimou, estragou, caiu, saiu errado, jogou fora</small></div><strong className="fin-neg">− {R(s.perdas)}</strong></div>
        <div className="fin-linha"><div><span>Saídas sem venda</span><small>Doação, refeição da equipe, cortesia, consumo do dono</small></div><strong className="fin-neg">− {R(s.saidas)}</strong></div>
        <div className="fin-linha"><div><span>Faltou na contagem</span><small>Sumiu sem explicação</small></div><strong className="fin-neg">− {R(r.faltas)}</strong></div>
        <div className="fin-linha fin-total"><div><span>Total</span><small>Entra no lucro em Finanças</small></div><strong className="fin-neg">− {R(total)}</strong></div>
      </div>
      {s.porMotivo.length > 0 && (
        <>
          <h3 style={{ margin: "18px 0 6px" }}>Por motivo</h3>
          {s.porMotivo.map((m) => (
            <div key={m.id} className="pd-motivo-linha">
              <span className="pd-nome">{m.emoji} {m.nome}<small>{m.vezes} {m.vezes === 1 ? "vez" : "vezes"}</small></span>
              <span className="pd-barra"><i style={{ width: `${Math.max(4, (m.valor / maior) * 100)}%` }} /></span>
              <strong>− {R(m.valor)}</strong>
            </div>
          ))}
        </>
      )}
      <h3 style={{ margin: "18px 0 6px" }}>Lançamentos</h3>
      {s.lista.length === 0 && r.faltas === 0 ? (
        <p>Nenhuma perda no período. 👏</p>
      ) : (
        <ul className="fin-despesas">
          {s.lista.map((l) => (
            <li key={l.id} onClick={() => setAberto(aberto === l.id ? null : l.id)} style={{ cursor: "pointer" }}>
              <div>
                <strong>{l.descricoes?.length ? l.descricoes.join(" + ") : l.produtoNome ? `${l.qtdProduto}× ${l.produtoNome}${l.opcao ? ` (${l.opcao})` : ""}` : l.itens.map((i) => `${i.nome} ${mostrarQtd(i.qtd, porId[i.insumoId]?.unidade)}`).join(", ")}</strong>
                <small>
                  {new Date(l.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {l.motivo}
                  {l.semPreco ? " · algum ingrediente sem preço" : ""}
                </small>
                {aberto === l.id && (l.produtoNome || l.descricoes?.length > 1) && l.itens.length > 0 && (
                  <small style={{ display: "block", marginTop: 4 }}>Saiu: {l.itens.map((i) => `${i.nome} ${mostrarQtd(i.qtd, porId[i.insumoId]?.unidade)}`).join(", ")}</small>
                )}
              </div>
              <span className="fin-valor fin-neg">{l.valor > 0 ? `− ${R(l.valor)}` : "—"}</span>
            </li>
          ))}
          {r.lista.filter((m) => m.tipo === "contagem").map((m) => (
            <li key={m.id}>
              <div>
                <strong>{m.nome}</strong>
                <small>{new Date(m.em).toLocaleDateString("pt-BR")} · Faltou na contagem · {mostrarQtd(Math.abs(Number(m.qtd || 0)), porId[m.insumoId]?.unidade)}</small>
              </div>
              <span className="fin-valor fin-neg">− {R(-m.valorAjuste)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="relatorio-nota">O valor é o custo dos ingredientes (pela ficha do produto). Ingrediente sem preço não entra na conta. Hoje: {isoDia().split("-").reverse().join("/")}.</p>
      {novo && <RegistrarPerda fechar={() => setNovo(false)} />}
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
