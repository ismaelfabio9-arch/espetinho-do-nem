import { L } from "../../loja";
import useNomeLoja from "../../hooks/useNomeLoja";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useTaxas } from "../../utils/taxas";
import { GRUPOS, TIPOS, calcularFinancas, grupoDe, isoDia, juntarVendas, lerValor, periodo, tipoDe } from "../../utils/financas";
import { custoDaFicha, perdasNoPeriodo } from "../../utils/insumos";
import { FichaDoProduto } from "../../components/FichaTecnica";
import { ehCategoriaDeBebida, ehCategoriaDePrato } from "../../utils/montagem";
import { PESO_INGREDIENTES_PADRAO, pctDoMes, pesoIngredientes, precoDoProduto, somaPct } from "../../utils/precificacao";
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
  { id: "lancamentos", nome: "Despesas e compras" },
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

/** Dinheiro (Lucro e caixa, Despesas e compras) ou, com abas={["preco"]}, o Preço certo de Cardápio e estoque. */
function Financas({ abas = ["resumo", "lancamentos"], titulo = "Dinheiro", texto = "O lucro do que a loja vende e o dinheiro que entrou e saiu." }) {
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
  const [aba, setAba] = useState(abas[0]);
  const abasVisiveis = ABAS.filter((a) => abas.includes(a.id));
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
        <Link to="/" className="voltar">← Voltar</Link>
        <div className="relatorio-filtros">
          <h1>{titulo}</h1>
          <p>{texto}</p>
          {abasVisiveis.length > 1 && <div className="fin-abas ins-abas" role="tablist">
            {abasVisiveis.map((a) => (
              <button key={a.id} role="tab" aria-selected={aba === a.id} className={aba === a.id ? "ativa" : ""} onClick={() => setAba(a.id)}>
                {a.nome}
              </button>
            ))}
          </div>}
          {aba !== "preco" && (
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
      ) : aba === "preco" ? (
        <PrecoCerto produtos={produtos} custos={custos} daFicha={daFicha} />
      ) : (
        <Resumo f={f} nomeLoja={nomeLoja} faixa={faixa} />
      )}
    </div>
  );
}

function Resumo({ f, nomeLoja, faixa }) {
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
        <Link to="/cardapio?aba=preco" className="fin-aviso no-print">
          ⚠️ {f.semCusto === 1 ? "1 produto vendido está" : `${f.semCusto} produtos vendidos estão`} sem custo cadastrado ({R(f.vendidoSemCusto)} em vendas): sem o custo, o lucro aparece maior do que é. <u>Cadastrar custos</u>
        </Link>
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

/** Preço certo: por quanto vender cada produto para pagar tudo e sobrar o lucro que o dono quer. */
// Nada é automático: o que o dono não preencher conta como 0 (o sistema não inventa número).
function PrecoCerto({ produtos, custos, daFicha }) {
  const [salvo, setSalvo] = useState(null); // configuracoes/precificacao
  const [form, setForm] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [soAbaixo, setSoAbaixo] = useState(false);
  const [msg, setMsg] = useState("");
  const [detalhe, setDetalhe] = useState({}); // { fixas: true } lista aberta
  const [montar, setMontar] = useState(null); // produto com a janela de ingredientes aberta
  const [fila, setFila] = useState(null); // { ids, i }: montando um prato depois do outro
  const [digitar, setDigitar] = useState({});
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
      const modo = (k) => (salvo[`${k}Modo`] === "valor" ? "valor" : "pct");
      setForm({
        maquininha: t(salvo.maquininha), maquininhaModo: "pct",
        fixas: t(salvo.fixas), fixasModo: modo("fixas"),
        variaveis: t(salvo.variaveis), variaveisModo: modo("variaveis"),
        impostos: t(salvo.impostos ?? 0), impostosModo: modo("impostos"),
        lucro: t(salvo.lucro), lucroModo: modo("lucro"),
        vendasMes: t(salvo.vendasMes),
        conta: salvo.conta === "ingredientes" ? "ingredientes" : "completo",
        pesoIngredientes: t(pesoIngredientes(salvo)),
        fixasItens: (salvo.fixasItens || []).map((i) => ({ nome: i.nome, valor: t(i.valor) })),
        variaveisItens: (salvo.variaveisItens || []).map((i) => ({ nome: i.nome, valor: t(i.valor) })),
      });
    }
  }, [salvo, form]);
  if (!form) return <p className="fin-carregando">Carregando…</p>;

  const numDe = (v, max = Infinity) => {
    const t = String(v ?? "").trim();
    const n = Number(t.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t);
    return t !== "" && Number.isFinite(n) && n >= 0 && n < max ? n : null;
  };
  // Despesa preenchida uma por uma (aluguel, funcionários, energia…): o total do mês vira o valor do campo.
  const totalItens = (k) => (form[`${k}Itens`] || []).reduce((s2, i) => s2 + (numDe(i.valor) || 0), 0);
  const usaItens = (k) => totalItens(k) > 0;
  const valorCampo = (k) => (usaItens(k) ? String(Math.round(totalItens(k) * 100) / 100) : form[k]);
  const modoCampo = (k) => (usaItens(k) ? "valor" : form[`${k}Modo`]);
  // Quanto a loja vende por mês: só o que o dono digitar (para virar R$ do mês em %).
  const vendasMes = numDe(form.vendasMes);
  // Valor de um campo em %: digitado em %, digitado em R$ por mês (÷ vendas do mês); em branco = 0.
  const pctCampo = (k) => {
    const v = numDe(valorCampo(k), modoCampo(k) === "valor" ? Infinity : 100);
    if (v === null) return 0;
    if (modoCampo(k) === "valor") return pctDoMes(v, vendasMes) ?? 0;
    return v;
  };
  const lucroEmValor = form.lucroModo === "valor";
  // "Só os ingredientes": lucro = preço − ingredientes (maquininha, despesas e impostos não entram).
  const soIngredientes = form.conta === "ingredientes";
  const p = {
    maquininha: soIngredientes ? 0 : pctCampo("maquininha"),
    fixas: soIngredientes ? 0 : pctCampo("fixas"),
    variaveis: soIngredientes ? 0 : pctCampo("variaveis"),
    impostos: soIngredientes ? 0 : pctCampo("impostos"),
    lucro: soIngredientes ? 100 - (numDe(form.pesoIngredientes, 100) || PESO_INGREDIENTES_PADRAO) : lucroEmValor ? 0 : numDe(form.lucro, 100) ?? 0,
    lucroValor: !soIngredientes && lucroEmValor ? numDe(form.lucro) ?? 0 : 0,
    soIngredientes,
  };
  const total = somaPct(p);
  const fmtPct = (n) => `${String(Math.round(n * 10) / 10).replace(".", ",")}%`;
  const precisaVendas = ["fixas", "variaveis", "impostos"].some((k) => modoCampo(k) === "valor" && numDe(valorCampo(k)) !== null) && !vendasMes;

  async function mudarConta(conta) {
    setForm({ ...form, conta });
    try {
      await setDoc(doc(db, ...L(), "configuracoes", "precificacao"), { conta, pesoIngredientes: numDe(form.pesoIngredientes, 100) || PESO_INGREDIENTES_PADRAO, atualizadoEm: new Date().toISOString() }, { merge: true });
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
  }

  async function salvar() {
    const v = (k) => numDe(form[k]);
    try {
      await setDoc(doc(db, ...L(), "configuracoes", "precificacao"), {
        maquininha: v("maquininha"),
        fixas: numDe(valorCampo("fixas")), fixasModo: modoCampo("fixas"),
        variaveis: numDe(valorCampo("variaveis")), variaveisModo: modoCampo("variaveis"),
        fixasItens: (form.fixasItens || []).filter((i) => String(i.nome || "").trim() && numDe(i.valor)).map((i) => ({ nome: String(i.nome).trim().slice(0, 40), valor: numDe(i.valor) })),
        variaveisItens: (form.variaveisItens || []).filter((i) => String(i.nome || "").trim() && numDe(i.valor)).map((i) => ({ nome: String(i.nome).trim().slice(0, 40), valor: numDe(i.valor) })),
        impostos: v("impostos") ?? 0, impostosModo: form.impostosModo,
        lucro: v("lucro") ?? 0, lucroModo: form.lucroModo,
        vendasMes: v("vendasMes"),
        conta: form.conta,
        pesoIngredientes: numDe(form.pesoIngredientes, 100) || PESO_INGREDIENTES_PADRAO,
        atualizadoEm: new Date().toISOString(),
      });
      setMsg("✓ Salvo");
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
    setTimeout(() => setMsg(""), 2000);
  }

  const campos = [
    { k: "maquininha", nome: "Taxa da maquininha", soPct: true, dica: "% que a maquininha cobra em cada venda" },
    { k: "fixas", nome: "Despesas fixas", porMes: true, dica: "aluguel, funcionários, contas: em % ou o total do mês em R$" },
    { k: "variaveis", nome: "Despesas variáveis", porMes: true, dica: "entregador, divulgação…: em % ou o total do mês em R$" },
    { k: "impostos", nome: "Impostos", porMes: true, dica: "MEI: o valor do boleto do mês em R$ (DAS) · Simples Nacional: costuma ser de 4% a 6%" },
    { k: "lucro", nome: "Lucro que você quer", porVenda: true, dica: lucroEmValor ? "R$ limpos em cada produto vendido" : "% de cada venda que sobra limpo (restaurante costuma ficar entre 10% e 20%)" },
  ];
  const explicaValor = (c) => {
    if (c.soPct || modoCampo(c.k) !== "valor") {
      const v = numDe(form[c.k], 100);
      return v && c.porMes && vendasMes ? `= ${R((vendasMes * v) / 100)} por mês` : "";
    }
    const v = numDe(valorCampo(c.k));
    if (v === null) return "";
    if (c.porVenda) return `= R$ ${fmt(v)} em cada venda`;
    const pc = pctDoMes(v, vendasMes);
    return pc === null ? "informe quanto vende por mês" : `= ${fmtPct(pc)} das vendas`;
  };
  const linhas = (produtos || [])
    .filter((x) => x.nome && x.ativo !== false)
    .map((x) => ({ produto: x, custo: custos[x.id], ficha: typeof daFicha?.[x.id] === "number", r: precoDoProduto(custos[x.id], x.preco, p) }))
    .sort((a, b) => String(a.produto.categoria || "").localeCompare(String(b.produto.categoria || ""), "pt-BR") || String(a.produto.nome).localeCompare(String(b.produto.nome), "pt-BR"));
  const abaixo = linhas.filter((l) => l.r.situacao === "baixo").length;
  // Produtos ainda sem ingredientes (mesmo com custo digitado): a fila do "um por um".
  const semFicha = linhas.filter((l) => !l.ficha);
  const semCusto = linhas.filter((l) => l.r.situacao === "sem-custo").length;
  const mostrar = soAbaixo ? linhas.filter((l) => l.r.situacao === "baixo") : linhas;
  // Em blocos por categoria: pratos (prato feito, do dia) primeiro, acompanhamentos e porções no meio, bebidas no fim.
  const ordemCat = (c) => (ehCategoriaDePrato(c) ? 0 : ehCategoriaDeBebida(c) ? 2 : 1);
  const grupos = Object.values(
    mostrar.reduce((acc, l) => {
      const nome = String(l.produto.categoria || "").trim() || "Sem categoria";
      (acc[nome] = acc[nome] || { nome, itens: [], abaixo: 0 }).itens.push(l);
      if (l.r.situacao === "baixo") acc[nome].abaixo += 1;
      return acc;
    }, {})
  ).sort((a, b) => ordemCat(a.nome) - ordemCat(b.nome) || a.nome.localeCompare(b.nome, "pt-BR"));

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
            <small>Também tira maquininha, aluguel, contas e impostos.</small>
          </button>
        </div>
        {!soIngredientes && <h2>Quanto sai de cada venda</h2>}
        {soIngredientes && <p className="fin-explica">O que sobra de cada produto é o preço menos o que se gasta de ingredientes. O sistema avisa quando os ingredientes pesam demais no preço.</p>}
        <p className="fin-explica" style={soIngredientes ? { display: "none" } : undefined}>Além do custo do produto, cada venda paga a maquininha, uma parte das despesas da loja e os impostos. O que ficar em branco conta como 0.</p>
        <div className="pc-campos">
          {soIngredientes && (
            <div className="pc-campo">
              <span>
                Quanto os ingredientes podem pesar no preço
                <small>Restaurante costuma ficar entre 25% e 35%: o resto do preço paga o aluguel, os funcionários, as contas e o seu lucro.</small>
              </span>
              <span className="pc-input">
                <input inputMode="decimal" placeholder={String(PESO_INGREDIENTES_PADRAO)} aria-label="Quanto os ingredientes podem pesar no preço (%)" value={form.pesoIngredientes} onChange={(e) => setForm({ ...form, pesoIngredientes: e.target.value })} />
                <em>%</em>
              </span>
              {(() => {
                const peso = numDe(form.pesoIngredientes, 100) || PESO_INGREDIENTES_PADRAO;
                return <small className="pc-equiv">Ex.: ingredientes de R$ 10,00 → vender por pelo menos {R(10 / (peso / 100))}</small>;
              })()}
            </div>
          )}
          {campos.filter(() => !soIngredientes).map((c) => (
            <div key={c.k} className="pc-campo">
              <span>
                {c.nome}
                <small>{c.dica}</small>
              </span>
              <span className="pc-input">
                {!c.soPct && (
                  <span className="pc-modo" role="group" aria-label={`${c.nome}: em % ou R$`}>
                    <button type="button" aria-pressed={form[`${c.k}Modo`] !== "valor"} className={form[`${c.k}Modo`] !== "valor" ? "ativo" : ""} onClick={() => setForm({ ...form, [`${c.k}Modo`]: "pct", [c.k]: "" })}>%</button>
                    <button type="button" aria-pressed={form[`${c.k}Modo`] === "valor"} className={form[`${c.k}Modo`] === "valor" ? "ativo" : ""} onClick={() => setForm({ ...form, [`${c.k}Modo`]: "valor", [c.k]: "" })}>R$</button>
                  </span>
                )}
                <input
                  inputMode="decimal"
                  placeholder={modoCampo(c.k) === "valor" ? "0,00" : "0"}
                  aria-label={`${c.nome} (${modoCampo(c.k) === "valor" ? (c.porVenda ? "R$ por venda" : "R$ por mês") : "%"})`}
                  value={usaItens(c.k) ? fmt(totalItens(c.k)) : form[c.k]}
                  readOnly={usaItens(c.k)}
                  onChange={(e) => setForm({ ...form, [c.k]: e.target.value })}
                />
                <em>{modoCampo(c.k) === "valor" ? (c.porVenda ? "por venda" : "por mês") : "%"}</em>
              </span>
              {explicaValor(c) && <small className="pc-equiv">{explicaValor(c)}</small>}
              {LISTAS[c.k] && (
                <ItensDespesa
                  nome={c.nome}
                  sugestoes={LISTAS[c.k]}
                  itens={form[`${c.k}Itens`] || []}
                  aberto={!!detalhe[c.k]}
                  abrir={() => setDetalhe({ ...detalhe, [c.k]: !detalhe[c.k] })}
                  total={totalItens(c.k)}
                  mudar={(itens) => setForm({ ...form, [`${c.k}Itens`]: itens, ...(itens.some((i) => numDe(i.valor)) ? { [`${c.k}Modo`]: "valor" } : {}) })}
                />
              )}
            </div>
          ))}
        </div>
{!soIngredientes && (
        <label className="pc-campo">
          <span>
            Quanto a loja vende por mês
            <small>Digite quanto vende (ou espera vender) por mês. Usado para virar os gastos do mês em R$ em %.</small>
          </span>
          <span className="pc-input">
            <input inputMode="decimal" placeholder="0,00" aria-label="Quanto a loja vende por mês (R$)" value={form.vendasMes} onChange={(e) => setForm({ ...form, vendasMes: e.target.value })} />
            <em>R$</em>
          </span>
        </label>
        )}
        {precisaVendas && <p className="fin-aviso">⚠️ Para usar gasto do mês em R$, informe quanto a loja vende por mês.</p>}
        <p className={`pc-resumo ${total >= 100 ? "ruim" : ""}`}>
          {soIngredientes
            ? `Preço bom = os ingredientes serem no máximo ${fmtPct(100 - p.lucro)} do preço. O que sobra (${fmtPct(p.lucro)}) paga a loja e o seu lucro.`
            : total >= 100
            ? `A soma passou de 100% (${fmtPct(total)}): não tem preço que pague. Confira as despesas e o quanto a loja vende por mês.`
            : lucroEmValor
            ? `De cada R$ 100,00 vendidos: R$ ${fmt(total)} vão para taxas, despesas e impostos. O resto paga o custo do produto e o seu lucro de R$ ${fmt(p.lucroValor)} em cada venda.`
            : `De cada R$ 100,00 vendidos: R$ ${fmt(total - p.lucro)} vão para taxas, despesas e impostos, R$ ${fmt(p.lucro)} são o seu lucro e R$ ${fmt(100 - total)} pagam o custo do produto.`}
        </p>
        <div className="ins-modal-botoes">
          <span className="fin-ok">{msg}</span>
          <button type="button" className="btn-verde" onClick={salvar}>Salvar</button>
        </div>
      </div>

      <div className="relatorio-documento">
        <h2>Preço de cada produto</h2>
        {semFicha.length > 0 && (
          <button type="button" className="btn-verde pc-todos" onClick={() => { setFila({ ids: semFicha.map((l) => l.produto.id), i: 0 }); setMontar(semFicha[0].produto); }}>
            🧮 Montar o custo de todos os que faltam ({semFicha.length}), um por um
          </button>
        )}
        <p className="fin-explica">
          {total >= 100
            ? "As despesas e o lucro passaram de 100% de cada venda: confira os valores acima antes de olhar os preços."
            : abaixo > 0
            ? `${abaixo} ${abaixo === 1 ? "produto está" : "produtos estão"} abaixo do preço ideal.`
            : linhas.some((l) => l.r.situacao === "bom")
            ? "Todos os produtos com custo estão com o preço bom."
            : ""}
          {semCusto > 0 ? ` ${semCusto} sem custo cadastrado.` : ""}
        </p>
        {semCusto > 0 && (
          <p className="fin-aviso">⚠️ Sem o custo não dá para calcular o preço. Digite o custo aqui mesmo, ou ponha os ingredientes do produto em Produtos → editar.</p>
        )}
        <label className="ins-check">
          <input type="checkbox" checked={soAbaixo} onChange={(e) => setSoAbaixo(e.target.checked)} /> Mostrar só os que estão abaixo
        </label>
        <ul className="pc-lista">
          {grupos.map((g) => (
            <Fragment key={g.nome}>
            <li className="pc-grupo">
              <h3>{g.nome}</h3>
              <small>{g.itens.length} {g.itens.length === 1 ? "produto" : "produtos"}{g.abaixo > 0 ? ` · ${g.abaixo} abaixo do ideal` : ""}</small>
            </li>
          {g.itens.map(({ produto: x, custo, ficha, r }) => (
            <li key={x.id} className={`pc-item ${r.situacao}`}>
              <button type="button" className="pc-linha" aria-expanded={aberto === x.id} onClick={() => setAberto(aberto === x.id ? null : x.id)} disabled={r.situacao === "sem-custo" || r.situacao === "impossivel"}>
                <span className="pc-nome">
                  <strong>{x.nome}</strong>
                  <small>
                    {typeof custo === "number" ? `Custo ${R(custo)}${ficha ? " (ficha)" : ""} · vende por ${R(x.preco)}` : `Vende por ${R(x.preco)} · sem custo`}
                  </small>
                  {r.situacao === "bom" || r.situacao === "baixo" ? (
                    <small>
                      Sobra depois do custo: <b>{R(r.hoje.depoisCusto)}</b> · lucro limpo:{" "}
                      <b className={r.lucroReal < 0 ? "fin-neg" : "pc-verde"}>{R(r.lucroReal)}</b>
                      {r.margemReal !== null ? ` (${pctTxt(r.margemReal)})` : ""}
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
                  {r.situacao === "impossivel" && <b className="pc-chip baixo">⚠️ Confira as despesas</b>}
                </span>
              </button>
              <div className="pc-acoes">
                <button type="button" className="ins-btn entrada" onClick={() => { setFila(null); setMontar(x); }}>
                  🧮 {ficha ? "Ver os ingredientes" : "Montar o custo com os ingredientes"}
                </button>
                {!ficha && typeof custo !== "number" && !digitar[x.id] && (
                  <button type="button" className="ni-link" onClick={() => setDigitar({ ...digitar, [x.id]: true })}>ou digitar o custo</button>
                )}
              </div>
              {!ficha && (typeof custo === "number" || digitar[x.id]) && <CustoDigitado produto={x} custo={custo} />}
              {aberto === x.id && (r.situacao === "bom" || r.situacao === "baixo") && (
                <div className="pc-detalhe">
                  <p>
                    Preço ideal: <b>{R(r.ideal)}</b> · sugerido <b>{R(r.sugerido)}</b> (lucro de {R(r.lucroNoSugerido)} por venda)
                  </p>
                  <div className="pc-colunas">
                    <Escada titulo={`Vendendo a ${R(x.preco)} (hoje)`} d={r.hoje} fixasPct={p.fixas} />
                    {r.situacao === "baixo" && <Escada titulo={`Vendendo a ${R(r.sugerido)} (sugerido)`} d={r.noSugerido} fixasPct={p.fixas} />}
                  </div>
                  {p.fixas > 0 && (
                    <p className="pc-nota">
                      A <b>parte das despesas fixas</b> é quanto cada venda ajuda a pagar do aluguel, funcionários e contas do mês ({String(Math.round(p.fixas * 10) / 10).replace(".", ",")}% de cada venda). Vendendo mais no mês, essa parte cai e o lucro limpo sobe.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
            </Fragment>
          ))}
        </ul>
      </div>
      {montar && (
        <div className="ins-modal" role="dialog" aria-modal="true" aria-label={`Custo de ${montar.nome}`} onClick={() => { setMontar(null); setFila(null); }}>
          <div className="ins-modal-caixa pc-montar" onClick={(e) => e.stopPropagation()}>
            <div className="pc-montar-topo">
              <h2>{montar.nome}</h2>
              <button type="button" className="prod-ficha-x" aria-label="Fechar" onClick={() => { setMontar(null); setFila(null); }}>✕</button>
            </div>
            {fila && <p className="pc-fila">Produto {fila.i + 1} de {fila.ids.length}</p>}
            <p className="fin-explica">Diga o que vai em 1 {montar.nome} e quanto de cada. O sistema soma a comida, põe a parte das despesas e diz o preço para vender.</p>
            <FichaDoProduto key={montar.id} produto={montar} precoAtual={montar.preco} />
            {fila && (
              <div className="pc-fila-botoes">
                <button type="button" className="ins-btn" disabled={fila.i === 0} onClick={() => { const i = fila.i - 1; setFila({ ...fila, i }); setMontar((produtos || []).find((x) => x.id === fila.ids[i]) || null); }}>← Anterior</button>
                {fila.i < fila.ids.length - 1 ? (
                  <button type="button" className="btn-verde" onClick={() => { const i = fila.i + 1; setFila({ ...fila, i }); setMontar((produtos || []).find((x) => x.id === fila.ids[i]) || null); }}>Próximo produto →</button>
                ) : (
                  <button type="button" className="btn-verde" onClick={() => { setFila(null); setMontar(null); }}>✓ Terminei</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const LISTAS = {
  fixas: ["Aluguel", "Funcionários", "Energia (luz)", "Água", "Internet e telefone", "Gás", "Contador", "Sistemas e aplicativos"],
  variaveis: ["Embalagens", "Entregador (motoboy)", "Taxa de aplicativo de entrega", "Divulgação e anúncios"],
};

/** Despesas do mês uma por uma: as mais comuns já na lista, e "+ Adicionar outra" para o que faltar. */
function ItensDespesa({ nome, sugestoes, itens, aberto, abrir, total, mudar }) {
  const lista = [...sugestoes.filter((n) => !itens.some((i) => i.nome === n)).map((n) => ({ nome: n, valor: "", sugestao: true })), ...itens].sort(
    (a, b) => (sugestoes.indexOf(a.nome) === -1 ? 99 : sugestoes.indexOf(a.nome)) - (sugestoes.indexOf(b.nome) === -1 ? 99 : sugestoes.indexOf(b.nome))
  );
  const setValor = (n, valor) => {
    const ja = itens.find((i) => i.nome === n);
    mudar(ja ? itens.map((i) => (i.nome === n ? { ...i, valor } : i)) : [...itens, { nome: n, valor }]);
  };
  const [novo, setNovo] = useState("");
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

/** Custo digitado (produto sem ingredientes na ficha, ex.: bebida pronta), direto na lista do Preço certo. */
function CustoDigitado({ produto, custo }) {
  const [texto, setTexto] = useState(null);
  const [ok, setOk] = useState(false);
  async function gravar() {
    if (texto === null) return;
    const vazio = texto.trim() === "";
    await setDoc(doc(db, ...L(), "custos", produto.id), { custo: vazio ? null : lerValor(texto), nome: produto.nome, atualizadoEm: new Date().toISOString() }, { merge: true });
    setTexto(null);
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  }
  return (
    <label className="pc-custo-dig">
      <span>{typeof custo === "number" ? "Custo digitado" : "Digite o custo de 1 unidade"}</span>
      <span className="pc-input">
        R$
        <input inputMode="decimal" placeholder="0,00" aria-label={`Custo de ${produto.nome}`} value={texto ?? (typeof custo === "number" ? fmt(custo) : "")} onChange={(e) => setTexto(e.target.value)} onBlur={gravar} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        <em className="fin-ok">{ok ? "✓" : ""}</em>
      </span>
    </label>
  );
}

const pctTxt = (n) => (n < 0 ? `− ${Math.abs(n)}%` : `${n}%`);

/** A conta em degraus: preço → − custo → − taxas e impostos → − parte das despesas fixas → lucro limpo. */
function Escada({ titulo, d, fixasPct }) {
  const taxasTxt = [d.maquininha > 0 ? `maquininha ${R(d.maquininha)}` : "", d.variaveis > 0 ? `variáveis ${R(d.variaveis)}` : "", d.impostos > 0 ? `impostos ${R(d.impostos)}` : ""].filter(Boolean).join(" · ");
  return (
    <div className="pc-partes pc-escada">
      <strong>{titulo}</strong>
      <ul>
        <li className="pc-degrau"><span>Vende por</span><span>{R(d.preco)}</span></li>
        <li><span>− Custo do produto</span><span>{R(d.custo)}</span></li>
        <li className="pc-degrau"><span>= Sobra depois do custo</span><span>{R(d.depoisCusto)} <small>({pctTxt(d.pct(d.depoisCusto))})</small></span></li>
        {d.taxas > 0 && (
          <>
            <li><span>− Taxas e impostos<small>{taxasTxt}</small></span><span>{R(d.taxas)}</span></li>
            <li className="pc-degrau"><span>= Sobra para pagar as contas da loja</span><span>{R(d.depoisTaxas)} <small>({pctTxt(d.pct(d.depoisTaxas))})</small></span></li>
          </>
        )}
        {d.fixas > 0 && <li><span>− Parte das despesas fixas<small>{String(Math.round(fixasPct * 10) / 10).replace(".", ",")}% de cada venda</small></span><span>{R(d.fixas)}</span></li>}
        <li className={d.lucro < 0 ? "pc-final fin-neg" : "pc-final pc-lucro"}><span>= {d.lucro < 0 ? "Prejuízo" : "Lucro limpo"}</span><span>{R(d.lucro)} <small>({pctTxt(d.pct(d.lucro))})</small></span></li>
      </ul>
    </div>
  );
}


export default Financas;
