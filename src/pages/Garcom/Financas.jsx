import { L } from "../../loja";
import useNomeLoja from "../../hooks/useNomeLoja";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { registrar } from "../../utils/registro";
import { auth, db } from "../../firebase";
import { useTaxas } from "../../utils/taxas";
import { useRecurso } from "../../recursos";
import { TIPOS, calcularFinancas, grupoDe, isoDia, juntarVendas, lerValor, periodo, tipoDe } from "../../utils/financas";
import { custoDaFicha, perdasNoPeriodo } from "../../utils/insumos";
import Custos from "./Custos";
import PrecoCerto from "./PrecoCerto";
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
  { id: "custos", nome: "Custos" },
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
  const dinheiroCompleto = useRecurso("dinheiro-completo");
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
  // Preço certo: quanto a loja vendeu de verdade nos últimos 30 dias (só para mostrar ao lado do "vende por mês").
  const vendas30 = useMemo(() => {
    if (carregando || !abas.includes("preco")) return 0;
    const hojeD = new Date();
    const de = isoDia(new Date(hojeD.getFullYear(), hojeD.getMonth(), hojeD.getDate() - 29));
    return Number(calcularFinancas({ vendas: juntarVendas(dias, hoje), produtos, custos, lancamentos, taxas, de, ate: isoDia(hojeD) }).vendas || 0);
  }, [carregando, abas, dias, hoje, produtos, custos, lancamentos, taxas]);
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
          {aba !== "preco" && aba !== "custos" && (
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
        <Custos produtos={produtos} insumos={insumos} fichas={fichas} />
      ) : aba === "preco" ? (
        <PrecoCerto produtos={produtos} custos={custos} daFicha={daFicha} vendas30={vendas30} insumos={insumos} fichas={fichas} lancamentos={dinheiroCompleto ? lancamentos : []} categorias={categorias} />
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
          <Linha nome="Lucro líquido: sobrou para retirar" valor={f.lucro} total detalhe={f.margem === null ? "Depois de pagar tudo: produtos, taxas e contas" : `${f.margem}% das vendas · depois de pagar tudo: produtos, taxas e contas`} />
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

/** Os tipos de lançamento em listas: Compras · Despesas do mês (as fixas marcadas) · Outros; na entrada, as entradas. */
const LISTAS_SAIDA = [
  { nome: "Compras", grupos: ["compra"] },
  { nome: "Despesas do mês", grupos: ["fixa", "variavel"] },
  { nome: "Outros", grupos: ["investimento", "retirada"] },
];
const LISTAS_ENTRADA = [{ nome: "Entradas fora as vendas", grupos: ["entrada"] }];

/** Formulário de lançamento (Dinheiro → Hoje e Despesas e compras). duasColunas: no notebook, as listas lado a lado. */
/**
 * caixa e disponivel (Dinheiro → Hoje): mostra "Pagou com" — caixa da loja (a soma do mês, não mexe na gaveta),
 * gaveta de hoje (vira sangria da gaveta junto) ou Pix (sai do Pix do caixa).
 */
export function NovoLancamento({ categorias = [], onSalvo, tipoInicial = "", valorInicial = "", descricaoInicial = "", titulo = "Novo lançamento", caixa = null, disponivel = null, fornecedores = [] }) {
  const vazio = { data: isoDia(), tipo: tipoInicial, valor: valorInicial, descricao: descricaoInicial, categoria: "", fornecedor: "", pagoCom: "loja" };
  const [form, setForm] = useState(vazio);
  const [lado, setLado] = useState(tipoInicial && grupoDe(tipoInicial).saida === false ? "entrada" : "saida");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const tipo = form.tipo ? tipoDe(form.tipo) : null;
  const grupo = form.tipo ? grupoDe(form.tipo) : null;
  const listas = lado === "saida" ? LISTAS_SAIDA : LISTAS_ENTRADA;

  async function salvar(e) {
    e.preventDefault();
    if (!tipo) return setErro("Escolha o que é.");
    const valor = lerValor(form.valor);
    if (!valor) return setErro("Informe o valor.");
    if (!form.data) return setErro("Informe a data.");
    if (!form.descricao.trim()) return setErro("Escreva o motivo (o que foi).");
    const daGaveta = grupo.saida && caixa && (form.pagoCom === "gaveta" || form.pagoCom === "pix");
    const origem = form.pagoCom === "pix" ? "Pix" : "Dinheiro";
    if (daGaveta && disponivel && valor > disponivel[origem]) return setErro(`${origem === "Pix" ? "No Pix" : "Na gaveta"} tem R$ ${fmt(disponivel[origem])}. Escolha outra forma de pagar.`);
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
        ...(tipo.grupo === "compra" && form.fornecedor.trim() ? { fornecedor: form.fornecedor.trim().slice(0, 60) } : {}),
        ...(grupo.saida && caixa ? { pagoCom: form.pagoCom } : {}),
        criadoEm: serverTimestamp(),
      });
      // Pagou com a gaveta ou o Pix do caixa: a sangria entra junto (não precisa lançar duas vezes).
      if (daGaveta) {
        await addDoc(collection(db, ...L(), "caixaMov"), { caixaId: caixa.id, tipo: "sangria", origem, valor, motivo: `${tipo.nome}: ${form.descricao.trim()}`.slice(0, 100), lancamento: true, em: new Date().toISOString(), por: auth.currentUser?.email || "", criadoEm: serverTimestamp() });
      }
      registrar({ area: "dinheiro", acao: "Lançou em Finanças", texto: `${tipo.nome || form.tipo}${form.descricao.trim() ? `: ${form.descricao.trim()}` : ""} · dia ${form.data.split("-").reverse().join("/")}`, valor: grupo.saida ? -valor : valor });
      setForm({ ...vazio, tipo: "", valor: "", descricao: "", fornecedor: "", data: form.data });
      onSalvo?.();
    } catch {
      setErro("Não foi possível salvar. Confira a internet e tente de novo.");
    }
    setSalvando(false);
  }

  return (
    <form className="nl no-print" onSubmit={salvar}>
      {titulo && <h2 className="nl-titulo">{titulo}</h2>}
      <div className="nl-seg" role="tablist">
        <button type="button" role="tab" aria-selected={lado === "saida"} className={lado === "saida" ? "on" : ""} onClick={() => { setLado("saida"); setForm({ ...form, tipo: "" }); }}>Saída</button>
        <button type="button" role="tab" aria-selected={lado === "entrada"} className={lado === "entrada" ? "on" : ""} onClick={() => { setLado("entrada"); setForm({ ...form, tipo: "" }); }}>Entrada</button>
      </div>
      <div className={`nl-listas${listas.length > 1 ? " varias" : ""}`}>
        {listas.map((l) => (
          <div key={l.nome} className="nl-bloco">
            <div className="nl-lab">{l.nome}</div>
            <div className="nl-lista">
              {l.grupos.flatMap((g) => TIPOS.filter((t) => t.grupo === g)).map((t) => (
                <button type="button" key={t.id} className={form.tipo === t.id ? "nl-r on" : "nl-r"} aria-pressed={form.tipo === t.id} onClick={() => setForm({ ...form, tipo: t.id })}>
                  <span className="nl-rd" aria-hidden="true" />
                  <span className="nl-nome">{t.nome}</span>
                  {t.grupo === "fixa" && <small>fixa</small>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="nl-campos">
        <label>
          Valor (R$)
          <input inputMode="decimal" placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
        </label>
        <label>
          Data
          <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
        </label>
        <label className="nl-largo">
          Motivo
          <input placeholder={tipo?.grupo === "compra" ? "Ex.: carne e frango no atacado" : "Ex.: conta de luz de novembro"} maxLength={120} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
        </label>
        {tipo?.grupo === "compra" && (
          <label className="nl-largo">
            Fornecedor
            <input list="nl-fornecedores" placeholder="Opcional · ex.: açougue do Zé, Coca-Cola" maxLength={60} value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
            <datalist id="nl-fornecedores">
              {fornecedores.map((f) => <option key={f} value={f} />)}
            </datalist>
          </label>
        )}
        {tipo?.categoria && categorias.length > 0 && (
          <label className="nl-largo">
            Categoria do cardápio
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              <option value="">Para tudo / várias</option>
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {caixa && lado === "saida" && (
        <div className="nl-pago">
          <div className="nl-lab">Pagou com</div>
          <div className="nl-seg">
            {[["loja", "Caixa da loja"], ["gaveta", "Gaveta de hoje"], ["pix", "Pix"]].map(([id, nome]) => (
              <button type="button" key={id} className={form.pagoCom === id ? "on" : ""} onClick={() => setForm({ ...form, pagoCom: id })}>
                {nome}
                {disponivel && id !== "loja" && <small>R$ {fmt(id === "pix" ? disponivel.Pix : disponivel.Dinheiro)}</small>}
              </button>
            ))}
          </div>
        </div>
      )}
      {grupo?.id === "fixa" && <p className="nl-aviso">Despesa fixa: entra também no Preço certo, nas despesas fixas do mês.</p>}
      {grupo?.id === "compra" && <p className="nl-aviso">Compra vira estoque: entra no lucro só quando o produto é vendido.</p>}
      {erro && <p className="fin-erro">{erro}</p>}
      <button className="nl-ok" disabled={salvando}>{salvando ? "Salvando…" : "Lançar"}</button>
    </form>
  );
}

function Lancamentos({ f, categorias }) {
  const [apagar, setApagar] = useState(null);

  return (
    <>
      <div className="relatorio-documento">
        <NovoLancamento categorias={categorias} />
      </div>

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
                      <button type="button" className="fin-btn-perigo" onClick={() => deleteDoc(doc(db, ...L(), "despesas", d.id)).then(() => registrar({ area: "dinheiro", acao: "Apagou de Finanças", texto: `${d.descricao || d.tipo} · dia ${String(d.data || "").split("-").reverse().join("/")}`, valor: d.valor })).finally(() => setApagar(null))}>Apagar</button>
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

export default Financas;
