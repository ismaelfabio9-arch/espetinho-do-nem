import { L } from "../../loja";
import useNomeLoja from "../../hooks/useNomeLoja";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useTaxas } from "../../utils/taxas";
import { moeda } from "../../utils/tipoVenda";
import { GRUPOS, SEM_CATEGORIA_FIN, TIPOS, calcularFinancas, grupoDe, isoDia, juntarVendas, lerValor, periodo, tipoDe } from "../../utils/financas";
import { custoDaFicha, perdasNoPeriodo } from "../../utils/insumos";
import { percentuaisDaLoja, precoDoProduto, somaPct } from "../../utils/precificacao";
import "../../styles/Garcom/RelatorioGerencial.css";
import "../../styles/Garcom/Financas.css";
import "../../styles/Garcom/Insumos.css";

const PERIODOS = [
  { id: "hoje", nome: "Hoje" },
  { id: "7dias", nome: "7 dias" },
  { id: "mes", nome: "Este mês" },
  { id: "mesPassado", nome: "Mês passado" },
  { id: "ano", nome: "Este ano" },
];
const br = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R = (v) => (v < 0 ? `− R$ ${fmt(-v)}` : `R$ ${fmt(v)}`);
const ABAS = [
  { id: "resumo", nome: "Lucro e caixa" },
  { id: "lancamentos", nome: "Lançamentos" },
  { id: "custos", nome: "Custos dos produtos" },
  { id: "preco", nome: "Preço certo" },
];

function useMovsInsumos() {
  const [lista, setLista] = useState(null);
  useEffect(() => onSnapshot(query(collection(db, ...L(), "insumosMov"), orderBy("em", "desc"), limit(3000)), (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLista([])), []);
  return lista;
}

function useColecao(nome) {
  const [lista, setLista] = useState(null);
  useEffect(
    () =>
      onSnapshot(
        collection(db, ...L(), nome),
        (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => setLista([])
      ),
    [nome]
  );
  return lista;
}

function Financas() {
  const nomeLoja = useNomeLoja();
  const taxas = useTaxas();
  const dias = useColecao("relatorioGerencial");
  const hoje = useColecao("vendasDia");
  const produtos = useColecao("produtos");
  const custosDocs = useColecao("custos");
  const lancamentos = useColecao("despesas");
  const fichas = useColecao("fichas");
  const insumos = useColecao("insumos");
  const movs = useMovsInsumos();
  const [aba, setAba] = useState("resumo");
  const [per, setPer] = useState("mes");
  const [faixa, setFaixa] = useState(() => periodo("mes"));

  // Custo de cada produto: o da ficha técnica (matéria-prima) quando tem; senão, o digitado.
  const { custos, daFicha } = useMemo(() => {
    const m = {};
    (custosDocs || []).forEach((c) => {
      if (typeof c.custo === "number") m[c.id] = c.custo;
    });
    const porId = Object.fromEntries((insumos || []).map((i) => [i.id, i]));
    const f = {};
    (fichas || []).forEach((fi) => {
      const c = custoDaFicha(fi, porId);
      if (c !== null) f[fi.id] = c;
    });
    return { custos: { ...m, ...f }, daFicha: f };
  }, [custosDocs, fichas, insumos]);
  const carregando = dias === null || hoje === null || produtos === null || custosDocs === null || lancamentos === null || fichas === null || insumos === null || movs === null;
  // Últimos 30 dias: base dos percentuais do Preço certo (quanto de cada venda vai para taxas e despesas).
  const f30 = useMemo(() => {
    if (carregando) return null;
    const hojeD = new Date();
    const de = isoDia(new Date(hojeD.getFullYear(), hojeD.getMonth(), hojeD.getDate() - 29));
    return calcularFinancas({ vendas: juntarVendas(dias, hoje), produtos, custos, lancamentos, taxas, de, ate: isoDia(hojeD) });
  }, [carregando, dias, hoje, produtos, custos, lancamentos, taxas]);
  const f = useMemo(
    () => (carregando ? null : calcularFinancas({ vendas: juntarVendas(dias, hoje), produtos, custos, lancamentos, taxas, de: faixa.de, ate: faixa.ate, perdas: perdasNoPeriodo(movs, faixa.de, faixa.ate).total })),
    [carregando, dias, hoje, produtos, custos, lancamentos, taxas, faixa, movs]
  );
  const categorias = useMemo(() => [...new Set((produtos || []).map((p) => String(p.categoria || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [produtos]);

  function escolher(id) {
    setPer(id);
    setFaixa(periodo(id));
  }

  return (
    <div className="container relatorio-page fin-page">
      <div className="no-print">
        <Link to="/config" className="voltar">← Voltar</Link>
        <div className="relatorio-filtros">
          <h1>Finanças</h1>
          <p>O lucro do que a loja vende e o dinheiro que entrou e saiu, no geral e por categoria do cardápio.</p>
          <div className="fin-abas ins-abas" role="tablist">
            {ABAS.map((a) => (
              <button key={a.id} role="tab" aria-selected={aba === a.id} className={aba === a.id ? "ativa" : ""} onClick={() => setAba(a.id)}>
                {a.nome}
              </button>
            ))}
          </div>
          {aba !== "custos" && aba !== "preco" && (
            <>
              <div className="fin-periodos">
                {PERIODOS.map((p) => (
                  <button key={p.id} className={per === p.id ? "ativo" : ""} onClick={() => escolher(p.id)}>
                    {p.nome}
                  </button>
                ))}
              </div>
              <div className="relatorio-filtro-linha">
                <div>
                  <label htmlFor="fin-de">De</label>
                  <input id="fin-de" type="date" value={faixa.de} onChange={(e) => { setPer(""); setFaixa({ ...faixa, de: e.target.value }); }} />
                </div>
                <div>
                  <label htmlFor="fin-ate">Até</label>
                  <input id="fin-ate" type="date" value={faixa.ate} onChange={(e) => { setPer(""); setFaixa({ ...faixa, ate: e.target.value }); }} />
                </div>
              </div>
            </>
          )}
          {aba === "resumo" && (
            <button className="btn-verde" onClick={() => window.print()}>Exportar PDF</button>
          )}
        </div>
      </div>

      {carregando ? (
        <p className="fin-carregando">Carregando…</p>
      ) : aba === "lancamentos" ? (
        <Lancamentos f={f} categorias={categorias} />
      ) : aba === "custos" ? (
        <Custos produtos={produtos} custos={custos} daFicha={daFicha} />
      ) : aba === "preco" ? (
        <PrecoCerto produtos={produtos} custos={custos} daFicha={daFicha} f30={f30} taxas={taxas} irCustos={() => setAba("custos")} />
      ) : (
        <Resumo f={f} nomeLoja={nomeLoja} faixa={faixa} irCustos={() => setAba("custos")} />
      )}
    </div>
  );
}

function Resumo({ f, nomeLoja, faixa, irCustos }) {
  const temCompraPorCategoria = f.categorias.some((c) => c.comprou > 0);
  return (
    <div className="relatorio-documento">
      <div className="relatorio-cabecalho">
        <div>
          <span>Finanças</span>
          <h1>{nomeLoja}</h1>
          <p>Lucro e caixa do período</p>
        </div>
        <div className="relatorio-emissao">
          <strong>Período</strong>
          <span>{br(faixa.de)} a {br(faixa.ate)}</span>
        </div>
      </div>

      {f.semCusto > 0 && (
        <button type="button" className="fin-aviso no-print" onClick={irCustos}>
          ⚠️ {f.semCusto === 1 ? "1 produto vendido está" : `${f.semCusto} produtos vendidos estão`} sem custo cadastrado ({R(f.vendidoSemCusto)} em vendas): sem o custo, o lucro aparece maior do que é. <u>Cadastrar custos</u>
        </button>
      )}

      <div className="relatorio-secao">
        <h2>Lucro</h2>
        <p className="fin-explica">O que a loja ganhou vendendo. Compras de mercadoria, investimentos e retiradas do dono não entram aqui.</p>
        <div className="fin-conta">
          <Linha nome="Vendas" valor={f.vendas} detalhe={`${f.pedidos} ${f.pedidos === 1 ? "pedido" : "pedidos"} · ticket médio ${R(f.ticket)}${f.taxaEntrega > 0 ? ` · ${R(f.taxaEntrega)} de taxa de entrega` : ""}`} />
          <Linha nome="Taxas da maquininha" valor={-f.maquininha} detalhe={f.taxaCartaoCliente > 0 ? `${R(f.taxaCartaoCliente)} o cliente pagou junto` : null} />
          <Linha nome="Custo dos produtos vendidos" valor={-f.custoProdutos} detalhe="Custo de cada produto × quantidade vendida" />
          <Linha nome="Lucro bruto" valor={f.lucroBruto} sub detalhe={f.margemBruta === null ? null : `${f.margemBruta}% das vendas`} />
          <Linha nome="Despesas variáveis" valor={-f.variaveis} detalhe="Entregador, divulgação, consertos, outras" />
          <Linha nome="Despesas fixas" valor={-f.fixas} detalhe="Aluguel, funcionários, contas, contador" />
          {f.perdas > 0 && <Linha nome="Perdas de mercadoria" valor={-f.perdas} detalhe="Estragou, venceu ou faltou na contagem (Matéria-prima)" />}
          <Linha nome="Lucro líquido" valor={f.lucro} total detalhe={f.margem === null ? null : `${f.margem}% das vendas`} />
        </div>
        {f.equilibrio !== null && (
          <p className={`fin-equilibrio ${f.vendas >= f.equilibrio ? "ok" : ""}`}>
            <strong>Ponto de equilíbrio:</strong> para pagar as despesas fixas deste período, a loja precisa vender {R(f.equilibrio)}.{" "}
            {f.vendas >= f.equilibrio ? `Vendeu ${R(f.vendas)}: passou ${R(f.vendas - f.equilibrio)}.` : `Vendeu ${R(f.vendas)}: faltam ${R(f.equilibrio - f.vendas)}.`}
          </p>
        )}
      </div>

      <div className="relatorio-secao">
        <h2>Caixa</h2>
        <p className="fin-explica">O dinheiro que entrou e saiu de verdade no período.</p>
        <div className="fin-conta">
          <Linha nome="Vendas recebidas" valor={f.receitaLiquida} detalhe="Vendas sem a taxa da maquininha" />
          {f.entradasExtras > 0 && <Linha nome="Outras entradas" valor={f.entradasExtras} detalhe="Dinheiro colocado pelo dono e outras" />}
          <Linha nome="Compras de mercadoria" valor={-f.compras} detalhe="Comida, bebidas e embalagens" />
          <Linha nome="Despesas (variáveis e fixas)" valor={-(f.variaveis + f.fixas)} />
          {f.investimentos > 0 && <Linha nome="Investimentos" valor={-f.investimentos} detalhe="Equipamentos e reforma" />}
          {f.retiradas > 0 && <Linha nome="Retirada do dono" valor={-f.retiradas} />}
          <Linha nome="Saldo do período" valor={f.saldoCaixa} total />
        </div>
      </div>

      <div className="relatorio-secao">
        <h2>Lucro por categoria</h2>
        {f.categorias.length === 0 ? (
          <p>Nenhuma venda no período.</p>
        ) : (
          <div className="relatorio-tabela-wrapper">
            <table className="relatorio-tabela relatorio-tabela-numeros">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Vendido</th>
                  <th>% das vendas</th>
                  <th>Custo</th>
                  <th>Maquininha</th>
                  <th>Lucro bruto</th>
                  <th>Margem</th>
                  {temCompraPorCategoria && <th>Comprou</th>}
                </tr>
              </thead>
              <tbody>
                {f.categorias.map((c) => (
                  <tr key={c.nome}>
                    <td>{c.nome}{c.semCusto > 0 && <small className="fin-sem"> · {c.semCusto} sem custo</small>}</td>
                    <td>{R(c.vendido)}</td>
                    <td>{c.participacao === null ? "–" : `${c.participacao}%`}</td>
                    <td>{R(c.custo)}</td>
                    <td>{R(c.taxas)}</td>
                    <td className={c.lucro < 0 ? "fin-neg" : ""}>{R(c.lucro)}</td>
                    <td>{c.margem === null ? "–" : `${c.margem}%`}</td>
                    {temCompraPorCategoria && <td>{c.comprou ? R(c.comprou) : "–"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="relatorio-nota">
          Lucro bruto da categoria = vendido − custo dos produtos − a parte dela na maquininha. As despesas da loja (aluguel, funcionários…) são
          de tudo e entram só no lucro líquido.{temCompraPorCategoria ? " \"Comprou\" é o que foi comprado de mercadoria para a categoria no período (não entra no lucro)." : ""}
        </p>
      </div>

      {(f.porGrupo.length > 0 || f.formas.length > 0) && (
        <div className="fin-duas">
          {f.porGrupo.length > 0 && (
            <div className="relatorio-secao">
              <h2>Lançamentos por tipo</h2>
              {f.porGrupo.map((gr) => (
                <div key={gr.id} className="fin-grupo">
                  <div className="fin-grupo-topo"><span>{gr.nome}</span><strong>{R(gr.valor)}</strong></div>
                  <ul className="fin-lista">
                    {gr.tipos.map((t) => (
                      <li key={t.id}><span>{t.icone} {t.nome}</span><span>{R(t.valor)}</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {f.formas.length > 0 && (
            <div className="relatorio-secao">
              <h2>Vendas por pagamento</h2>
              <ul className="fin-lista">
                {f.formas.map((x) => (
                  <li key={x.nome}><span>{x.nome}</span><strong>{R(x.valor)}</strong></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="relatorio-secao">
        <h2>Lucro por produto</h2>
        {f.produtos.length === 0 ? (
          <p>Nenhum produto vendido no período.</p>
        ) : (
          <div className="relatorio-tabela-wrapper">
            <table className="relatorio-tabela relatorio-tabela-numeros">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Qtd</th>
                  <th>Vendido</th>
                  <th>% das vendas</th>
                  <th>Custo un.</th>
                  <th>Lucro</th>
                  <th>Margem</th>
                </tr>
              </thead>
              <tbody>
                {f.produtos.map((p) => (
                  <tr key={p.nome}>
                    <td>{p.nome}</td>
                    <td>{p.categoria}</td>
                    <td>{p.qtd}</td>
                    <td>{R(p.vendido)}</td>
                    <td>{p.participacao === null ? "–" : `${p.participacao}%`}</td>
                    <td>{p.custoUn === null ? <span className="fin-sem">sem custo</span> : R(p.custoUn)}</td>
                    <td className={p.lucro < 0 ? "fin-neg" : ""}>{p.lucro === null ? "–" : R(p.lucro)}</td>
                    <td>{p.margem === null ? "–" : `${p.margem}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="relatorio-nota">Lucro do produto = vendido − custo. A taxa da maquininha entra no lucro da categoria.</p>
      </div>
      <div className="relatorio-rodape">
        <p>Emitido em {new Date().toLocaleString("pt-BR")}{nomeLoja ? ` · ${nomeLoja}` : ""}</p>
      </div>
    </div>
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

function Lancamentos({ f, categorias }) {
  const vazio = { data: isoDia(), tipo: "insumos", valor: "", descricao: "", categoria: "" };
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagar, setApagar] = useState(null);
  const tipo = tipoDe(form.tipo);
  const grupo = grupoDe(form.tipo);

  async function salvar(e) {
    e.preventDefault();
    const valor = lerValor(form.valor);
    if (!valor) return setErro("Informe o valor.");
    if (!form.data) return setErro("Informe a data.");
    setSalvando(true);
    setErro("");
    try {
      await addDoc(collection(db, ...L(), "despesas"), {
        data: form.data,
        tipo: form.tipo,
        grupo: tipo.grupo,
        valor,
        descricao: form.descricao.trim().slice(0, 120),
        categoria: tipo.categoria ? form.categoria : "",
        criadoEm: serverTimestamp(),
      });
      setForm({ ...vazio, data: form.data, tipo: form.tipo, categoria: form.categoria });
    } catch {
      setErro("Não foi possível salvar. Confira a internet e tente de novo.");
    }
    setSalvando(false);
  }

  return (
    <>
      <form className="relatorio-documento fin-form no-print" onSubmit={salvar}>
        <h2>Novo lançamento</h2>
        {GRUPOS.map((gr) => (
          <fieldset key={gr.id} className="fin-grupo-tipos">
            <legend>{gr.saida ? "Saída · " : "Entrada · "}{gr.nome}</legend>
            <div className="fin-tipos">
              {TIPOS.filter((t) => t.grupo === gr.id).map((t) => (
                <button type="button" key={t.id} aria-pressed={form.tipo === t.id} className={form.tipo === t.id ? (gr.saida ? "ativo" : "ativo entrada") : ""} onClick={() => setForm({ ...form, tipo: t.id })}>
                  {t.icone} {t.nome}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <p className="fin-dica"><strong>{tipo.icone} {tipo.nome}:</strong> {grupo.dica}</p>
        <div className="fin-campos">
          <label>
            Valor (R$)
            <input inputMode="decimal" placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
          </label>
          <label>
            Data
            <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
          </label>
          <label className="fin-largo">
            Descrição (opcional)
            <input placeholder={tipo.grupo === "compra" ? "Ex.: carne e frango no atacado" : "Ex.: conta de luz de outubro"} maxLength={120} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </label>
          {tipo.categoria && categorias.length > 0 && (
            <label className="fin-largo">
              Para qual categoria do cardápio? (opcional)
              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                <option value="">Para tudo / várias</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {erro && <p className="fin-erro">{erro}</p>}
        <button className="btn-verde" disabled={salvando}>{salvando ? "Salvando…" : grupo.saida ? "Salvar saída" : "Salvar entrada"}</button>
      </form>

      <div className="relatorio-documento">
        <h2>Lançamentos do período</h2>
        <p className="fin-totais">Saiu {R(f.saiuCaixa)} · entrou fora as vendas {R(f.entradasExtras)}</p>
        {f.lancamentos.length === 0 ? (
          <p>Nenhum lançamento no período.</p>
        ) : (
          <ul className="fin-despesas">
            {f.lancamentos.map((d) => {
              const t = tipoDe(d.tipo);
              const gr = grupoDe(d.tipo);
              return (
                <li key={d.id}>
                  <div>
                    <strong>{d.descricao || t.nome}</strong>
                    <small>
                      {br(d.data)} · {gr.nome} · {t.nome}
                      {d.categoria ? ` · ${d.categoria}` : ""}
                    </small>
                  </div>
                  <span className={`fin-valor ${gr.saida ? "" : "fin-pos"}`}>{gr.saida ? "−" : "+"} {R(d.valor)}</span>
                  {apagar === d.id ? (
                    <span className="fin-confirma">
                      <button type="button" className="fin-btn-perigo" onClick={() => deleteDoc(doc(db, ...L(), "despesas", d.id)).finally(() => setApagar(null))}>Apagar</button>
                      <button type="button" onClick={() => setApagar(null)}>Não</button>
                    </span>
                  ) : (
                    <button type="button" className="fin-btn-x" aria-label={`Apagar ${d.descricao || t.nome}`} onClick={() => setApagar(d.id)}>✕</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function Custos({ produtos, custos, daFicha }) {
  const [texto, setTexto] = useState({});
  const [salvo, setSalvo] = useState({});
  const grupos = useMemo(() => {
    const g = {};
    (produtos || [])
      .filter((p) => p.nome)
      .forEach((p) => {
        const c = String(p.categoria || "").trim() || SEM_CATEGORIA_FIN;
        (g[c] = g[c] || []).push(p);
      });
    return Object.entries(g)
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([c, l]) => [c, l.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"))]);
  }, [produtos]);

  async function gravar(p) {
    const t = texto[p.id];
    if (t === undefined) return;
    const vazio = String(t).trim() === "";
    const custo = lerValor(t);
    if (!vazio && custo === custos[p.id]) return;
    await setDoc(doc(db, ...L(), "custos", p.id), { custo: vazio ? null : custo, nome: p.nome, atualizadoEm: new Date().toISOString() }, { merge: true });
    setSalvo((s) => ({ ...s, [p.id]: true }));
    setTimeout(() => setSalvo((s) => ({ ...s, [p.id]: false })), 1500);
  }

  return (
    <div className="relatorio-documento">
      <h2>Custo de cada produto</h2>
      <p className="relatorio-nota">
        Quanto você gasta para fazer ou comprar uma unidade (ingredientes, embalagem, a bebida no fornecedor). Só a sua equipe vê: o
        cardápio do cliente não mostra. Com o custo, o sistema calcula o lucro de cada venda. Produto com ficha técnica em Matéria-prima
        tem o custo calculado sozinho pelo preço dos insumos.
      </p>
      {grupos.length === 0 && <p>Nenhum produto cadastrado ainda.</p>}
      {grupos.map(([cat, lista]) => (
        <div key={cat} className="fin-custos-grupo">
          <h3>{cat}</h3>
          {lista.map((p) => {
            const custo = custos[p.id];
            const valor = texto[p.id] ?? (typeof custo === "number" ? moeda(custo) : "");
            const preco = Number(p.preco || 0);
            const c = lerValor(valor);
            const margem = preco > 0 && valor !== "" ? Math.round(((preco - c) / preco) * 100) : null;
            return (
              <div key={p.id} className="fin-custo">
                <div>
                  <strong>{p.nome}</strong>
                  <small>
                    Vende por {R(preco)}
                    {margem !== null ? ` · lucro ${R(preco - c)} (${margem}%)` : ""}
                  </small>
                </div>
                {typeof daFicha?.[p.id] === "number" ? (
                  <span className="fin-ficha">{R(daFicha[p.id])} <small>pela ficha técnica</small></span>
                ) : (
                <label>
                  <span>Custo R$</span>
                  <input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={valor}
                    aria-label={`Custo de ${p.nome}`}
                    onChange={(e) => setTexto((t) => ({ ...t, [p.id]: e.target.value }))}
                    onBlur={() => gravar(p)}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </label>
                )}
                <span className="fin-ok" aria-live="polite">{salvo[p.id] ? "✓ salvo" : ""}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default Financas;

/** Preço certo: por quanto vender cada produto para pagar tudo e sobrar o lucro que o dono quer. */
function PrecoCerto({ produtos, custos, daFicha, f30, taxas, irCustos }) {
  const auto = percentuaisDaLoja(f30, taxas);
  const [salvo, setSalvo] = useState(null); // configuracoes/precificacao
  const [form, setForm] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [soAbaixo, setSoAbaixo] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(
    () =>
      onSnapshot(
        doc(db, ...L(), "configuracoes", "precificacao"),
        (s2) => setSalvo(s2.data() || {}),
        () => setSalvo({})
      ),
    []
  );
  useEffect(() => {
    if (salvo && !form) {
      const t = (v) => (typeof v === "number" ? String(v).replace(".", ",") : "");
      setForm({ maquininha: t(salvo.maquininha), fixas: t(salvo.fixas), variaveis: t(salvo.variaveis), impostos: t(salvo.impostos ?? 0), lucro: t(salvo.lucro ?? 15) });
    }
  }, [salvo, form]);
  if (!form) return <p className="fin-carregando">Carregando…</p>;

  const pctDe = (v) => {
    const n = Number(String(v ?? "").replace(",", "."));
    return String(v ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 && n < 100 ? n : null;
  };
  // Em branco = automático (pelo movimento da loja).
  const p = {
    maquininha: pctDe(form.maquininha) ?? auto.maquininha ?? 0,
    fixas: pctDe(form.fixas) ?? auto.fixas ?? 0,
    variaveis: pctDe(form.variaveis) ?? auto.variaveis ?? 0,
    impostos: pctDe(form.impostos) ?? 0,
    lucro: pctDe(form.lucro) ?? 0,
  };
  const total = somaPct(p);
  const fmtPct = (n) => `${String(Math.round(n * 10) / 10).replace(".", ",")}%`;

  async function salvar() {
    const v = (k) => pctDe(form[k]);
    try {
      await setDoc(doc(db, ...L(), "configuracoes", "precificacao"), { maquininha: v("maquininha"), fixas: v("fixas"), variaveis: v("variaveis"), impostos: v("impostos") ?? 0, lucro: v("lucro") ?? 0, atualizadoEm: new Date().toISOString() });
      setMsg("✓ Salvo");
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
    setTimeout(() => setMsg(""), 2000);
  }

  const campos = [
    { k: "maquininha", nome: "Taxa da maquininha", dica: auto.vendas > 0 ? `automático: ${fmtPct(auto.maquininha)} (o que a maquininha levou nos últimos 30 dias)` : `automático: ${fmtPct(auto.maquininha)} (taxa do crédito)` },
    { k: "fixas", nome: "Despesas fixas", dica: auto.fixas !== null ? `automático: ${fmtPct(auto.fixas)} (aluguel, funcionários, contas ÷ vendas dos últimos 30 dias)` : "sem vendas nos últimos 30 dias: digite quanto acha (ex.: 20)" },
    { k: "variaveis", nome: "Despesas variáveis", dica: auto.variaveis !== null ? `automático: ${fmtPct(auto.variaveis)} (entregador, divulgação… ÷ vendas)` : "sem vendas nos últimos 30 dias: digite (ex.: 5)" },
    { k: "impostos", nome: "Impostos", dica: "MEI paga valor fixo (deixe 0); Simples Nacional costuma ser de 4% a 6%" },
    { k: "lucro", nome: "Lucro que você quer", dica: "o que sobra limpo em cada venda (restaurante costuma ficar entre 10% e 20%)" },
  ];

  const linhas = (produtos || [])
    .filter((x) => x.nome && x.ativo !== false)
    .map((x) => ({ produto: x, custo: custos[x.id], ficha: typeof daFicha?.[x.id] === "number", r: precoDoProduto(custos[x.id], x.preco, p) }))
    .sort((a, b) => String(a.produto.categoria || "").localeCompare(String(b.produto.categoria || ""), "pt-BR") || String(a.produto.nome).localeCompare(String(b.produto.nome), "pt-BR"));
  const abaixo = linhas.filter((l) => l.r.situacao === "baixo").length;
  const semCusto = linhas.filter((l) => l.r.situacao === "sem-custo").length;
  const mostrar = soAbaixo ? linhas.filter((l) => l.r.situacao === "baixo") : linhas;

  return (
    <>
      <div className="relatorio-documento">
        <h2>Quanto sai de cada venda</h2>
        <p className="fin-explica">Além do custo do produto, cada venda paga a maquininha, uma parte das despesas da loja e os impostos. Deixe em branco para o sistema calcular pelo movimento da loja.</p>
        <div className="pc-campos">
          {campos.map((c) => (
            <label key={c.k} className="pc-campo">
              <span>
                {c.nome}
                <small>{c.dica}</small>
              </span>
              <span className="pc-input">
                <input inputMode="decimal" placeholder={c.k === "lucro" || c.k === "impostos" ? "0" : "auto"} aria-label={`${c.nome} (%)`} value={form[c.k]} onChange={(e) => setForm({ ...form, [c.k]: e.target.value })} />
                %
              </span>
            </label>
          ))}
        </div>
        <p className={`pc-resumo ${total >= 100 ? "ruim" : ""}`}>
          {total >= 100
            ? `A soma passou de 100% (${fmtPct(total)}): não tem preço que pague. Diminua o lucro ou as despesas.`
            : `De cada R$ 100,00 vendidos: R$ ${fmt(total - p.lucro)} vão para taxas, despesas e impostos, R$ ${fmt(p.lucro)} são o seu lucro e R$ ${fmt(100 - total)} pagam o custo do produto.`}
        </p>
        <div className="ins-modal-botoes">
          <span className="fin-ok">{msg}</span>
          <button type="button" className="btn-verde" onClick={salvar}>Salvar</button>
        </div>
      </div>

      <div className="relatorio-documento">
        <h2>Preço de cada produto</h2>
        <p className="fin-explica">
          {abaixo > 0 ? `${abaixo} ${abaixo === 1 ? "produto está" : "produtos estão"} abaixo do preço ideal.` : "Todos os produtos com custo estão com o preço bom."}
          {semCusto > 0 ? ` ${semCusto} sem custo cadastrado.` : ""}
        </p>
        {semCusto > 0 && (
          <button type="button" className="fin-aviso" onClick={irCustos}>
            ⚠️ Sem o custo, não dá para calcular o preço. <u>Cadastrar custos</u> (ou monte a ficha técnica em Matéria-prima).
          </button>
        )}
        <label className="ins-check">
          <input type="checkbox" checked={soAbaixo} onChange={(e) => setSoAbaixo(e.target.checked)} /> Mostrar só os que estão abaixo
        </label>
        <ul className="pc-lista">
          {mostrar.map(({ produto: x, custo, ficha, r }) => (
            <li key={x.id} className={`pc-item ${r.situacao}`}>
              <button type="button" className="pc-linha" aria-expanded={aberto === x.id} onClick={() => setAberto(aberto === x.id ? null : x.id)} disabled={r.situacao === "sem-custo" || r.situacao === "impossivel"}>
                <span className="pc-nome">
                  <strong>{x.nome}</strong>
                  <small>
                    {typeof custo === "number" ? `Custo ${R(custo)}${ficha ? " (ficha)" : ""} · vende por ${R(x.preco)}` : `Vende por ${R(x.preco)} · sem custo`}
                  </small>
                  {r.situacao === "bom" || r.situacao === "baixo" ? (
                    <small className={r.lucroReal < 0 ? "fin-neg" : ""}>
                      Lucro por venda: <b>{R(r.lucroReal)}</b>
                      {r.margemReal !== null ? ` (${r.margemReal}%)` : ""}
                    </small>
                  ) : null}
                </span>
                <span className="pc-status">
                  {r.situacao === "bom" && <b className="pc-chip bom">✓ Preço bom</b>}
                  {r.situacao === "baixo" && (
                    <>
                      <b className="pc-chip baixo">Abaixo</b>
                      <small>ideal {R(r.sugerido)}</small>
                    </>
                  )}
                  {r.situacao === "sem-custo" && <b className="pc-chip">Sem custo</b>}
                  {r.situacao === "impossivel" && <b className="pc-chip baixo">—</b>}
                </span>
              </button>
              {aberto === x.id && (r.situacao === "bom" || r.situacao === "baixo") && (
                <div className="pc-detalhe">
                  <p>
                    Preço ideal: <b>{R(r.ideal)}</b> · sugerido <b>{R(r.sugerido)}</b> (lucro de {R(r.lucroNoSugerido)} por venda)
                  </p>
                  <div className="pc-colunas">
                    <Partes titulo={`Vendendo a ${R(x.preco)} (hoje)`} partes={r.partes} lucro={r.lucroReal} />
                    {r.situacao === "baixo" && <Partes titulo={`Vendendo a ${R(r.sugerido)} (sugerido)`} partes={r.partesIdeal} lucro={r.lucroNoSugerido} />}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Partes({ titulo, partes, lucro }) {
  return (
    <div className="pc-partes">
      <strong>{titulo}</strong>
      <ul>
        {partes.map((x) => (
          <li key={x.nome}><span>{x.nome}</span><span>{R(x.valor)}</span></li>
        ))}
        <li className={lucro < 0 ? "fin-neg" : "pc-lucro"}><span>{lucro < 0 ? "Prejuízo" : "Seu lucro"}</span><span>{R(lucro)}</span></li>
      </ul>
    </div>
  );
}
