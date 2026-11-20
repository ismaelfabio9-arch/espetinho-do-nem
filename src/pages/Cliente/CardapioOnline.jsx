// Cardápio online da loja (plano Premium): o cliente pede de casa, para entrega ou retirada, e paga
// na entrega. O pedido vai pelo servidor da IFTech (/mesas/api/entrega), que confere os preços no
// cardápio da loja e grava em Pedidos (tipo "entrega"); o garçom recebe o aviso de pedido novo.
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { L, getLoja } from "../../loja";
import useNomeLoja from "../../hooks/useNomeLoja";
import { mesasApi } from "../../tenant";
import { ordenarGruposPorCategoria } from "../../utils/categorias";
import MontarPrato from "../../components/MontarPrato";
import PratoNoPedido from "../../components/PratoNoPedido";
import PedidoRapido from "../../components/PedidoRapido";
import { abreEscolha, emojiCategoria } from "../../utils/montagem";
import { useRecurso } from "../../recursos";
import { repassaAlguma, useTaxas } from "../../utils/taxas";
import { moeda, useEntrega } from "../../utils/entrega";
import "../../styles/Cliente/CardapioOnline.css";

const GUARDADO = "iftech:cardapio-online:cliente";
const PAGAMENTOS = ["Dinheiro", "Pix", "Cartão"];

function lerGuardado() {
  try {
    return JSON.parse(localStorage.getItem(GUARDADO) || "{}") || {};
  } catch {
    return {};
  }
}

export default function CardapioOnline() {
  const nomeLoja = useNomeLoja();
  const entrega = useEntrega();
  const ligadoNoPlano = useRecurso("pedido-online");
  const montarLigado = useRecurso("montar-prato");
  const estoqueLigado = useRecurso("estoque");
  const taxas = useTaxas();
  const [categoriasDocs, setCategoriasDocs] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [estoque, setEstoque] = useState({});
  const [carrinho, setCarrinho] = useState({});
  const [montando, setMontando] = useState(null);
  // Prato que já está no pedido: pergunta se edita (esqueceu o feijão) ou acrescenta mais um.
  const [perguntar, setPerguntar] = useState(null);
  const [editando, setEditando] = useState(null); // chave da linha do pedido que está sendo editada
  const [etapa, setEtapa] = useState("cardapio");
  const g = lerGuardado();
  const [form, setForm] = useState({ modo: "entrega", cliente: g.cliente || "", telefone: g.telefone || "", endereco: g.endereco || "", referencia: g.referencia || "", pagamento: "", troco: "", obs: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState({ texto: "", campo: "" });
  const [feito, setFeito] = useState(null);

  useEffect(() => {
    const a = onSnapshot(collection(db, ...L(), "categorias"), (s) => setCategoriasDocs(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const b = onSnapshot(collection(db, ...L(), "estoque"), (s) => setEstoque(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))));
    return () => {
      a();
      b();
    };
  }, []);

  useEffect(
    () =>
      onSnapshot(collection(db, ...L(), "produtos"), (s) => {
        const grupos = {};
        s.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.ativo !== false && p.foraHoje !== true)
          .forEach((p) => {
            // Produto sem categoria ou sem nome não pode derrubar a página (tela preta).
            const cat = String(p.categoria || "").trim() || "Outros";
            if (!grupos[cat]) grupos[cat] = { categoria: cat, itens: [] };
            grupos[cat].itens.push({ id: p.id, nome: String(p.nome || "Produto"), preco: Number(p.preco || 0) || 0, montagem: p.montagem || null, tipo: p.tipo || null });
          });
        setProdutos(ordenarGruposPorCategoria(Object.values(grupos), categoriasDocs));
      }),
    [categoriasDocs]
  );

  const linhas = Object.values(carrinho);
  const subtotal = linhas.reduce((s, l) => s + l.preco * l.quantidade, 0);
  const qtdItens = linhas.reduce((s, l) => s + l.quantidade, 0);
  const temRetirada = entrega.retirada;
  const modo = temRetirada ? form.modo : "entrega";
  const taxaEntrega = modo === "entrega" ? entrega.taxa : 0;
  const total = Math.round((subtotal + taxaEntrega) * 100) / 100;
  const porProduto = useMemo(() => {
    const m = {};
    linhas.forEach((l) => (m[l.produtoId] = (m[l.produtoId] || 0) + l.quantidade));
    return m;
  }, [linhas]);
  const esgotado = (item) => estoqueLigado && estoque[item.id]?.minimo !== undefined && Number(estoque[item.id]?.quantidade || 0) <= 0;

  const produtoPorId = (id) => produtos.flatMap((g) => g.itens).find((i) => i.id === id);
  const linhasDoProduto = (id) => linhas.filter((l) => l.produtoId === id && l.montagem);

  function editarLinha(l) {
    const item = produtoPorId(l.produtoId);
    if (!item) return;
    setPerguntar(null);
    setEditando(l.chave);
    setMontando(item);
  }

  function adicionar(item) {
    if (abreEscolha(item, montarLigado)) {
      if (linhasDoProduto(item.id).length) return setPerguntar(item);
      setEditando(null);
      return setMontando(item);
    }
    setCarrinho((c) => ({ ...c, [item.id]: { chave: item.id, produtoId: item.id, nome: item.nome, preco: item.preco, quantidade: (c[item.id]?.quantidade || 0) + 1 } }));
  }
  function adicionarMontado({ prato, bebidas }) {
    setCarrinho((c) => {
      const novo = { ...c };
      const chave = `m:${prato.nome}`;
      // Editando: a linha antiga sai e a nova fica com a mesma quantidade.
      const antiga = editando ? c[editando] : null;
      if (antiga) delete novo[editando];
      const qtd = antiga ? antiga.quantidade : 1;
      novo[chave] = { chave, produtoId: prato.produtoId, nome: prato.nome, preco: prato.preco, montagem: prato.montagem, quantidade: (novo[chave]?.quantidade || 0) + qtd };
      bebidas.forEach((b) => (novo[b.id] = { chave: b.id, produtoId: b.id, nome: b.nome, preco: b.preco, quantidade: (c[b.id]?.quantidade || 0) + 1 }));
      return novo;
    });
    setMontando(null);
    setEditando(null);
  }
  function ajustar(chave, d) {
    setCarrinho((c) => {
      const l = c[chave];
      if (!l) return c;
      const copia = { ...c };
      if (l.quantidade + d <= 0) delete copia[chave];
      else copia[chave] = { ...l, quantidade: l.quantidade + d };
      return copia;
    });
  }
  const muda = (campo) => (e) => {
    setForm({ ...form, [campo]: e.target.value });
    if (erro.campo === campo) setErro({ texto: "", campo: "" });
  };

  async function enviar() {
    setErro({ texto: "", campo: "" });
    setEnviando(true);
    try {
      const r = await mesasApi(
        "entrega",
        {
          loja: getLoja(),
          modo,
          cliente: form.cliente,
          telefone: form.telefone,
          endereco: form.endereco,
          referencia: form.referencia,
          pagamento: form.pagamento,
          troco: form.pagamento === "Dinheiro" ? form.troco : "",
          obs: form.obs,
          itens: linhas.map((l) => ({ produtoId: l.produtoId, qtd: l.quantidade, ...(l.montagem ? { montagem: l.montagem } : {}) })),
        },
        false
      );
      try {
        localStorage.setItem(GUARDADO, JSON.stringify({ cliente: form.cliente, telefone: form.telefone, endereco: form.endereco, referencia: form.referencia }));
      } catch {
        /* sem armazenamento */
      }
      setFeito({ ...r, modo, pagamento: form.pagamento });
      setCarrinho({});
      setEtapa("feito");
    } catch (e) {
      setErro({ texto: e.message || "Não foi possível enviar o pedido. Tente de novo.", campo: e.field || "" });
    }
    setEnviando(false);
  }

  if (!entrega.carregado) return <div className="online"><p className="online-vazio">Carregando o cardápio…</p></div>;
  const aberta = ligadoNoPlano && entrega.ligado;

  return (
    <div className="online">
      <header className="online-topo">
        <span className="online-eyebrow">🛵 Cardápio online</span>
        <h1>{nomeLoja || "Cardápio"}</h1>
        {aberta ? (
          <p>
            {temRetirada ? "Entrega ou retirada no balcão" : "Entrega"} · taxa de entrega R$ {moeda(entrega.taxa)} · pagamento na entrega
          </p>
        ) : (
          <p className="online-fechado">A loja não está recebendo pedidos pelo site agora. Você pode ver o cardápio.</p>
        )}
        {aberta && repassaAlguma(taxas) && <p className="online-aviso">💳 No cartão, tem o acréscimo da taxa da maquininha. Pix e dinheiro sem acréscimo.</p>}
      </header>

      {etapa === "feito" && feito ? (
        <section className="online-feito">
          <div className="online-feito-icone">✅</div>
          <h2>Pedido #{feito.numero} recebido!</h2>
          <p>{feito.modo === "entrega" ? "A loja já está com o seu pedido e vai preparar para entregar." : "A loja já está com o seu pedido. Quando estiver pronto, é só buscar no balcão."}</p>
          <p className="online-feito-total">
            Total: <strong>R$ {moeda(feito.total)}</strong>
            {feito.taxaEntrega ? ` (com R$ ${moeda(feito.taxaEntrega)} de entrega)` : ""}
            <br />
            Pagamento na {feito.modo === "entrega" ? "entrega" : "retirada"}: {feito.pagamento}
            {feito.troco ? ` · troco para R$ ${moeda(feito.troco)}` : ""}
          </p>
          <button type="button" className="online-btn" onClick={() => { setFeito(null); setEtapa("cardapio"); }}>
            Fazer outro pedido
          </button>
        </section>
      ) : etapa === "dados" ? (
        <section className="online-dados">
          <button type="button" className="online-voltar" onClick={() => setEtapa("cardapio")}>← Voltar ao cardápio</button>
          <h2>Seu pedido</h2>
          <ul className="online-itens">
            {linhas.map((l) => (
              <li key={l.chave}>
                <span className="online-item-nome">
                  {l.nome}
                  {l.montagem && produtoPorId(l.produtoId) && (
                    <button type="button" className="online-editar" onClick={() => editarLinha(l)}>
                      ✏️ Editar
                    </button>
                  )}
                </span>
                <span className="online-qtd">
                  <button type="button" onClick={() => ajustar(l.chave, -1)} aria-label={`Tirar 1 ${l.nome}`}>−</button>
                  {l.quantidade}
                  <button type="button" onClick={() => ajustar(l.chave, 1)} aria-label={`Mais 1 ${l.nome}`}>+</button>
                </span>
                <strong>R$ {moeda(l.preco * l.quantidade)}</strong>
              </li>
            ))}
          </ul>

          {temRetirada && (
            <div className="online-opcoes" role="radiogroup" aria-label="Entrega ou retirada">
              {[["entrega", `🛵 Entrega (R$ ${moeda(entrega.taxa)})`], ["retirada", "🏪 Retirar no balcão"]].map(([v, t]) => (
                <button type="button" key={v} className={modo === v ? "ativo" : ""} aria-pressed={modo === v} onClick={() => setForm({ ...form, modo: v })}>
                  {t}
                </button>
              ))}
            </div>
          )}

          <label className={erro.campo === "cliente" ? "erro" : ""}>
            Seu nome
            <input value={form.cliente} onChange={muda("cliente")} maxLength={60} autoComplete="name" />
          </label>
          <label className={erro.campo === "telefone" ? "erro" : ""}>
            WhatsApp com DDD
            <input value={form.telefone} onChange={muda("telefone")} inputMode="tel" maxLength={20} autoComplete="tel" placeholder="(81) 9 9999-9999" />
          </label>
          {modo === "entrega" && (
            <>
              <label className={erro.campo === "endereco" ? "erro" : ""}>
                Endereço (rua, número e bairro)
                <input value={form.endereco} onChange={muda("endereco")} maxLength={160} autoComplete="street-address" />
              </label>
              <label>
                Ponto de referência (opcional)
                <input value={form.referencia} onChange={muda("referencia")} maxLength={120} />
              </label>
            </>
          )}
          <p className={`online-rotulo ${erro.campo === "pagamento" ? "erro" : ""}`}>Pagamento na {modo === "entrega" ? "entrega" : "retirada"}</p>
          <div className="online-opcoes">
            {PAGAMENTOS.map((p) => (
              <button type="button" key={p} className={form.pagamento === p ? "ativo" : ""} aria-pressed={form.pagamento === p} onClick={() => { setForm({ ...form, pagamento: p }); if (erro.campo === "pagamento") setErro({ texto: "", campo: "" }); }}>
                {p}
              </button>
            ))}
          </div>
          {form.pagamento === "Dinheiro" && (
            <label>
              Troco para quanto? (opcional)
              <input value={form.troco} onChange={muda("troco")} inputMode="decimal" placeholder="Ex.: 50" maxLength={8} />
            </label>
          )}
          <label>
            Observação (opcional)
            <input value={form.obs} onChange={muda("obs")} maxLength={200} placeholder="Ex.: sem cebola, interfone 12" />
          </label>

          <div className="online-totais">
            <span>Itens</span>
            <span>R$ {moeda(subtotal)}</span>
            {modo === "entrega" && (
              <>
                <span>Entrega</span>
                <span>R$ {moeda(taxaEntrega)}</span>
              </>
            )}
            <strong>Total</strong>
            <strong>R$ {moeda(total)}</strong>
          </div>
          {erro.texto && <p className="online-erro">{erro.texto}</p>}
          <button type="button" className="online-btn" disabled={enviando || !linhas.length} onClick={enviar}>
            {enviando ? "Enviando…" : `Enviar pedido · R$ ${moeda(total)}`}
          </button>
        </section>
      ) : (
        <>
          <PedidoRapido
            categorias={produtos}
            contagem={(item) => porProduto[item.id] || 0}
            onTocar={(item) => (aberta ? adicionar(item) : null)}
            emoji={emojiCategoria}
            indisponivel={esgotado}
            montar={montarLigado}
          />
          {aberta && qtdItens > 0 && (
            <div className="online-barra">
              <button type="button" className="online-btn" onClick={() => setEtapa("dados")}>
                Ver pedido · {qtdItens} {qtdItens === 1 ? "item" : "itens"} · R$ {moeda(subtotal)}
              </button>
            </div>
          )}
        </>
      )}
      {perguntar && (
        <PratoNoPedido
          produto={perguntar}
          linhas={linhasDoProduto(perguntar.id)}
          onEditar={editarLinha}
          onMaisUm={() => { setEditando(null); setMontando(perguntar); setPerguntar(null); }}
          onFechar={() => setPerguntar(null)}
        />
      )}

      {montando && (
        <MontarPrato
          key={editando || "novo"}
          produto={montando}
          inicial={editando ? carrinho[editando]?.montagem : null}
          textoBotao={editando ? "Salvar alteração" : "Adicionar"}
          onAdicionar={adicionarMontado}
          onFechar={() => { setMontando(null); setEditando(null); }}
        />
      )}
    </div>
  );
}
