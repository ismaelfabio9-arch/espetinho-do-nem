// Preço certo (Cardápio e estoque → Preço certo, só o dono).
// Conta completa = modelo por contribuição (utils/precificacao.js → resultadoDoMes):
//   - cada produto tem a sua margem: contribuição por unidade = preço − custo − taxas e impostos da venda;
//   - a meta de retirada do dono é conferida no RESULTADO DO MÊS (Σ contribuição × quantidade − despesas);
//   - a quantidade é a previsão do dono (por dia × dias que abre); o que falta é avisado, nada é inventado.
// Só os ingredientes = conta simples: os ingredientes podem pesar no máximo X% do preço.
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deleteField, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { L } from "../../loja";
import { ehCategoriaDeBebida, ehCategoriaDePrato, precosDoCardapio } from "../../utils/montagem";
import { PESO_INGREDIENTES_PADRAO, pesoIngredientes, precoBonito, resultadoDoMes } from "../../utils/precificacao";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R = (v) => (v < 0 ? `− R$ ${fmt(-v)}` : `R$ ${fmt(v)}`);
const fmtPct = (n) => `${String(Math.round(n * 10) / 10).replace(".", ",")}%`;
const qtdTxt = (n) => String(Math.round(n * 100) / 100).replace(".", ",");
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

export default function PrecoCerto({ produtos, custos, daFicha, vendidos30 = {} }) {
  const [salvo, setSalvo] = useState(null); // configuracoes/precificacao
  const [form, setForm] = useState(null);
  const [precos, setPrecos] = useState({}); // preço digitado (simula antes de salvar) { id: texto }
  const [qtds, setQtds] = useState({}); // quantos por dia digitado { id: texto }
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
        meta: t(salvo.meta),
        diasMes: t(salvo.diasMes),
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
  // O que está na tela (ainda sem salvar) vira a configuração usada na conta: tudo recalcula na hora.
  const qtdDia = { ...(salvo.qtdDia || {}) };
  Object.entries(qtds).forEach(([id, txt]) => {
    const n = numDe(txt);
    if (n === null) delete qtdDia[id];
    else qtdDia[id] = n;
  });
  const config = {
    maquininha: numDe(form.maquininha, 100),
    impostos: valorDe("impostos"), impostosModo: modoDe("impostos"),
    variaveis: valorDe("variaveis"), variaveisModo: modoDe("variaveis"),
    fixas: valorDe("fixas"), fixasModo: modoDe("fixas"),
    meta: numDe(form.meta),
    diasMes: numDe(form.diasMes, 32),
    qtdDia,
  };
  const precosNum = {};
  Object.entries(precos).forEach(([id, txt]) => {
    const n = numDe(txt);
    if (n !== null && n > 0) precosNum[id] = n;
  });
  const res = resultadoDoMes({ produtos: ativos, custos, salvo: config, precos: precosNum });
  const soIngredientes = form.conta === "ingredientes";
  const peso = numDe(form.pesoIngredientes, 100) || PESO_INGREDIENTES_PADRAO;

  // As partes em % de cada venda nunca passam de 100%: cada campo aceita no máximo o que sobra.
  const pctDe = (k) => (k === "maquininha" ? config.maquininha || 0 : config[`${k}Modo`] === "pct" ? config[k] || 0 : 0);
  const avisoMax = form._avisoMax || {};
  function mudarCampo(k, txt) {
    const emPct = k === "maquininha" || ((k === "impostos" || k === "variaveis") && form[`${k}Modo`] === "pct");
    const n = emPct ? numDe(txt) : null;
    const max = Math.max(0, Math.floor((99 - (res.pv - pctDe(k))) * 10) / 10);
    if (n !== null && n > max) {
      setForm({ ...form, [k]: String(max).replace(".", ","), _avisoMax: { ...avisoMax, [k]: `Máximo ${fmtPct(max)}: com as outras partes, cada venda já paga ${fmtPct(res.pv - pctDe(k))}.` } });
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
          meta: config.meta,
          diasMes: config.diasMes,
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

  // Quantos por dia: salva sozinho ao sair do campo (vazio = não sabe ainda).
  async function salvarQtd(id) {
    if (!(id in qtds)) return;
    const n = numDe(qtds[id]);
    try {
      await setDoc(doc(db, ...L(), "configuracoes", "precificacao"), { qtdDia: { [id]: n === null ? deleteField() : n } }, { merge: true });
      setQtds((q) => {
        const c = { ...q };
        delete c[id];
        return c;
      });
    } catch {
      setMsgProduto({ ...msgProduto, [id]: "Não foi possível salvar. Confira a internet." });
    }
  }

  async function salvarPreco(x) {
    const n = precosNum[x.id];
    if (!n) return;
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

  const campoPct = (k, nome, dica, { comModo = false, lista = null, padraoValor = false } = {}) => (
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

  // Lista de produtos (por categoria) com o filtro.
  const linhas = res.linhas.filter((l) =>
    filtro === "pouco" ? l.situacao === "pouco" || l.situacao === "prejuizo" : filtro === "faltam" ? l.custo === null || l.porDia === null : true
  );
  const grupos = Object.values(
    linhas.reduce((acc, l) => {
      const nome = String(l.categoria || "").trim() || "Sem categoria";
      (acc[nome] = acc[nome] || { nome, itens: [] }).itens.push(l);
      return acc;
    }, {})
  );
  const porId = Object.fromEntries(ativos.map((x) => [x.id, x]));
  const nPouco = res.linhas.filter((l) => l.situacao === "pouco" || l.situacao === "prejuizo").length;
  const nFaltam = res.linhas.filter((l) => l.custo === null || l.porDia === null).length;
  const lista = (nomes, n = 6) => `${nomes.slice(0, n).join(", ")}${nomes.length > n ? ` e mais ${nomes.length - n}` : ""}`;

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
            <small>Custos, taxas, despesas e a sua meta do mês.</small>
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
            <h3 className="pc-sec">O que sai de cada venda</h3>
            <p className="fin-explica">Junto com cada venda, em % do preço. O que ficar em branco conta como 0.</p>
            <div className="pc-campos">
              {campoPct("maquininha", "Taxa da maquininha", "% que a maquininha cobra em cada venda")}
              {campoPct("impostos", "Impostos", "Simples Nacional: em % de cada venda · MEI: o boleto do mês (DAS) em R$", { comModo: true })}
              {campoPct("variaveis", "Despesas variáveis", "embalagem, entregador, aplicativo…: em % de cada venda ou o total do mês em R$", { comModo: true, lista: LISTAS.variaveis })}
            </div>
            <h3 className="pc-sec">Despesas do mês</h3>
            <p className="fin-explica">Descontadas uma vez só, no resultado do mês (não entram no preço de cada produto).</p>
            <div className="pc-campos">{campoPct("fixas", "Despesas fixas", "aluguel, funcionários, luz, água, contador…", { comModo: true, lista: LISTAS.fixas, padraoValor: true })}</div>
            <h3 className="pc-sec">Sua meta</h3>
            <div className="pc-campos">
              <label className="pc-campo">
                <span>
                  Quanto quero tirar para mim por mês
                  <small>O que sobra para o dono depois de pagar os produtos, as taxas, os impostos e as despesas.</small>
                </span>
                <span className="pc-input">
                  <input inputMode="decimal" placeholder="0,00" aria-label="Quanto quero tirar para mim por mês (R$)" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} />
                  <em>por mês</em>
                </span>
              </label>
              <label className="pc-campo">
                <span>
                  Dias que a loja abre no mês
                  <small>Para virar a previsão de cada produto (por dia) no total do mês.</small>
                </span>
                <span className="pc-input">
                  <input inputMode="numeric" placeholder="0" aria-label="Dias que a loja abre no mês" value={form.diasMes} onChange={(e) => setForm({ ...form, diasMes: e.target.value })} />
                  <em>dias</em>
                </span>
              </label>
            </div>
          </>
        )}
        <button type="button" className="btn-verde pc-salvar" onClick={salvar}>Salvar</button>
        {msg && <p className="fin-ok-msg">{msg}</p>}
      </div>

      {!soIngredientes && (
        <div className="relatorio-documento">
          <h2>Resultado do mês (previsão)</h2>
          <p className="fin-explica">Com o preço, o custo e a previsão de venda de cada produto. O resultado de verdade, com as vendas fechadas, fica em Dinheiro → Lucro e caixa.</p>
          {!res.completo && (
            <div className="fin-aviso pc-faltam" role="status">
              <b>Faltam dados para fechar a conta:</b>
              <ul>
                {res.faltando.semDias && <li>Os dias que a loja abre no mês (acima).</li>}
                {res.faltando.semQtd.length > 0 && <li>Quantos vende por dia ({res.faltando.semQtd.length}): {lista(res.faltando.semQtd)}. Se não vende, ponha 0.</li>}
                {res.faltando.semCusto.length > 0 && <li>Custo (ingredientes) ({res.faltando.semCusto.length}): {lista(res.faltando.semCusto)}.</li>}
                {res.faltando.semPreco.length > 0 && <li>Preço: {lista(res.faltando.semPreco)}.</li>}
              </ul>
              <small>Enquanto faltar, os números abaixo contam só os produtos completos.</small>
            </div>
          )}
          <div className="fin-conta">
            <Linha nome="Faturamento previsto" valor={res.faturamento} detalhe="Preço × quantidade de cada produto" />
            <Linha nome="Custo dos produtos" valor={-res.custoProdutos} detalhe="Ingredientes × quantidade" />
            <Linha nome="Taxas e impostos das vendas" valor={-res.taxas} detalhe={res.pv > 0 ? `${fmtPct(res.pv)} de cada venda` : null} />
            <Linha nome="Margem de contribuição" valor={res.mc} sub detalhe={res.margemMc !== null ? `${fmtPct(res.margemMc)} do faturamento` : null} />
            <Linha nome="Despesas do mês" valor={-res.despesas.total} detalhe={[res.despesas.fixas ? `fixas ${R(res.despesas.fixas)}` : "", res.despesas.variaveis ? `variáveis ${R(res.despesas.variaveis)}` : "", res.despesas.impostos ? `impostos ${R(res.despesas.impostos)}` : ""].filter(Boolean).join(" · ") || null} />
            <Linha nome="Resultado líquido estimado" valor={res.resultado} total />
          </div>
          {res.meta > 0 && (
            <p className={`pc-resumo ${res.falta > 0 ? "ruim" : ""}`}>
              Meta de retirada: {R(res.meta)} por mês ·{" "}
              {res.falta > 0 ? `faltam ${R(res.falta)} para chegar na meta.` : `passa da meta em ${R(-res.falta)}.`}
              {res.falta > 0 && res.margemNecessaria !== null && ` Para chegar, a margem de contribuição da loja precisa ficar em ${fmtPct(res.margemNecessaria)} na média (hoje ${fmtPct(res.margemMc ?? 0)}): suba o preço dos que contribuem pouco ou venda mais deles.`}
            </p>
          )}
          {!res.meta && <p className="fin-explica">Ponha a sua meta (acima) para o sistema dizer quanto falta.</p>}
        </div>
      )}

      <div className="relatorio-documento">
        <h2>Preço de cada produto</h2>
        <p className="fin-explica">
          {soIngredientes
            ? `Preço bom = os ingredientes serem no máximo ${fmtPct(peso)} do preço.`
            : "Cada produto tem a sua margem. Digite o preço e quantos vende por dia: o resultado do mês acima recalcula na hora. O custo vem dos ingredientes de cada produto."}
        </p>
        {!soIngredientes && (
          <div className="fin-periodos" role="group" aria-label="Filtrar produtos">
            {[
              { id: "todos", nome: `Todos (${res.linhas.length})` },
              { id: "pouco", nome: `Contribuem pouco (${nPouco})` },
              { id: "faltam", nome: `Faltam dados (${nFaltam})` },
            ].map((f) => (
              <button key={f.id} type="button" className={filtro === f.id ? "ativo" : ""} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
                {f.nome}
              </button>
            ))}
          </div>
        )}
        <ul className="pc-lista">
          {grupos.map((g) => (
            <Fragment key={g.nome}>
              <li className="pc-grupo">
                <h3>{g.nome}</h3>
                <small>{g.itens.length} {g.itens.length === 1 ? "produto" : "produtos"}</small>
              </li>
              {g.itens.map((l) => {
                const x = porId[l.id];
                const opcoes = precosDoCardapio(x);
                const precoTxt = precos[l.id] ?? fmt(Number(x.preco || 0));
                const mudouPreco = precosNum[l.id] !== undefined && Math.abs(precosNum[l.id] - Number(x.preco || 0)) > 0.004;
                const minIng = typeof l.custo === "number" ? precoBonito(l.custo / (peso / 100)) : null;
                const real = vendidos30[l.id];
                const chip = soIngredientes
                  ? l.custo === null
                    ? <b className="pc-chip baixo">Sem custo</b>
                    : l.preco >= minIng - 0.004
                    ? <b className="pc-chip bom">✓ Preço bom</b>
                    : <b className="pc-chip baixo">Abaixo</b>
                  : {
                      "sem-custo": <b className="pc-chip baixo">Sem custo</b>,
                      "sem-preco": <b className="pc-chip baixo">Sem preço</b>,
                      prejuizo: <b className="pc-chip ruim">Prejuízo</b>,
                      pouco: <b className="pc-chip baixo">Contribui pouco</b>,
                      ok: <b className="pc-chip bom">✓ Contribui bem</b>,
                    }[l.situacao];
                const sugerido = soIngredientes ? minIng : l.recomendado;
                return (
                  <li key={l.id} className={`pc-item pc-prod ${l.situacao}`}>
                    <div className="pc-linha pc-linha-fixa">
                      <span className="pc-nome">
                        <strong>{l.nome}</strong>
                        <small>
                          {l.custo !== null ? `Custo ${R(l.custo)}${typeof daFicha?.[l.id] === "number" ? " (ingredientes)" : ""}` : <>Sem custo: <Link to={`/cardapio?aba=produtos&editar=${encodeURIComponent(l.id)}`}>pôr os ingredientes</Link></>}
                        </small>
                        {l.contrib !== null && (
                          <small>
                            {soIngredientes ? (
                              <>Ingredientes = <b>{fmtPct((l.custo / l.preco) * 100)}</b> do preço · sobra <b>{R(l.preco - l.custo)}</b></>
                            ) : (
                              <>
                                Lucro por unidade: <b className={l.contrib < 0 ? "fin-neg" : "pc-verde"}>{R(l.contrib)}</b> · margem real {fmtPct(l.margem)}
                                {l.contribMes !== null && <> · no mês <b>{R(l.contribMes)}</b></>}
                              </>
                            )}
                          </small>
                        )}
                      </span>
                      <span className="pc-status">{chip}</span>
                    </div>
                    <div className="pc-preco">
                      {opcoes ? (
                        <small>Preço por opção ({opcoes.map((o) => o.nome).join(", ")}): a conta usa o preço base {R(Number(x.preco || 0))}. Mude em Produtos → editar.</small>
                      ) : (
                        <span className="pc-input">
                          Preço R$
                          <input inputMode="decimal" aria-label={`Preço de ${l.nome}`} value={precoTxt} onChange={(e) => setPrecos({ ...precos, [l.id]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && salvarPreco(x)} />
                        </span>
                      )}
                      {!soIngredientes && (
                        <span className="pc-input">
                          Vende
                          <input inputMode="decimal" placeholder="?" aria-label={`Quantos ${l.nome} vende por dia`} value={qtds[l.id] ?? (l.porDia !== null ? qtdTxt(l.porDia) : "")} onChange={(e) => setQtds({ ...qtds, [l.id]: e.target.value })} onBlur={() => salvarQtd(l.id)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
                          por dia
                        </span>
                      )}
                      {!opcoes && sugerido !== null && l.preco < sugerido - 0.004 && (soIngredientes || l.situacao === "pouco") && (
                        <button type="button" className="ins-btn" onClick={() => setPrecos({ ...precos, [l.id]: fmt(sugerido) })}>
                          {soIngredientes ? "Usar o mínimo" : "Usar o recomendado"} ({R(sugerido)})
                        </button>
                      )}
                      {mudouPreco && <button type="button" className="btn-verde" onClick={() => salvarPreco(x)}>Salvar preço</button>}
                      {!soIngredientes && typeof real === "number" && real > 0 && <small>Vendido de verdade nos últimos 30 dias: {qtdTxt(real)}</small>}
                      {!soIngredientes && l.recomendado !== null && l.situacao === "pouco" && <small>Recomendado {R(l.recomendado)}: leva a margem deste produto até a que a loja precisa ({fmtPct(res.margemNecessaria)}). É uma sugestão; o preço é você quem decide.</small>}
                      {mudouPreco && !soIngredientes && <small>Com esse preço o resultado do mês fica em {R(res.resultado)} (ainda não salvo).</small>}
                      {msgProduto[l.id] && <small>{msgProduto[l.id]}</small>}
                    </div>
                  </li>
                );
              })}
            </Fragment>
          ))}
        </ul>
        {res.linhas.some((l) => l.custo === null) && (
          <p className="fin-explica">O custo de cada produto sai dos ingredientes dele (Produtos → editar) e do preço de cada ingrediente (aba <Link to="/cardapio?aba=ingredientes">Ingredientes</Link>).</p>
        )}
      </div>
    </>
  );
}

function Linha({ nome, valor, detalhe, total, sub }) {
  return (
    <div className={`fin-linha${total ? " fin-total" : sub ? " fin-sub" : ""}`}>
      <div>
        <span>{nome}</span>
        {detalhe && <small>{detalhe}</small>}
      </div>
      <strong className={valor < 0 ? "fin-neg" : total ? "fin-pos" : ""}>{R(valor)}</strong>
    </div>
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

