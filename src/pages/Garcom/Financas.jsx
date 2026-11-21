import { L } from "../../loja";
import useNomeLoja from "../../hooks/useNomeLoja";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useTaxas } from "../../utils/taxas";
import { moeda } from "../../utils/tipoVenda";
import { SEM_CATEGORIA_FIN, TIPOS_DESPESA, calcularFinancas, isoDia, juntarVendas, lerValor, nomeTipoDespesa, periodo } from "../../utils/financas";
import "../../styles/Garcom/RelatorioGerencial.css";
import "../../styles/Garcom/Financas.css";

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
  { id: "resumo", nome: "Resumo" },
  { id: "despesas", nome: "Despesas" },
  { id: "custos", nome: "Custos dos produtos" },
];

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
  const despesas = useColecao("despesas");
  const [aba, setAba] = useState("resumo");
  const [per, setPer] = useState("mes");
  const [faixa, setFaixa] = useState(() => periodo("mes"));

  const custos = useMemo(() => {
    const m = {};
    (custosDocs || []).forEach((c) => {
      if (typeof c.custo === "number") m[c.id] = c.custo;
    });
    return m;
  }, [custosDocs]);
  const carregando = dias === null || hoje === null || produtos === null || custosDocs === null || despesas === null;
  const f = useMemo(
    () => (carregando ? null : calcularFinancas({ vendas: juntarVendas(dias, hoje), produtos, custos, despesas, taxas, de: faixa.de, ate: faixa.ate })),
    [carregando, dias, hoje, produtos, custos, despesas, taxas, faixa]
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
          <p>O que entrou, o que saiu e o lucro, no geral e por categoria do cardápio.</p>
          <div className="fin-abas" role="tablist">
            {ABAS.map((a) => (
              <button key={a.id} role="tab" aria-selected={aba === a.id} className={aba === a.id ? "ativa" : ""} onClick={() => setAba(a.id)}>
                {a.nome}
              </button>
            ))}
          </div>
          {aba !== "custos" && (
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
      ) : aba === "despesas" ? (
        <Despesas f={f} categorias={categorias} />
      ) : aba === "custos" ? (
        <Custos produtos={produtos} custos={custos} />
      ) : (
        <Resumo f={f} nomeLoja={nomeLoja} faixa={faixa} irCustos={() => setAba("custos")} />
      )}
    </div>
  );
}

function Resumo({ f, nomeLoja, faixa, irCustos }) {
  const temDespesaPorCategoria = f.categorias.some((c) => c.despesas > 0);
  return (
    <div className="relatorio-documento">
      <div className="relatorio-cabecalho">
        <div>
          <span>Finanças</span>
          <h1>{nomeLoja}</h1>
          <p>Entradas, saídas e lucro do período</p>
        </div>
        <div className="relatorio-emissao">
          <strong>Período</strong>
          <span>{br(faixa.de)} a {br(faixa.ate)}</span>
        </div>
      </div>

      {f.semCusto > 0 && (
        <button type="button" className="fin-aviso no-print" onClick={irCustos}>
          ⚠️ {f.semCusto === 1 ? "1 produto vendido está" : `${f.semCusto} produtos vendidos estão`} sem custo cadastrado: o lucro deles não entra na conta. <u>Cadastrar custos</u>
        </button>
      )}

      <div className="fin-conta">
        <Linha nome="Entrou (vendas)" valor={f.entrou} detalhe={`${f.pedidos} ${f.pedidos === 1 ? "pedido" : "pedidos"}${f.taxaEntrega > 0 ? ` · ${R(f.taxaEntrega)} de taxa de entrega` : ""}`} />
        <Linha nome="Taxas da maquininha" valor={-f.maquininha} detalhe={f.taxaCartaoCliente > 0 ? `${R(f.taxaCartaoCliente)} o cliente pagou junto` : null} />
        <Linha nome="Custo dos produtos vendidos" valor={-f.custoProdutos} />
        <Linha nome="Despesas" valor={-f.despesas} />
        <Linha nome="Lucro" valor={f.lucro} total detalhe={f.margem === null ? null : `${f.margem}% do que entrou`} />
        {f.investimento > 0 && (
          <>
            <Linha nome="Investimento" valor={-f.investimento} detalhe="Equipamento, reforma… (fica fora do lucro)" />
            <Linha nome="Sobrou depois do investimento" valor={f.sobra} total />
          </>
        )}
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
                  <th>Custo</th>
                  {temDespesaPorCategoria && <th>Despesas</th>}
                  <th>Lucro</th>
                  <th>Margem</th>
                </tr>
              </thead>
              <tbody>
                {f.categorias.map((c) => (
                  <tr key={c.nome}>
                    <td>{c.nome}{c.semCusto > 0 && <small className="fin-sem"> · {c.semCusto} sem custo</small>}</td>
                    <td>{R(c.vendido)}</td>
                    <td>{R(c.custo)}</td>
                    {temDespesaPorCategoria && <td>{c.despesas ? R(c.despesas) : "–"}</td>}
                    <td className={c.lucro < 0 ? "fin-neg" : ""}>{R(c.lucro)}</td>
                    <td>{c.margem === null ? "–" : `${c.margem}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="relatorio-nota">
          Lucro da categoria = vendido − custo dos produtos{temDespesaPorCategoria ? " − despesas lançadas nela" : ""}. Taxas da maquininha
          {f.despesasSemCategoria > 0 ? " e despesas sem categoria (aluguel, contas…)" : ""} entram só no lucro geral.
        </p>
      </div>

      {(f.despesasPorTipo.length > 0 || f.formas.length > 0) && (
        <div className="fin-duas">
          {f.despesasPorTipo.length > 0 && (
            <div className="relatorio-secao">
              <h2>Saídas por tipo</h2>
              <ul className="fin-lista">
                {f.despesasPorTipo.map((t) => (
                  <li key={t.id}><span>{t.icone} {t.nome}</span><strong>{R(t.valor)}</strong></li>
                ))}
              </ul>
            </div>
          )}
          {f.formas.length > 0 && (
            <div className="relatorio-secao">
              <h2>Entradas por pagamento</h2>
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
                    <td>{p.custoUn === null ? <span className="fin-sem">sem custo</span> : R(p.custoUn)}</td>
                    <td className={p.lucro < 0 ? "fin-neg" : ""}>{p.lucro === null ? "–" : R(p.lucro)}</td>
                    <td>{p.margem === null ? "–" : `${p.margem}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="relatorio-rodape">
        <p>Emitido em {new Date().toLocaleString("pt-BR")} · {nomeLoja}</p>
      </div>
    </div>
  );
}

function Linha({ nome, valor, detalhe, total }) {
  return (
    <div className={`fin-linha${total ? " fin-total" : ""}`}>
      <div>
        <span>{nome}</span>
        {detalhe && <small>{detalhe}</small>}
      </div>
      <strong className={valor < 0 ? "fin-neg" : total ? (valor >= 0 ? "fin-pos" : "fin-neg") : ""}>
        {valor < 0 ? "− " : ""}{R(Math.abs(valor))}
      </strong>
    </div>
  );
}

function Despesas({ f, categorias }) {
  const vazio = { data: isoDia(), tipo: "insumos", valor: "", descricao: "", categoria: "" };
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagar, setApagar] = useState(null);

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
        valor,
        descricao: form.descricao.trim().slice(0, 120),
        categoria: form.tipo === "investimento" ? "" : form.categoria,
        criadoEm: serverTimestamp(),
      });
      setForm({ ...vazio, data: form.data, tipo: form.tipo });
    } catch {
      setErro("Não foi possível salvar. Confira a internet e tente de novo.");
    }
    setSalvando(false);
  }

  return (
    <>
      <form className="relatorio-documento fin-form no-print" onSubmit={salvar}>
        <h2>Lançar despesa</h2>
        <div className="fin-tipos" role="radiogroup" aria-label="Tipo de despesa">
          {TIPOS_DESPESA.map((t) => (
            <button type="button" key={t.id} role="radio" aria-checked={form.tipo === t.id} className={form.tipo === t.id ? "ativo" : ""} onClick={() => setForm({ ...form, tipo: t.id })}>
              {t.icone} {t.nome}
            </button>
          ))}
        </div>
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
            <input placeholder="Ex.: carne do almoço, conta de luz" maxLength={120} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </label>
          {form.tipo !== "investimento" && categorias.length > 0 && (
            <label className="fin-largo">
              É de qual categoria? (opcional)
              <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                <option value="">De tudo (aluguel, luz…)</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {form.tipo === "investimento" && <p className="relatorio-nota">Investimento (equipamento, reforma…) aparece à parte e não diminui o lucro do período.</p>}
        {erro && <p className="fin-erro">{erro}</p>}
        <button className="btn-verde" disabled={salvando}>{salvando ? "Salvando…" : "Salvar despesa"}</button>
      </form>

      <div className="relatorio-documento">
        <h2>Despesas do período · {R(f.despesas + f.investimento)}</h2>
        {f.listaDespesas.length === 0 ? (
          <p>Nenhuma despesa lançada no período.</p>
        ) : (
          <ul className="fin-despesas">
            {f.listaDespesas.map((d) => (
              <li key={d.id}>
                <div>
                  <strong>{d.descricao || nomeTipoDespesa(d.tipo)}</strong>
                  <small>
                    {br(d.data)} · {nomeTipoDespesa(d.tipo)}
                    {d.categoria ? ` · ${d.categoria}` : ""}
                  </small>
                </div>
                <span className="fin-valor">{R(d.valor)}</span>
                {apagar === d.id ? (
                  <span className="fin-confirma">
                    <button type="button" className="fin-btn-perigo" onClick={() => deleteDoc(doc(db, ...L(), "despesas", d.id)).finally(() => setApagar(null))}>Apagar</button>
                    <button type="button" onClick={() => setApagar(null)}>Não</button>
                  </span>
                ) : (
                  <button type="button" className="fin-btn-x" aria-label={`Apagar ${d.descricao || nomeTipoDespesa(d.tipo)}`} onClick={() => setApagar(d.id)}>✕</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Custos({ produtos, custos }) {
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
        cardápio do cliente não mostra. Com o custo, o sistema calcula o lucro de cada venda.
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
