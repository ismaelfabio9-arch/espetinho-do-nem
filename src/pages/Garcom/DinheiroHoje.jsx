// Dinheiro → Hoje: os atalhos do dia a dia (sangria, reforço, saída de alimento, acabou), o novo lançamento
// (só o dono) e tudo o que aconteceu hoje numa lista só, com hora, quem fez e o valor.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import { db } from "../../firebase";
import { L } from "../../loja";
import { useSouDono } from "../../tenant";
import { registrar } from "../../utils/registro";
import { isoDia, lerValor, periodo, tipoDe, grupoDe } from "../../utils/financas";
import { movCaixaLoja, useCaixaLoja } from "../../utils/caixaLoja";
import { entradaInsumo, mostrarQtd } from "../../utils/insumos";
import { auth } from "../../firebase";
import { resumoSaidas } from "../../utils/perdas";
import { registrarOcorrencia, useOcorrencias } from "../../utils/ocorrencias";
import RegistrarPerda from "../../components/RegistrarPerda";
import { disponivelParaTirar, resumoCaixa, vendasDoCaixa } from "../../utils/caixa";
import { useTaxas } from "../../utils/taxas";
import { Abrir, Movimento } from "./Caixa";
import { NovoLancamento } from "./Financas";
import { BarraLiberado, useComSenha } from "../../components/SenhaDona";
import { useLiberado } from "../../utils/senhaDona";
import "../../styles/Garcom/RelatorioGerencial.css";
import "../../styles/Garcom/Financas.css";
import "../../styles/Garcom/Insumos.css";
import "../../styles/Garcom/DinheiroHoje.css";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
const semAcento = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const quemCurto = (e) => String(e || "").split("@")[0];

function useLista(fazer, deps) {
  const [lista, setLista] = useState(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onSnapshot(fazer(), (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLista([])), deps);
  return lista;
}

export default function DinheiroHoje() {
  const souDono = useSouDono();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const dia = isoDia();
  const inicioDia = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const caixas = useLista(() => query(collection(db, ...L(), "caixas"), orderBy("abertoEm", "desc"), limit(5)), []);
  const movsCaixa = useLista(() => query(collection(db, ...L(), "caixaMov"), where("em", ">=", inicioDia)), [inicioDia]);
  const movsIns = useLista(() => query(collection(db, ...L(), "insumosMov"), where("em", ">=", inicioDia)), [inicioDia]);
  const produtos = useLista(() => collection(db, ...L(), "produtos"), []);
  const vendasHoje = useLista(() => collection(db, ...L(), "vendasDia"), []);
  const taxas = useTaxas();
  const ocorrencias = useOcorrencias(dia);
  // Caixa do mês: só o que a dona deixa para a loja (fechamentos e reforços) menos sangrias e pagamentos.
  const caixaMes = useCaixaLoja();
  // Lançamentos do mês (só o dono lê): os de hoje vão para a lista; o mês inteiro dá o caixa da loja.
  const mes = periodo("mes");
  const [despesasMes, setDespesasMes] = useState([]);
  useEffect(() => {
    if (!souDono) return undefined;
    return onSnapshot(query(collection(db, ...L(), "despesas"), where("data", ">=", mes.de)), (s) => setDespesasMes(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setDespesasMes([]));
  }, [souDono, mes.de]);
  const despesas = useMemo(() => despesasMes.filter((d) => d.data === dia), [despesasMes, dia]);
  const [metaDona, setMetaDona] = useState(0);
  useEffect(() => (souDono ? onSnapshot(doc(db, ...L(), "configuracoes", "precificacao"), (s) => setMetaDona(Number(s.data()?.metaDona || 0)), () => {}) : undefined), [souDono]);
  const tiradoMes = useMemo(() => Math.round(despesasMes.filter((d) => d.tipo === "retirada").reduce((t, d) => t + Number(d.valor || 0), 0) * 100) / 100, [despesasMes]);
  const fornecedores = useMemo(() => [...new Set(despesasMes.map((d) => d.fornecedor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [despesasMes]);

  const [acaoPedida, setAcao] = useState(params.get("acao") || ""); // sangria | suprimento | perda | acabou | lancar
  const [pedirSenha, janelaSenha, precisaSenha] = useComSenha();
  const [qualCaixa, setQualCaixa] = useState("");
  useEffect(() => {
    if (!acaoPedida) setQualCaixa("");
  }, [acaoPedida]);
  const lib = useLiberado();
  // Sangria, reforço e lançamento mexem com dinheiro: pedem a senha da dona.
  const comDinheiro = (a) => a === "sangria" || a === "suprimento" || a === "lancar";
  const acao = comDinheiro(acaoPedida) && precisaSenha ? "" : acaoPedida;
  const abrir = (a) => (comDinheiro(a) ? pedirSenha(() => setAcao(a)) : setAcao(a));
  useEffect(() => {
    // Veio do menu (Sangria): pede a senha logo.
    if (comDinheiro(acaoPedida)) pedirSenha(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!params.get("acao")) return;
    const p = new URLSearchParams(params);
    p.delete("acao");
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const aberto = (caixas || []).find((c) => c.status === "aberto") || null;
  const ultimoFechado = (caixas || []).find((c) => c.status === "fechado");
  const categorias = useMemo(() => [...new Set((produtos || []).map((p) => String(p.categoria || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [produtos]);

  // Tudo de hoje numa lista: { em, titulo, sub, valor (+/−) | null }
  const linhas = useMemo(() => {
    const l = [];
    (movsCaixa || []).filter((m) => !m.lancamento).forEach((m) => l.push({ id: `c${m.id}`, em: m.em, titulo: m.tipo === "sangria" ? `Sangria${m.origem && m.origem !== "Dinheiro" ? ` do ${m.origem === "Pix" ? "Pix" : "cartão"}` : ""}` : "Reforço", sub: [m.motivo, quemCurto(m.por)].filter(Boolean).join(" · "), valor: m.tipo === "sangria" ? -Number(m.valor || 0) : Number(m.valor || 0) }));
    (movsIns || []).filter((m) => m.tipo === "compra").forEach((m) => l.push({ id: `e${m.id}`, em: m.em, titulo: "Entrada de alimento", sub: [`${m.nome} ${mostrarQtd(Number(m.qtd || 0), m.unidade)}`, quemCurto(m.por)].filter(Boolean).join(" · "), valor: null }));
    resumoSaidas(movsIns || [], dia, dia).lista.forEach((s) => l.push({ id: `p${s.id}`, em: s.em, titulo: "Saída de alimento", sub: [s.descricoes.join(" + ") || s.itens.map((i) => i.nome).join(", "), String(s.motivo || "").split(" · ")[0], quemCurto(s.por)].filter(Boolean).join(" · "), valor: s.valor ? -s.valor : null }));
    (ocorrencias || []).forEach((o) => l.push({ id: `o${o.id}`, em: o.em, titulo: { acabou: "Acabou", tirou: "Tirou da comanda", saiuDiferente: "Saiu diferente", cortesia: "Cortesia", cancelou: "Pedido cancelado" }[o.tipo] || "Ocorrência", sub: [o.texto, o.motivo, quemCurto(o.por)].filter(Boolean).join(" · "), valor: typeof o.valor === "number" && o.tipo !== "saiuDiferente" ? -o.valor : null }));
    (caixaMes?.lista || []).filter((m) => m.dia === dia && m.origem !== "pagamento").forEach((m) => l.push({ id: `l${m.id}`, em: m.em, titulo: m.origem === "fechamento" ? "Caixa do mês · do fechamento" : m.tipo === "saida" ? "Caixa do mês · sangria" : "Caixa do mês · reforço", sub: [m.motivo, quemCurto(m.por)].filter(Boolean).join(" · "), valor: m.tipo === "saida" ? -Number(m.valor || 0) : Number(m.valor || 0) }));
    (despesas || []).forEach((d) => {
      const t = tipoDe(d.tipo);
      const em = d.criadoEm?.toDate ? d.criadoEm.toDate().toISOString() : `${dia}T00:00:00`;
      l.push({ id: `d${d.id}`, em, titulo: t.nome, sub: d.descricao || grupoDe(d.tipo).nome, valor: grupoDe(d.tipo).saida ? -Number(d.valor || 0) : Number(d.valor || 0) });
    });
    return l.sort((a, b) => String(b.em).localeCompare(String(a.em)));
  }, [movsCaixa, movsIns, ocorrencias, despesas, dia, caixaMes]);

  const resumoAberto = aberto && vendasHoje ? resumoCaixa(aberto, vendasDoCaixa(aberto, [], vendasHoje), movsCaixa || [], taxas) : null;

  const carregando = caixas === null || movsCaixa === null || movsIns === null || ocorrencias === null;

  return (
    <div className="container dh">
      {janelaSenha}
      {lib && <BarraLiberado quem={lib.quem} />}
      {souDono && (
        <div className="dh-caixas">
          <div className="dh-loja">
            <div>
              <span>Caixa do dia (gaveta)</span>
              <b>{precisaSenha ? "R$ •••" : resumoAberto ? `R$ ${fmt(resumoAberto.esperado)}` : "fechado"}</b>
            </div>
            {!precisaSenha && resumoAberto && <small>abriu com R$ {fmt(resumoAberto.inicial)} · vendas em dinheiro R$ {fmt(resumoAberto.dinheiro)}</small>}
            {!precisaSenha && resumoAberto && (
              <small>
                {resumoAberto.formas.filter((x) => x.nome !== "Dinheiro" && x.temQueTer > 0).map((x) => `${x.nome} R$ ${fmt(x.temQueTer)}`).join(" · ") || "sem Pix nem cartão ainda"}
              </small>
            )}
            {caixas !== null && !aberto && <button type="button" className="dh-abrir-bt" onClick={() => pedirSenha(() => { setQualCaixa("dia"); setAcao("suprimento"); })}>Abrir o caixa do dia</button>}
            {caixas !== null && aberto && (
              <button type="button" className="dh-fechar-bt" onClick={() => navigate("/config?encerrar=1")}>Fechar o caixa e encerrar o dia</button>
            )}
          </div>
          <div className="dh-loja">
            <div>
              <span>Caixa do mês</span>
              <b className={caixaMes && caixaMes.saldo < 0 ? "dh-neg" : ""}>{precisaSenha || !caixaMes ? "R$ •••" : `${caixaMes.saldo < 0 ? "− " : ""}R$ ${fmt(Math.abs(caixaMes.saldo))}`}</b>
            </div>
            {!precisaSenha && caixaMes && <small>este mês: entrou R$ {fmt(caixaMes.entrou)} · saiu R$ {fmt(caixaMes.saiu)}</small>}
            {!precisaSenha && metaDona > 0 && (
              <div className="dh-meta">
                <small>Dona tirou R$ {fmt(tiradoMes)} de R$ {fmt(metaDona)} no mês</small>
                <i><b style={{ width: `${Math.min(100, (tiradoMes / metaDona) * 100)}%` }} /></i>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="dh-acoes">
        <button type="button" onClick={() => abrir("sangria")}><b>Sangria</b><span>Tirar dinheiro de um caixa</span></button>
        <button type="button" onClick={() => abrir("suprimento")}><b>Reforço</b><span>Pôr dinheiro num caixa</span></button>
        <button type="button" onClick={() => abrir("entrada")}><b>Entrada de alimento</b><span>Chegou mercadoria</span></button>
        <button type="button" onClick={() => abrir("perda")}><b>Saída de alimento</b><span>Queimou, caiu, estragou</span></button>
        <button type="button" onClick={() => abrir("acabou")}><b>Acabou</b><span>Produto acabou hoje</span></button>
        {souDono && (
          <button type="button" className="dh-novo" onClick={() => (acao === "lancar" ? setAcao("") : abrir("lancar"))}><b>+ Novo lançamento</b><span>Compra, despesa, entrada</span></button>
        )}
      </div>

      <div className={`dh-cols${souDono ? " com-lanc" : ""}`}>
        <div className="dh-hoje">
          <h2>Hoje</h2>
          {carregando ? (
            <p className="dh-vazio">Carregando…</p>
          ) : linhas.length === 0 ? (
            <p className="dh-vazio">Nada lançado hoje.</p>
          ) : (
            <ul className="dh-lista">
              {linhas.map((x) => (
                <li key={x.id}>
                  <div>
                    <b>{x.titulo}</b>
                    <span>{hora(x.em)}{x.sub ? ` · ${x.sub}` : ""}</span>
                  </div>
                  <strong className={x.valor === null ? "dh-zero" : x.valor < 0 ? "dh-neg" : "dh-pos"}>
                    {x.valor === null ? "—" : precisaSenha ? "R$ •••" : `${x.valor < 0 ? "− " : "+ "}R$ ${fmt(Math.abs(x.valor))}`}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </div>
        {souDono && (
          <div className={`dh-lanc${acao === "lancar" ? " aberto" : ""}`}>
            {precisaSenha ? (
              <div className="dh-trava">
                <b>Novo lançamento</b>
                <span>Precisa da senha da dona.</span>
                <button type="button" onClick={() => abrir("lancar")}>Entrar com a senha</button>
              </div>
            ) : (
              <NovoLancamento categorias={categorias} onSalvo={() => setAcao("")} caixa={aberto} disponivel={resumoAberto ? disponivelParaTirar(resumoAberto) : null} saldoMes={caixaMes?.saldo ?? null} fornecedores={fornecedores} />
            )}
          </div>
        )}
      </div>

      {(acao === "sangria" || acao === "suprimento") && !qualCaixa && (
        <div className="ins-modal" role="dialog" aria-modal="true" aria-label="Qual caixa" onClick={() => setAcao("")}>
          <div className="ins-modal-caixa dh-qual" onClick={(e) => e.stopPropagation()}>
            <h2>{acao === "sangria" ? "Sangria: tirar de qual caixa?" : "Reforço: pôr em qual caixa?"}</h2>
            <button type="button" onClick={() => setQualCaixa("dia")}><b>Caixa do dia</b><span>Gaveta{resumoAberto ? ` · tem R$ ${fmt(resumoAberto.esperado)}` : " · fechado"}</span></button>
            <button type="button" onClick={() => setQualCaixa("mes")}><b>Caixa do mês</b><span>Dinheiro guardado da loja{caixaMes ? ` · tem R$ ${fmt(caixaMes.saldo)}` : ""}</span></button>
            <button type="button" className="ins-btn" onClick={() => setAcao("")}>Cancelar</button>
          </div>
        </div>
      )}
      {(acao === "sangria" || acao === "suprimento") && qualCaixa === "dia" &&
        (caixas === null ? null : aberto ? (
          <Movimento caixa={aberto} tipo={acao} r={resumoAberto} fechar={() => setAcao("")} />
        ) : (
          <div className="ins-modal" role="dialog" aria-modal="true" aria-label="Abrir o caixa" onClick={() => setAcao("")}>
            <div className="ins-modal-caixa dh-abrir" onClick={(e) => e.stopPropagation()}>
              <p className="dh-aviso">O caixa do dia está fechado. Abra com o troco da gaveta para lançar a {acao === "sangria" ? "sangria" : "reforço"}.</p>
              <Abrir ultimo={ultimoFechado} onAberto={() => {}} />
              <button type="button" className="ins-btn" onClick={() => setAcao("")}>Cancelar</button>
            </div>
          </div>
        ))}
      {(acao === "sangria" || acao === "suprimento") && qualCaixa === "mes" && <MovMes tipo={acao} saldo={caixaMes?.saldo || 0} fechar={() => setAcao("")} />}
      {acao === "entrada" && <EntradaAlimento fechar={() => setAcao("")} />}
      {acao === "perda" && <RegistrarPerda fechar={() => setAcao("")} />}
      {acao === "acabou" && <Acabou produtos={produtos || []} fechar={() => setAcao("")} />}
    </div>
  );
}

/** Marcar que um produto acabou hoje: some do cardápio do dia (volta em Cardápio de hoje) e fica no relatório. */
function Acabou({ produtos, fechar }) {
  const [busca, setBusca] = useState("");
  const [feito, setFeito] = useState("");
  const lista = produtos
    .filter((p) => p.ativo !== false && p.foraHoje !== true)
    .filter((p) => !busca.trim() || semAcento(p.nome).includes(semAcento(busca)))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"))
    .slice(0, 60);
  async function marcar(p) {
    const em = new Date().toISOString();
    await setDoc(doc(db, ...L(), "produtos", p.id), { foraHoje: true, acabouEm: em }, { merge: true });
    registrarOcorrencia({ tipo: "acabou", texto: p.nome, produtoId: p.id });
    registrar({ area: "cardapio", acao: "Acabou", texto: p.nome, motivo: "Acabou durante o dia" });
    setFeito(p.nome);
    setBusca("");
  }
  return (
    <div className="ins-modal" role="dialog" aria-modal="true" aria-label="Acabou" onClick={fechar}>
      <div className="ins-modal-caixa dh-acabou" onClick={(e) => e.stopPropagation()}>
        <h2>O que acabou?</h2>
        {feito && <p className="dh-ok">{feito} saiu do cardápio de hoje.</p>}
        <input className="dh-busca" autoFocus placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <ul className="dh-prods">
          {lista.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => marcar(p)}>
                <span>{p.nome}</span>
                <small>{p.categoria || ""}</small>
              </button>
            </li>
          ))}
          {lista.length === 0 && <li className="dh-vazio">Nenhum produto.</li>}
        </ul>
        <button type="button" className="ins-btn" onClick={fechar}>Fechar</button>
      </div>
    </div>
  );
}

/** Sangria ou reforço do caixa do mês (dinheiro guardado da loja), com motivo. */
function MovMes({ tipo, saldo, fechar }) {
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  async function salvar(e) {
    e.preventDefault();
    const v = lerValor(valor);
    if (!v) return setErro("Informe o valor.");
    if (!motivo.trim()) return setErro("Escreva o motivo.");
    if (tipo === "sangria" && v > saldo) return setErro(`No caixa do mês tem R$ ${fmt(saldo)}.`);
    try {
      await movCaixaLoja({ tipo: tipo === "sangria" ? "saida" : "entrada", valor: v, motivo: motivo.trim(), origem: tipo === "sangria" ? "sangria" : "reforco" });
      registrar({ area: "dinheiro", acao: tipo === "sangria" ? "Sangria do caixa do mês" : "Reforço no caixa do mês", texto: `${tipo === "sangria" ? "Tirou" : "Pôs"} R$ ${fmt(v)}`, valor: tipo === "sangria" ? -v : v, motivo: motivo.trim() });
      fechar();
    } catch {
      setErro("Não foi possível salvar. Confira a internet.");
    }
  }
  return (
    <div className="ins-modal" role="dialog" aria-modal="true" aria-label="Caixa do mês" onClick={fechar}>
      <form className="ins-modal-caixa" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h2>{tipo === "sangria" ? "Tirar do caixa do mês" : "Pôr no caixa do mês"}</h2>
        <p className="dh-aviso">Tem R$ {fmt(saldo)} no caixa do mês.</p>
        <div className="fin-campos">
          <label>Valor (R$)<input autoFocus inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} /></label>
          <label>Motivo<input placeholder={tipo === "sangria" ? "Ex.: pagar fornecedor" : "Ex.: dinheiro guardado de outubro"} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
        </div>
        {erro && <p className="fin-erro">{erro}</p>}
        <div className="ins-modal-botoes">
          <button type="button" className="ins-btn" onClick={fechar}>Cancelar</button>
          <button className="btn-verde">Salvar</button>
        </div>
      </form>
    </div>
  );
}

const MEDIDAS = { kg: [["kg", 1], ["g", 1000]], L: [["litro", 1], ["ml", 1000]], un: [["un", 1]] };

/** Chegou mercadoria: escolhe o ingrediente, a quantidade (kg, g, un) e, se quiser, quanto pagou. */
function EntradaAlimento({ fechar }) {
  const insumos = useLista(() => collection(db, ...L(), "insumos"), []);
  const [busca, setBusca] = useState("");
  const [ins, setIns] = useState(null);
  const [qtd, setQtd] = useState("");
  const [medida, setMedida] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState("");
  const lista = (insumos || []).filter((i) => !busca.trim() || semAcento(i.nome).includes(semAcento(busca))).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")).slice(0, 40);
  async function salvar(e) {
    e.preventDefault();
    const n = Number(String(qtd).replace(",", "."));
    if (!(n > 0)) return setErro("Informe a quantidade.");
    const div = (MEDIDAS[ins.unidade] || MEDIDAS.un).find(([m]) => m === medida)?.[1] || 1;
    try {
      await entradaInsumo(ins, n / div, lerValor(valor), auth.currentUser?.email || "");
      setFeito(`${ins.nome}: entrou ${qtd} ${medida}.`);
      setIns(null);
      setQtd("");
      setValor("");
      setErro("");
    } catch {
      setErro("Não foi possível salvar. Confira a internet.");
    }
  }
  return (
    <div className="ins-modal" role="dialog" aria-modal="true" aria-label="Entrada de alimento" onClick={fechar}>
      <div className="ins-modal-caixa dh-acabou" onClick={(e) => e.stopPropagation()}>
        <h2>Entrada de alimento</h2>
        {feito && <p className="dh-ok">{feito}</p>}
        {!ins ? (
          <>
            <input className="dh-busca" autoFocus placeholder="Buscar ingrediente" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <ul className="dh-prods">
              {lista.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => { setIns(i); setMedida((MEDIDAS[i.unidade] || MEDIDAS.un)[0][0]); }}>
                    <span>{i.nome}</span>
                    <small>tem {mostrarQtd(Number(i.quantidade || 0), i.unidade)}</small>
                  </button>
                </li>
              ))}
              {insumos !== null && lista.length === 0 && <li className="dh-vazio">Nenhum ingrediente.</li>}
            </ul>
            <button type="button" className="ins-btn" onClick={fechar}>Fechar</button>
          </>
        ) : (
          <form onSubmit={salvar} className="dh-entrada">
            <b>{ins.nome}</b>
            <div className="dh-entrada-qtd">
              <input autoFocus inputMode="decimal" placeholder="Quantidade" value={qtd} onChange={(e) => setQtd(e.target.value)} />
              <div className="cx-origem">
                {(MEDIDAS[ins.unidade] || MEDIDAS.un).map(([m]) => (
                  <button type="button" key={m} className={medida === m ? "on" : ""} onClick={() => setMedida(m)}><b>{m}</b></button>
                ))}
              </div>
            </div>
            <input inputMode="decimal" placeholder="Quanto pagou (opcional)" value={valor} onChange={(e) => setValor(e.target.value)} />
            {erro && <p className="fin-erro">{erro}</p>}
            <div className="ins-modal-botoes">
              <button type="button" className="ins-btn" onClick={() => setIns(null)}>Voltar</button>
              <button className="btn-verde">Dar entrada</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
