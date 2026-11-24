// Dinheiro → Hoje: os atalhos do dia a dia (sangria, reforço, saída de alimento, acabou), o novo lançamento
// (só o dono) e tudo o que aconteceu hoje numa lista só, com hora, quem fez e o valor.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import { db } from "../../firebase";
import { L } from "../../loja";
import { useSouDono } from "../../tenant";
import { registrar } from "../../utils/registro";
import { calcularFinancas, isoDia, juntarVendas, periodo, tipoDe, grupoDe } from "../../utils/financas";
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
  const dia = isoDia();
  const inicioDia = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const caixas = useLista(() => query(collection(db, ...L(), "caixas"), orderBy("abertoEm", "desc"), limit(5)), []);
  const movsCaixa = useLista(() => query(collection(db, ...L(), "caixaMov"), where("em", ">=", inicioDia)), [inicioDia]);
  const movsIns = useLista(() => query(collection(db, ...L(), "insumosMov"), where("em", ">=", inicioDia)), [inicioDia]);
  const produtos = useLista(() => collection(db, ...L(), "produtos"), []);
  const vendasHoje = useLista(() => collection(db, ...L(), "vendasDia"), []);
  const taxas = useTaxas();
  const ocorrencias = useOcorrencias(dia);
  // Lançamentos do mês (só o dono lê): os de hoje vão para a lista; o mês inteiro dá o caixa da loja.
  const mes = periodo("mes");
  const [despesasMes, setDespesasMes] = useState([]);
  const [diasFechados, setDiasFechados] = useState([]);
  useEffect(() => {
    if (!souDono) return undefined;
    const a = onSnapshot(query(collection(db, ...L(), "despesas"), where("data", ">=", mes.de)), (s) => setDespesasMes(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setDespesasMes([]));
    const b = onSnapshot(collection(db, ...L(), "relatorioGerencial"), (s) => setDiasFechados(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setDiasFechados([]));
    return () => {
      a();
      b();
    };
  }, [souDono, mes.de]);
  const despesas = useMemo(() => despesasMes.filter((d) => d.data === dia), [despesasMes, dia]);
  const [metaDona, setMetaDona] = useState(0);
  useEffect(() => (souDono ? onSnapshot(doc(db, ...L(), "configuracoes", "precificacao"), (s) => setMetaDona(Number(s.data()?.metaDona || 0)), () => {}) : undefined), [souDono]);
  const tiradoMes = useMemo(() => Math.round(despesasMes.filter((d) => d.tipo === "retirada").reduce((t, d) => t + Number(d.valor || 0), 0) * 100) / 100, [despesasMes]);
  const fornecedores = useMemo(() => [...new Set(despesasMes.map((d) => d.fornecedor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [despesasMes]);

  const [acaoPedida, setAcao] = useState(params.get("acao") || ""); // sangria | suprimento | perda | acabou | lancar
  const [pedirSenha, janelaSenha, precisaSenha] = useComSenha();
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
    resumoSaidas(movsIns || [], dia, dia).lista.forEach((s) => l.push({ id: `p${s.id}`, em: s.em, titulo: "Saída de alimento", sub: [s.descricoes.join(" + ") || s.itens.map((i) => i.nome).join(", "), String(s.motivo || "").split(" · ")[0], quemCurto(s.por)].filter(Boolean).join(" · "), valor: s.valor ? -s.valor : null }));
    (ocorrencias || []).forEach((o) => l.push({ id: `o${o.id}`, em: o.em, titulo: { acabou: "Acabou", tirou: "Tirou da comanda", saiuDiferente: "Saiu diferente", cortesia: "Cortesia", cancelou: "Pedido cancelado" }[o.tipo] || "Ocorrência", sub: [o.texto, o.motivo, quemCurto(o.por)].filter(Boolean).join(" · "), valor: typeof o.valor === "number" && o.tipo !== "saiuDiferente" ? -o.valor : null }));
    (despesas || []).forEach((d) => {
      const t = tipoDe(d.tipo);
      const em = d.criadoEm?.toDate ? d.criadoEm.toDate().toISOString() : `${dia}T00:00:00`;
      l.push({ id: `d${d.id}`, em, titulo: t.nome, sub: d.descricao || grupoDe(d.tipo).nome, valor: grupoDe(d.tipo).saida ? -Number(d.valor || 0) : Number(d.valor || 0) });
    });
    return l.sort((a, b) => String(b.em).localeCompare(String(a.em)));
  }, [movsCaixa, movsIns, ocorrencias, despesas, dia]);

  // Caixa da loja: tudo o que entrou no mês (vendas sem a maquininha + entradas) menos tudo o que saiu (compras, despesas, retiradas).
  const caixaLoja = useMemo(() => {
    if (!souDono || vendasHoje === null) return null;
    const f = calcularFinancas({ vendas: juntarVendas(diasFechados, vendasHoje), produtos: [], custos: {}, lancamentos: despesasMes, taxas, de: mes.de, ate: mes.ate });
    return { saldo: f.saldoCaixa, entrou: f.entrouCaixa, saiu: f.saiuCaixa };
  }, [souDono, diasFechados, vendasHoje, despesasMes, taxas, mes.de, mes.ate]);
  const resumoAberto = aberto && vendasHoje ? resumoCaixa(aberto, vendasDoCaixa(aberto, [], vendasHoje), movsCaixa || [], taxas) : null;

  const carregando = caixas === null || movsCaixa === null || movsIns === null || ocorrencias === null;

  return (
    <div className="container dh">
      {janelaSenha}
      {lib && <BarraLiberado quem={lib.quem} />}
      {souDono && caixaLoja && (
        <div className="dh-loja">
          <div>
            <span>Caixa da loja · {new Date().toLocaleDateString("pt-BR", { month: "long" }).replace(/^./, (x) => x.toUpperCase())}</span>
            <b className={caixaLoja.saldo < 0 ? "dh-neg" : ""}>{precisaSenha ? "R$ •••" : `${caixaLoja.saldo < 0 ? "− " : ""}R$ ${fmt(Math.abs(caixaLoja.saldo))}`}</b>
          </div>
          {!precisaSenha && <small>entrou R$ {fmt(caixaLoja.entrou)} · saiu R$ {fmt(caixaLoja.saiu)}</small>}
          {!precisaSenha && metaDona > 0 && (
            <div className="dh-meta">
              <small>Dona tirou R$ {fmt(tiradoMes)} de R$ {fmt(metaDona)} no mês</small>
              <i><b style={{ width: `${Math.min(100, (tiradoMes / metaDona) * 100)}%` }} /></i>
            </div>
          )}
        </div>
      )}
      <div className="dh-acoes">
        <button type="button" onClick={() => abrir("sangria")}><b>Sangria</b><span>Tirar dinheiro da gaveta</span></button>
        <button type="button" onClick={() => abrir("suprimento")}><b>Reforço</b><span>Pôr dinheiro na gaveta</span></button>
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
              <NovoLancamento categorias={categorias} onSalvo={() => setAcao("")} caixa={aberto} disponivel={resumoAberto ? disponivelParaTirar(resumoAberto) : null} fornecedores={fornecedores} />
            )}
          </div>
        )}
      </div>

      {(acao === "sangria" || acao === "suprimento") &&
        (caixas === null ? null : aberto ? (
          <Movimento caixa={aberto} tipo={acao} r={resumoAberto} fechar={() => setAcao("")} />
        ) : (
          <div className="ins-modal" role="dialog" aria-modal="true" aria-label="Abrir o caixa" onClick={() => setAcao("")}>
            <div className="ins-modal-caixa dh-abrir" onClick={(e) => e.stopPropagation()}>
              <p className="dh-aviso">O caixa está fechado. Abra com o troco da gaveta para lançar a {acao === "sangria" ? "sangria" : "reforço"}.</p>
              <Abrir ultimo={ultimoFechado} onAberto={() => {}} />
              <button type="button" className="ins-btn" onClick={() => setAcao("")}>Cancelar</button>
            </div>
          </div>
        ))}
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
