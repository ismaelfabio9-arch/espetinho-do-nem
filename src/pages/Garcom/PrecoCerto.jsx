// Preço certo (Cardápio e estoque → Preço certo, só o dono). Estimativa POR PRODUTO, depois de tudo:
//   preço − ingredientes (com a embalagem) − maquininha e impostos da venda − parte das contas do mês = lucro.
// A parte das contas = contas do mês ÷ quanto a loja vende no mês (um número só, que o dono informa); somada no
// mês, dá as contas (não desconta duas vezes). Sem meta: o que sobrou de verdade fica em Dinheiro → Lucro e caixa.
// Só os ingredientes = conta simples: os ingredientes podem pesar no máximo X% do preço.
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { L } from "../../loja";
import { ehCategoriaDeBebida, ehCategoriaDePrato, precosDoCardapio } from "../../utils/montagem";
import { PESO_INGREDIENTES_PADRAO, contaDoProduto, pctDasContas, pctPorVenda, pesoIngredientes, precoBonito } from "../../utils/precificacao";
import { daFicha as paraUnidadeDoInsumo, itensJuntos, unidadeDe } from "../../utils/insumos";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R = (v) => (v < 0 ? `− R$ ${fmt(-v)}` : `R$ ${fmt(v)}`);
const fmtPct = (n) => `${String(Math.round(n * 10) / 10).replace(".", ",")}%`;
/** "1.234,50", "12,5" ou "12.5" → número; vazio ou inválido → null. */
const numDe = (v, max = Infinity) => {
  const t = String(v ?? "").trim();
  const n = Number(t.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t);
  return t !== "" && Number.isFinite(n) && n >= 0 && n < max ? n : null;
};
const t = (v) => (typeof v === "number" ? String(v).replace(".", ",") : "");
const ordemCat = (c) => (ehCategoriaDePrato(c) ? 0 : ehCategoriaDeBebida(c) ? 2 : 1);

const LISTAS = {
  fixas: ["Aluguel", "Funcionários", "Energia (luz)", "Água", "Internet e telefone", "Gás", "Contador", "Sistemas e aplicativos"],
  variaveis: ["Embalagens", "Entregador (motoboy)", "Taxa de aplicativo de entrega", "Divulgação e anúncios"],
};

export default function PrecoCerto({ produtos, custos, daFicha, vendas30 = 0, insumos = [], fichas = [] }) {
  // Produtos que já têm ingredientes na ficha (mesmo sem preço): a porção rápida não mexe neles.
  const comFicha = useMemo(() => new Set((fichas || []).filter((fi) => itensJuntos(fi).length > 0).map((fi) => fi.id)), [fichas]);
  const [salvo, setSalvo] = useState(null); // configuracoes/precificacao
  const [form, setForm] = useState(null);
  const [precos, setPrecos] = useState({}); // preço digitado (simula antes de salvar) { id: texto }
  const [detalhe, setDetalhe] = useState({});
  const [filtro, setFiltro] = useState("todos");
  const [msg, setMsg] = useState("");
  const [msgProduto, setMsgProduto] = useState({});
  useEffect(() => onSnapshot(doc(db, ...L(), "configuracoes", "precificacao"), (s) => setSalvo(s.data() || {}), () => setSalvo({})), []);
  useEffect(() => {
    if (salvo && !form) {
      const m = (k, padrao = "pct") => (salvo[`${k}Modo`] === "valor" ? "valor" : salvo[`${k}Modo`] === "pct" ? "pct" : padrao);
      setForm({
        conta: salvo.conta === "ingredientes" ? "ingredientes" : "completo",
        pesoIngredientes: t(pesoIngredientes(salvo)),
        maquininha: t(salvo.maquininha),
        impostos: t(salvo.impostos), impostosModo: m("impostos"),
        variaveis: t(salvo.variaveis), variaveisModo: m("variaveis"),
        fixas: t(salvo.fixas), fixasModo: m("fixas", "valor"),
        fixasItens: (salvo.fixasItens || []).map((i) => ({ nome: i.nome, valor: t(i.valor) })),
        variaveisItens: (salvo.variaveisItens || []).map((i) => ({ nome: i.nome, valor: t(i.valor) })),
        vendasMes: t(salvo.vendasMes),
      });
    }
  }, [salvo, form]);

  const ativos = useMemo(
    () =>
      (produtos || [])
        .filter((x) => x.nome && x.ativo !== false)
        .sort((a, b) => ordemCat(a.categoria) - ordemCat(b.categoria) || String(a.categoria || "").localeCompare(String(b.categoria || ""), "pt-BR") || String(a.nome).localeCompare(String(b.nome), "pt-BR")),
    [produtos]
  );
  if (!form || salvo === null) return <p className="fin-carregando">Carregando…</p>;

  // Despesa preenchida uma por uma (aluguel, funcionários…): o total do mês vira o valor do campo, em R$.
  const totalItens = (k) => (form[`${k}Itens`] || []).reduce((s, i) => s + (numDe(i.valor) || 0), 0);
  const usaItens = (k) => totalItens(k) > 0;
  const valorDe = (k) => (usaItens(k) ? Math.round(totalItens(k) * 100) / 100 : numDe(form[k]));
  const modoDe = (k) => (usaItens(k) ? "valor" : form[`${k}Modo`]);
  // O que está na tela (ainda sem salvar) é o que a conta usa: tudo recalcula na hora.
  const config = {
    maquininha: numDe(form.maquininha, 100),
    impostos: valorDe("impostos"), impostosModo: modoDe("impostos"),
    variaveis: valorDe("variaveis"), variaveisModo: modoDe("variaveis"),
    fixas: valorDe("fixas"), fixasModo: modoDe("fixas"),
    vendasMes: numDe(form.vendasMes),
  };
  const pv = pctPorVenda(config);
  const contas = pctDasContas(config);
  const soIngredientes = form.conta === "ingredientes";
  const peso = numDe(form.pesoIngredientes, 100) || PESO_INGREDIENTES_PADRAO;
  const precoDe = (x) => {
    const n = numDe(precos[x.id]);
    return n !== null && n > 0 ? n : Number(x.preco || 0);
  };

  // As partes em % de cada venda nunca passam de 100%: cada campo em % aceita no máximo o que sobra.
  const pctDe = (k) => (k === "maquininha" ? config.maquininha || 0 : config[`${k}Modo`] === "pct" ? config[k] || 0 : 0);
  const avisoMax = form._avisoMax || {};
  function mudarCampo(k, txt) {
    const emPct = k === "maquininha" || form[`${k}Modo`] === "pct";
    const n = emPct ? numDe(txt) : null;
    const usado = pv + (contas.emPct || 0) - pctDe(k);
    const max = Math.max(0, Math.floor((99 - usado) * 10) / 10);
    if (n !== null && n > max) {
      setForm({ ...form, [k]: String(max).replace(".", ","), _avisoMax: { ...avisoMax, [k]: `Máximo ${fmtPct(max)}: com as outras partes, cada venda já paga ${fmtPct(usado)}.` } });
      return;
    }
    setForm({ ...form, [k]: txt, _avisoMax: { ...avisoMax, [k]: "" } });
  }

  async function mudarConta(conta) {
    setForm({ ...form, conta });
    try {
      await setDoc(doc(db, ...L(), "configuracoes", "precificacao"), { conta, atualizadoEm: new Date().toISOString() }, { merge: true });
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
  }

  async function salvar() {
    const itens = (k) => (form[`${k}Itens`] || []).filter((i) => String(i.nome || "").trim() && numDe(i.valor)).map((i) => ({ nome: String(i.nome).trim().slice(0, 40), valor: numDe(i.valor) }));
    try {
      await setDoc(
        doc(db, ...L(), "configuracoes", "precificacao"),
        {
          conta: form.conta,
          pesoIngredientes: peso,
          maquininha: config.maquininha,
          impostos: config.impostos, impostosModo: config.impostosModo,
          variaveis: config.variaveis, variaveisModo: config.variaveisModo,
          fixas: config.fixas, fixasModo: config.fixasModo,
          fixasItens: itens("fixas"),
          variaveisItens: itens("variaveis"),
          vendasMes: config.vendasMes,
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );
      setMsg("✓ Salvo");
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
    setTimeout(() => setMsg(""), 2000);
  }

  async function salvarPreco(x) {
    const n = numDe(precos[x.id]);
    if (!(n > 0)) return;
    try {
      await updateDoc(doc(db, ...L(), "produtos", x.id), { preco: Math.round(n * 100) / 100 });
      setPrecos((p) => {
        const c = { ...p };
        delete c[x.id];
        return c;
      });
      setMsgProduto({ ...msgProduto, [x.id]: "✓ Preço salvo no cardápio" });
    } catch {
      setMsgProduto({ ...msgProduto, [x.id]: "Não foi possível salvar. Confira a internet." });
    }
    setTimeout(() => setMsgProduto((m) => ({ ...m, [x.id]: "" })), 2500);
  }

  const campo = (k, nome, dica, { comModo = false, lista = null, padraoValor = false } = {}) => (
    <div key={k} className="pc-campo">
      <span>
        {nome}
        <small>{dica}</small>
      </span>
      <span className="pc-input">
        {comModo && (
          <span className="pc-modo" role="group" aria-label={`${nome}: em % ou R$`}>
            <button type="button" aria-pressed={form[`${k}Modo`] !== "valor"} className={form[`${k}Modo`] !== "valor" ? "ativo" : ""} onClick={() => setForm({ ...form, [`${k}Modo`]: "pct", [k]: "" })}>%</button>
            <button type="button" aria-pressed={form[`${k}Modo`] === "valor"} className={form[`${k}Modo`] === "valor" ? "ativo" : ""} onClick={() => setForm({ ...form, [`${k}Modo`]: "valor", [k]: "" })}>R$</button>
          </span>
        )}
        <input
          inputMode="decimal"
          placeholder={modoDe(k) === "valor" || padraoValor ? "0,00" : "0"}
          aria-label={`${nome} (${k === "maquininha" ? "%" : modoDe(k) === "valor" ? "R$ por mês" : "%"})`}
          value={usaItens(k) ? fmt(totalItens(k)) : form[k]}
          readOnly={usaItens(k)}
          onChange={(e) => mudarCampo(k, e.target.value)}
        />
        <em>{k !== "maquininha" && modoDe(k) === "valor" ? "por mês" : "%"}</em>
      </span>
      {avisoMax[k] && <small className="pc-equiv pc-max">{avisoMax[k]}</small>}
      {lista && (
        <ItensDespesa
          nome={nome}
          sugestoes={lista}
          itens={form[`${k}Itens`] || []}
          aberto={!!detalhe[k]}
          abrir={() => setDetalhe({ ...detalhe, [k]: !detalhe[k] })}
          total={totalItens(k)}
          mudar={(itens) => setForm({ ...form, [`${k}Itens`]: itens, ...(itens.some((i) => numDe(i.valor)) ? { [`${k}Modo`]: "valor" } : {}) })}
        />
      )}
    </div>
  );

  // A conta de cada produto (com o preço digitado, se tiver).
  const linhas = ativos.map((x) => {
    const custo = typeof custos[x.id] === "number" ? custos[x.id] : null;
    const preco = precoDe(x);
    const c = soIngredientes ? null : contaDoProduto(custo, preco, config);
    const minIng = custo !== null ? precoBonito(custo / (peso / 100)) : null;
    const situacao = custo === null ? "sem-custo" : !(preco > 0) ? "sem-preco" : soIngredientes ? (preco >= minIng - 0.004 ? "ok" : "baixo") : c.lucro < 0 ? "prejuizo" : "ok";
    return { x, custo, preco, c, minIng, situacao };
  });
  const mostrar = linhas.filter((l) => (filtro === "prejuizo" ? l.situacao === "prejuizo" || l.situacao === "baixo" : filtro === "sem" ? l.situacao === "sem-custo" : true));
  const grupos = Object.values(
    mostrar.reduce((acc, l) => {
      const nome = String(l.x.categoria || "").trim() || "Sem categoria";
      (acc[nome] = acc[nome] || { nome, itens: [] }).itens.push(l);
      return acc;
    }, {})
  );
  const nPrejuizo = linhas.filter((l) => l.situacao === "prejuizo" || l.situacao === "baixo").length;
  const nSem = linhas.filter((l) => l.situacao === "sem-custo").length;

  return (
    <>
      <div className="relatorio-documento">
        <h2>Como calcular o lucro</h2>
        <div className="pc-conta" role="radiogroup" aria-label="Como calcular o lucro">
          <button type="button" role="radio" aria-checked={soIngredientes} className={soIngredientes ? "ativo" : ""} onClick={() => mudarConta("ingredientes")}>
            <b>🥩 Só os ingredientes</b>
            <small>Lucro = preço − ingredientes. Sem despesas.</small>
          </button>
          <button type="button" role="radio" aria-checked={!soIngredientes} className={!soIngredientes ? "ativo" : ""} onClick={() => mudarConta("completo")}>
            <b>📊 Conta completa</b>
            <small>Ingredientes, taxas, impostos e as contas da loja.</small>
          </button>
        </div>

        {soIngredientes ? (
          <div className="pc-campos">
            <div className="pc-campo">
              <span>
                Quanto os ingredientes podem pesar no preço
                <small>Restaurante costuma ficar entre 25% e 35%: o resto do preço paga o aluguel, os funcionários, as contas e o seu lucro.</small>
              </span>
              <span className="pc-input">
                <input inputMode="decimal" placeholder={String(PESO_INGREDIENTES_PADRAO)} aria-label="Quanto os ingredientes podem pesar no preço (%)" value={form.pesoIngredientes} onChange={(e) => setForm({ ...form, pesoIngredientes: e.target.value })} />
                <em>%</em>
              </span>
            </div>
          </div>
        ) : (
          <>
            <h3 className="pc-sec">O que sai em cada venda</h3>
            <p className="fin-explica">Em % do preço. O que ficar em branco conta como 0. A embalagem entra nos ingredientes do produto.</p>
            <div className="pc-campos">
              {campo("maquininha", "Taxa da maquininha", "% que a maquininha cobra em cada venda")}
              {campo("impostos", "Impostos", "Simples Nacional: em % de cada venda · MEI: o boleto do mês (DAS) em R$", { comModo: true })}
            </div>
            <h3 className="pc-sec">Contas da loja no mês</h3>
            <p className="fin-explica">Divididas pelo que a loja vende no mês: cada venda paga a sua parte (sem descontar duas vezes).</p>
            <div className="pc-campos">
              {campo("fixas", "Despesas fixas", "aluguel, funcionários, luz, água, contador…", { comModo: true, lista: LISTAS.fixas, padraoValor: true })}
              {campo("variaveis", "Despesas variáveis", "entregador, aplicativo, divulgação…: o total do mês em R$ ou em % de cada venda", { comModo: true, lista: LISTAS.variaveis })}
              <label className="pc-campo">
                <span>
                  Quanto a loja vende por mês
                  <small>
                    Um valor aproximado, em R$ (não precisa saber de cada produto).
                    {vendas30 > 0 ? ` O sistema registrou ${R(vendas30)} de vendas nos últimos 30 dias.` : ""}
                  </small>
                </span>
                <span className="pc-input">
                  <input inputMode="decimal" placeholder="0,00" aria-label="Quanto a loja vende por mês (R$)" value={form.vendasMes} onChange={(e) => setForm({ ...form, vendasMes: e.target.value })} />
                  <em>R$</em>
                </span>
              </label>
            </div>
            {contas.pct === null ? (
              <p className="fin-aviso">⚠️ Para dividir as contas ({R(contas.contasMes)} por mês) entre os produtos, diga quanto a loja vende por mês.</p>
            ) : (
              contas.pct > 0 && (
                <p className="pc-resumo">
                  {contas.contasMes > 0 && contas.vendasMes ? `As contas do mês (${R(contas.contasMes)}) são ${fmtPct(contas.pct - contas.emPct)} do que a loja vende (${R(contas.vendasMes)}). ` : ""}
                  Cada produto paga {fmtPct(contas.pct)} do preço para as contas{pv > 0 ? ` e ${fmtPct(pv)} de maquininha e impostos` : ""}.
                </p>
              )
            )}
          </>
        )}
        <button type="button" className="btn-verde pc-salvar" onClick={salvar}>Salvar</button>
        {msg && <p className="fin-ok-msg">{msg}</p>}
      </div>

      <div className="relatorio-documento">
        <h2>Lucro de cada produto</h2>
        <p className="fin-explica">
          {soIngredientes
            ? `Preço bom = os ingredientes serem no máximo ${fmtPct(peso)} do preço.`
            : "Estimativa de quanto sobra para você em cada um, depois de tudo. Pode digitar outro preço para ver como fica. O que sobrou de verdade no mês fica em Dinheiro → Lucro e caixa."}
        </p>
        <div className="fin-periodos" role="group" aria-label="Filtrar produtos">
          {[
            { id: "todos", nome: `Todos (${linhas.length})` },
            { id: "prejuizo", nome: soIngredientes ? `Abaixo (${nPrejuizo})` : `Dão prejuízo (${nPrejuizo})` },
            { id: "sem", nome: `Sem custo (${nSem})` },
          ].map((f) => (
            <button key={f.id} type="button" className={filtro === f.id ? "ativo" : ""} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.nome}
            </button>
          ))}
        </div>
        <ul className="pc-lista">
          {grupos.map((g) => (
            <Fragment key={g.nome}>
              <li className="pc-grupo">
                <h3>{g.nome}</h3>
                <small>{g.itens.length} {g.itens.length === 1 ? "produto" : "produtos"}</small>
              </li>
              {g.itens.map(({ x, custo, preco, c, minIng, situacao }) => {
                const opcoes = precosDoCardapio(x);
                const mudouPreco = numDe(precos[x.id]) > 0 && Math.abs(numDe(precos[x.id]) - Number(x.preco || 0)) > 0.004;
                const minimo = soIngredientes ? minIng : c?.minimo ?? null;
                return (
                  <li key={x.id} className={`pc-item pc-prod ${situacao}`}>
                    <div className="pc-linha pc-linha-fixa">
                      <span className="pc-nome">
                        <strong>{x.nome}</strong>
                        {custo === null && (
                          <small>
                            Sem custo: <Link to={`/cardapio?aba=produtos&editar=${encodeURIComponent(x.id)}`}>pôr os ingredientes</Link>
                          </small>
                        )}
                        {soIngredientes && custo !== null && preco > 0 && (
                          <small>Ingredientes {R(custo)} = <b>{fmtPct((custo / preco) * 100)}</b> do preço · sobra <b>{R(preco - custo)}</b></small>
                        )}
                      </span>
                      <span className="pc-status">
                        {situacao === "sem-custo" && <b className="pc-chip baixo">Sem custo</b>}
                        {situacao === "prejuizo" && <b className="pc-chip ruim">Prejuízo</b>}
                        {situacao === "baixo" && <b className="pc-chip baixo">Abaixo</b>}
                        {situacao === "ok" && !soIngredientes && <b className="pc-chip bom">{fmtPct(c.margem)} de lucro</b>}
                        {situacao === "ok" && soIngredientes && <b className="pc-chip bom">✓ Preço bom</b>}
                      </span>
                    </div>
                    {c && (
                      <div className="pc-conta-prod" aria-label={`Conta de ${x.nome}`}>
                        <span>Preço de venda</span><b>{R(c.preco)}</b>
                        <span>− Ingredientes{typeof daFicha?.[x.id] === "number" ? "" : " (custo digitado)"}</span><b>{R(-c.custo)}</b>
                        {c.taxas > 0 && (<><span>− Maquininha e impostos</span><b>{R(-c.taxas)}</b></>)}
                        {c.parteContas !== null && c.parteContas > 0 && (<><span>− Parte das contas da loja</span><b>{R(-c.parteContas)}</b></>)}
                        {c.faltaVendas && (<><span>− Parte das contas da loja</span><b>?</b></>)}
                        <span className="pc-total">= Lucro para você</span><b className={`pc-total ${c.lucro < 0 ? "fin-neg" : "pc-verde"}`}>{R(c.lucro)} ({fmtPct(c.margem)})</b>
                      </div>
                    )}
                    {typeof daFicha?.[x.id] !== "number" && !comFicha.has(x.id) && (
                      <PorcaoRapida produto={x} insumos={insumos} digitado={typeof custos?.[x.id] === "number" ? custos[x.id] : null} />
                    )}
                    <div className="pc-preco">
                      {opcoes ? (
                        <small>Preço por opção ({opcoes.map((o) => `${o.nome} ${R(o.preco)}`).join(" · ")}): a conta usa o menor. Mude em Produtos → editar.</small>
                      ) : (
                        <span className="pc-input">
                          Preço R$
                          <input inputMode="decimal" aria-label={`Preço de ${x.nome}`} value={precos[x.id] ?? fmt(Number(x.preco || 0))} onChange={(e) => setPrecos({ ...precos, [x.id]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && salvarPreco(x)} />
                        </span>
                      )}
                      {mudouPreco && <button type="button" className="btn-verde" onClick={() => salvarPreco(x)}>Salvar preço</button>}
                      {!opcoes && minimo !== null && preco < minimo - 0.004 && (
                        <button type="button" className="ins-btn" onClick={() => setPrecos({ ...precos, [x.id]: fmt(soIngredientes ? minimo : precoBonito(minimo)) })}>
                          Usar o mínimo ({R(soIngredientes ? minimo : precoBonito(minimo))})
                        </button>
                      )}
                      {!soIngredientes && minimo !== null && <small>Abaixo de {R(minimo)} este produto dá prejuízo.</small>}
                      {c?.faltaVendas && <small>Diga quanto a loja vende por mês (acima) para entrar a parte das contas.</small>}
                      {msgProduto[x.id] && <small>{msgProduto[x.id]}</small>}
                    </div>
                  </li>
                );
              })}
            </Fragment>
          ))}
        </ul>
        {nSem > 0 && (
          <p className="fin-explica">O custo de cada produto sai dos ingredientes dele (Produtos → editar) e do preço de cada ingrediente (aba <Link to="/cardapio?aba=ingredientes">Ingredientes</Link>).</p>
        )}
      </div>
    </>
  );
}

/** Despesas do mês uma por uma: as mais comuns já na lista, e "+ Adicionar" para o que faltar. */
function ItensDespesa({ nome, sugestoes, itens, aberto, abrir, total, mudar }) {
  const [novo, setNovo] = useState("");
  const lista = [...sugestoes.filter((n) => !itens.some((i) => i.nome === n)).map((n) => ({ nome: n, valor: "" })), ...itens].sort(
    (a, b) => (sugestoes.indexOf(a.nome) === -1 ? 99 : sugestoes.indexOf(a.nome)) - (sugestoes.indexOf(b.nome) === -1 ? 99 : sugestoes.indexOf(b.nome))
  );
  const setValor = (n, valor) => {
    const ja = itens.find((i) => i.nome === n);
    mudar(ja ? itens.map((i) => (i.nome === n ? { ...i, valor } : i)) : [...itens, { nome: n, valor }]);
  };
  return (
    <div className="pc-itens">
      <button type="button" className="pc-itens-abrir" aria-expanded={aberto} onClick={abrir}>
        {aberto ? "▴ Fechar a lista" : `▾ Preencher uma por uma${total > 0 ? ` (${R(total)} por mês)` : ""}`}
      </button>
      {aberto && (
        <div className="pc-itens-lista" role="group" aria-label={`${nome}: uma por uma`}>
          {lista.map((i) => (
            <label key={i.nome} className="pc-item-linha">
              <span>{i.nome}</span>
              <span className="pc-input">
                R$
                <input inputMode="decimal" placeholder="0,00" aria-label={`${i.nome} (R$ por mês)`} value={i.valor} onChange={(e) => setValor(i.nome, e.target.value)} />
                {!sugestoes.includes(i.nome) ? (
                  <button type="button" className="fin-btn-x" aria-label={`Tirar ${i.nome}`} onClick={(e) => { e.preventDefault(); mudar(itens.filter((x) => x.nome !== i.nome)); }}>✕</button>
                ) : (
                  <span className="pc-x-vazio" />
                )}
              </span>
            </label>
          ))}
          <div className="pc-item-novo">
            <input placeholder="Outra despesa (ex.: segurança, limpeza)" aria-label="Nome da outra despesa" maxLength={40} value={novo} onChange={(e) => setNovo(e.target.value)} />
            <button
              type="button"
              className="ins-btn entrada"
              disabled={!novo.trim() || lista.some((i) => i.nome.toLowerCase() === novo.trim().toLowerCase())}
              onClick={() => {
                mudar([...itens, { nome: novo.trim(), valor: "" }]);
                setNovo("");
              }}
            >
              + Adicionar
            </button>
          </div>
          <p className="pc-itens-total">Total: <b>{R(total)}</b> por mês</p>
        </div>
      )}
    </div>
  );
}


const semAcento = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const QTD_PADRAO = { kg: "150", L: "300", un: "1" };

/**
 * Porção de um ingrediente (acompanhamento, bebida comprada pronta): "150 g de Arroz".
 * O custo é o da porção, pelo preço do ingrediente (comprei 5 kg por R$ 40 → 150 g = R$ 1,20),
 * e não o preço do quilo. Grava a ficha do produto e apaga o custo digitado antes.
 */
function PorcaoRapida({ produto, insumos, digitado }) {
  const ativos = (insumos || []).filter((i) => i.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  // Sugere o ingrediente de mesmo nome (Arroz → Arroz; Batata frita → Batata).
  const sugerido = useMemo(() => {
    const p = semAcento(produto.nome);
    return ativos.find((i) => semAcento(i.nome) === p) || ativos.find((i) => p.includes(semAcento(i.nome)) || semAcento(i.nome).includes(p)) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produto.nome, insumos]);
  const [aberto, setAberto] = useState(false);
  const [insumoId, setInsumoId] = useState(sugerido?.id || "");
  const ins = ativos.find((i) => i.id === insumoId) || null;
  const u = unidadeDe(ins?.unidade);
  const [qtd, setQtd] = useState(QTD_PADRAO[ins?.unidade] || "150");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const qtdNum = numDe(qtd);
  const custo = ins && typeof ins.custo === "number" && qtdNum ? Math.round((qtdNum / u.fator) * ins.custo * 100) / 100 : null;

  async function salvar() {
    if (!ins) return setErro("Escolha o ingrediente.");
    if (!(qtdNum > 0)) return setErro(`Escreva quanto vai na porção (em ${u.sub}).`);
    setSalvando(true);
    setErro("");
    try {
      const agora = new Date().toISOString();
      await setDoc(doc(db, ...L(), "fichas", produto.id), { itens: [{ insumoId: ins.id, qtd: paraUnidadeDoInsumo(qtd, ins.unidade) }], nome: produto.nome, atualizadoEm: agora });
      if (digitado !== null) await setDoc(doc(db, ...L(), "custos", produto.id), { custo: null, nome: produto.nome, atualizadoEm: agora }, { merge: true });
    } catch {
      setErro("Não foi possível salvar. Confira a internet.");
      setSalvando(false);
    }
  }

  if (!aberto)
    return (
      <div className="pc-porcao-chamada">
        <span>
          {digitado !== null
            ? `O custo de ${R(digitado)} foi digitado à mão. É uma porção (ex.: 150 g de arroz)? Diga quanto vai e o custo sai certo.`
            : "Sem custo ainda. É uma porção de um ingrediente (ex.: 150 g de arroz)?"}
        </span>
        <button type="button" className="ins-btn" onClick={() => setAberto(true)}>Quanto vai na porção?</button>
      </div>
    );

  return (
    <div className="pc-porcao">
      <strong>Quanto vai na porção de {produto.nome}?</strong>
      {ativos.length === 0 ? (
        <p className="pc-porcao-dica">
          Cadastre primeiro o ingrediente com o preço da compra (ex.: Arroz, comprei 5 kg por R$ 40) em <Link to="/cardapio?aba=ingredientes">Ingredientes</Link>.
        </p>
      ) : (
        <>
          <div className="pc-porcao-linha">
            <label className="pc-input pc-porcao-qtd">
              <input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label={`Quantidade na porção, em ${u.sub}`} />
              {u.sub}
            </label>
            <span>de</span>
            <select
              value={insumoId}
              onChange={(e) => {
                const novo = ativos.find((i) => i.id === e.target.value);
                setInsumoId(e.target.value);
                if (novo && novo.unidade !== ins?.unidade) setQtd(QTD_PADRAO[novo.unidade] || "1");
              }}
              aria-label="Ingrediente"
            >
              <option value="">Ingrediente…</option>
              {ativos.map((i) => (
                <option key={i.id} value={i.id}>{i.nome}</option>
              ))}
            </select>
          </div>
          {ins && typeof ins.custo !== "number" && <p className="pc-porcao-dica">Esse ingrediente está sem preço: ponha o preço da compra em <Link to="/cardapio?aba=ingredientes">Ingredientes</Link>.</p>}
          {custo !== null && (
            <p className="pc-porcao-dica">
              {qtd} {u.sub} de {ins.nome} custam <b>{R(custo)}</b> (o {u.nomeLongo} sai a {R(ins.custo)}).
            </p>
          )}
          {erro && <p className="cp-erro">{erro}</p>}
          <div className="pc-porcao-botoes">
            <button type="button" className="ins-btn" onClick={() => setAberto(false)}>Cancelar</button>
            <button type="button" className="btn-verde" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar a porção"}</button>
          </div>
        </>
      )}
    </div>
  );
}
