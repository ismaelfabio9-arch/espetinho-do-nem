import { L } from "../../loja";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import "../../styles/Garcom/MesaDetalhe.css";
import { ordenarGruposPorCategoria } from "../../utils/categorias";
import { ordenarItensCategoria } from "../../utils/produtosOrdem";
import PedidoRapido from "../../components/PedidoRapido";
import MontarPrato from "../../components/MontarPrato";
import PratoNoPedido from "../../components/PratoNoPedido";
import { emojiCategoria, sugestoesBebida, abreEscolha } from "../../utils/montagem";
import { useConfigImpressora } from "../../hooks/useConfigImpressora";
import { useRecurso } from "../../recursos";
import { useFotos } from "../../utils/fotos";
import { gerarComandaHTML, imprimir } from "../../utils/print";
import { numeroDoPedido } from "../../utils/numeroPedido";
import { moeda, useEntrega } from "../../utils/entrega";

const PAGAMENTOS = ["Dinheiro", "Pix", "Cartão"];
const soDigitos = (t) => String(t || "").replace(/\D/g, "");
const numeroDe = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

/**
 * Pedido de balcão (o cliente leva) ou de entrega lançada pelo garçom (telefone/WhatsApp).
 * modo "balcao" é o pedido para viagem de sempre; modo "entrega" pede os dados do cliente no fim.
 * topo: o que vai no lugar do "← Voltar" (as abas da tela Novo pedido).
 */
function Viagem({ modo = "balcao", topo = null }) {
  const entregaCfg = useEntrega();
  const ehEntrega = modo === "entrega";
  const [dadosEntrega, setDadosEntrega] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [categoriasDocs, setCategoriasDocs] = useState([]);
  // Prato com montagem aberto na janela "Montar o prato" (igual às mesas).
  const [montando, setMontando] = useState(null);
  // Prato que já está no pedido atual: pergunta se edita ou acrescenta mais um.
  const [perguntar, setPerguntar] = useState(null);
  const [editando, setEditando] = useState(null); // nome da linha do pedido que está sendo editada
  // Depois de salvar: pergunta se imprime na cozinha (a janela de impressão só abre direito num toque).
  const [paraImprimir, setParaImprimir] = useState(null); // { itens, total, cliente, numero }
  const configImpressora = useConfigImpressora();
  const montarLigado = useRecurso("montar-prato");
  const fotos = useFotos(useRecurso("fotos"));
  const imprimirLigado = useRecurso("imprimir-cozinha");
  const [pedido, setPedido] = useState({});
  const [notificacao, setNotificacao] = useState("");
  const [nomeCliente, setNomeCliente] = useState("");
  const [nomeClienteInput, setNomeClienteInput] = useState("");
  const [editandoNomeCliente, setEditandoNomeCliente] = useState(false);

  useEffect(() => {
    const cancelar = onSnapshot(collection(db, ...L(), "categorias"), (snapshot) => {
      setCategoriasDocs(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => cancelar();
  }, []);

  useEffect(() => {
    const cancelar = onSnapshot(collection(db, ...L(), "produtos"), (snapshot) => {
      const listaProdutos = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      const produtosAtivos = listaProdutos.filter(
        (produto) => produto.ativo !== false && produto.foraHoje !== true
      );

      const grupos = produtosAtivos.reduce((resultado, produto) => {
        if (!resultado[produto.categoria]) {
          resultado[produto.categoria] = {
            categoria: produto.categoria,
            itens: [],
          };
        }

        resultado[produto.categoria].itens.push({
          id: produto.id,
          nome: produto.nome,
          preco: Number(produto.preco || 0),
          ordem: produto.ordem,
          montagem: produto.montagem || null,
          tipo: produto.tipo || null,
        });

        return resultado;
      }, {});

      const listaCategorias = Object.values(grupos);

      listaCategorias.forEach((categoria) => {
        categoria.itens = ordenarItensCategoria(categoria.itens);
      });

      setProdutos(ordenarGruposPorCategoria(listaCategorias, categoriasDocs));
    });

    return () => cancelar();
  }, [categoriasDocs]);

  const linhasDoProduto = (id) =>
    Object.values(pedido)
      .filter((l) => l.produtoId === id && l.montagem)
      .map((l) => ({ ...l, chave: l.nome, quantidade: l.qtd }));
  const produtoPorId = (id) => produtos.flatMap((g) => g.itens || []).find((i) => i.id === id);

  function editarLinha(l) {
    const item = produtoPorId(l.produtoId);
    if (!item) return;
    setPerguntar(null);
    setEditando(l.nome);
    setMontando(item);
  }

  function tocarItem(item) {
    if (abreEscolha(item, montarLigado)) {
      if (linhasDoProduto(item.id).length) return setPerguntar(item);
      setEditando(null);
      setMontando(item);
    } else adicionarItem(item);
  }

  /** Prato montado (e as bebidas escolhidas junto) entram no pedido. */
  function adicionarMontado({ prato, bebidas, qtd: quantos = 1 }) {
    setPedido((atual) => {
      const novo = { ...atual };
      // Editando: a linha antiga sai e a nova fica com a mesma quantidade.
      const antiga = editando ? atual[editando] : null;
      if (antiga) delete novo[editando];
      const ja = novo[prato.nome];
      const qtd = antiga ? antiga.qtd : quantos;
      novo[prato.nome] = { ...prato, qtd: ja ? ja.qtd + qtd : qtd };
      bebidas.forEach((b) => {
        const jb = novo[b.nome];
        novo[b.nome] = { produtoId: b.id, nome: b.nome, preco: b.preco, qtd: jb ? jb.qtd + 1 : 1 };
      });
      return novo;
    });
    setMontando(null);
    setEditando(null);
  }

  function ajustarItemPedido(nome, delta) {
    setPedido((atual) => {
      const it = atual[nome];
      if (!it) return atual;
      const novo = { ...atual };
      if (it.qtd + delta <= 0) delete novo[nome];
      else novo[nome] = { ...it, qtd: it.qtd + delta };
      return novo;
    });
  }

  function adicionarItem(item) {
    setPedido((pedidoAtual) => {
      const itemAtual = pedidoAtual[item.nome];

      return {
        ...pedidoAtual,
        [item.nome]: {
          produtoId: item.id,
          nome: item.nome,
          preco: item.preco,
          qtd: itemAtual ? itemAtual.qtd + 1 : 1,
        },
      };
    });
  }

  function limparPedido() {
    setPedido({});
    setNomeCliente("");
    setNomeClienteInput("");
    setDadosEntrega(null);
  }

  function salvarNomeCliente() {
    setNomeCliente(nomeClienteInput.trim());
    setEditandoNomeCliente(false);
  }

  function mostrarNotificacao(texto) {
    setNotificacao(texto);

    setTimeout(() => {
      setNotificacao("");
    }, 2500);
  }

  const itensPedido = Object.values(pedido).sort((a, b) => {
    if (a.preco !== b.preco) {
      return a.preco - b.preco;
    }

    return a.nome.localeCompare(b.nome);
  });

  const total = itensPedido.reduce((soma, item) => {
    return soma + item.preco * item.qtd;
  }, 0);

  const totalItens = itensPedido.reduce((soma, item) => {
    return soma + item.qtd;
  }, 0);

  function formatarMoeda(valor) {
    return Number(valor).toFixed(2).replace(".", ",");
  }

  // ✅ CORREÇÃO BUG 2: função de baixar estoque adicionada
  async function baixarEstoque(itens) {
    for (const item of itens) {
      if (!item.produtoId) continue;

      const estoqueRef = doc(db, ...L(), "estoque", item.produtoId);
      const estoqueSnap = await getDoc(estoqueRef);

      if (!estoqueSnap.exists()) continue;

      const quantidadeAtual = Number(estoqueSnap.data().quantidade || 0);
      const quantidadePedida = Number(item.qtd || 0);
      const novaQuantidade = Math.max(0, quantidadeAtual - quantidadePedida);

      await setDoc(
        estoqueRef,
        {
          quantidade: novaQuantidade,
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );

      if (novaQuantidade === 0 && quantidadeAtual > 0) {
        await addDoc(collection(db, ...L(), "notificacoes"), {
          tipo: "estoque",
          mensagem: `${item.nome} acabou no estoque`,
          produtoId: item.produtoId,
          produto: item.nome,
          lida: false,
          horario: new Date().toISOString(),
          criadoEm: serverTimestamp(),
        });
      }
    }
  }

  async function imprimirViagem(p) {
    const html = gerarComandaHTML({
      // Entrega já tem número curto (o que o cliente recebe); o código comprido do Firebase vira 1, 2, 3...
      numeroPedido: String(p.numero || "").length > 12 ? await numeroDoPedido(p.numero) : p.numero,
      titulo: p.titulo || "PARA VIAGEM",
      cliente: p.cliente,
      itens: p.itens,
      total: p.total,
      ...(p.observacoes ? { observacoes: p.observacoes } : {}),
      config: configImpressora,
    });
    return imprimir(html, configImpressora.larguraPapel);
  }

  async function confirmarImpressaoCozinha() {
    const p = paraImprimir;
    setParaImprimir(null);
    if (!p) return;
    const abriu = await imprimirViagem(p);
    if (!abriu) mostrarNotificacao("O celular bloqueou a janela de impressão. Libere as janelas (pop-ups) do site e tente de novo.");
  }

  function abrirDadosEntrega() {
    if (itensPedido.length === 0) {
      mostrarNotificacao("Adicione pelo menos 1 item antes de salvar.");
      return;
    }
    setDadosEntrega((d) => d ? { ...d, aberto: true } : {
      aberto: true,
      cliente: nomeCliente,
      telefone: "",
      endereco: "",
      referencia: "",
      taxa: entregaCfg.taxa ? moeda(entregaCfg.taxa) : "",
      pagamento: "",
      troco: "",
      obs: "",
      erro: "",
    });
  }

  async function salvarPedidoEntrega() {
    const d = dadosEntrega;
    const cliente = d.cliente.trim();
    const telefone = soDigitos(d.telefone);
    const endereco = d.endereco.trim();
    const erro = !cliente
      ? "Coloque o nome do cliente."
      : telefone.length < 8
        ? "Coloque o telefone ou WhatsApp do cliente."
        : endereco.length < 5
          ? "Coloque o endereço da entrega."
          : !d.pagamento
            ? "Escolha como o cliente vai pagar."
            : "";
    if (erro) return setDadosEntrega({ ...d, erro });

    const taxaEntrega = numeroDe(d.taxa);
    const subtotal = Math.round(total * 100) / 100;
    const totalComTaxa = Math.round((subtotal + taxaEntrega) * 100) / 100;
    const trocoNum = numeroDe(d.troco);
    const troco = d.pagamento === "Dinheiro" && trocoNum > totalComTaxa ? trocoNum : null;
    const agora = Date.now();
    const numero = agora.toString(36).slice(-4).toUpperCase();
    const referencia = d.referencia.trim();
    const obs = d.obs.trim();
    const dadosPedido = {
      idLocal: agora,
      tipo: "entrega",
      modo: "entrega",
      origem: "manual",
      numero,
      titulo: `Entrega #${numero} - ${cliente}`,
      cliente,
      telefone,
      endereco,
      referencia,
      pagamento: d.pagamento,
      troco,
      obs,
      itens: itensPedido,
      subtotal,
      taxaEntrega,
      total: totalComTaxa,
      totalItens,
      status: "aberto",
      salvoEm: new Date(agora).toISOString(),
      criadoEm: serverTimestamp(),
    };
    setDadosEntrega({ ...d, erro: "", salvando: true });
    try {
      await addDoc(collection(db, ...L(), "pedidos"), dadosPedido);
      await baixarEstoque(itensPedido);
      await addDoc(collection(db, ...L(), "notificacoes"), {
        tipo: "pedido",
        mensagem: `Nova entrega #${numero} - ${cliente}`,
        total: totalComTaxa,
        totalItens,
        horario: new Date().toISOString(),
        criadoEm: serverTimestamp(),
      });
      setPedido({});
      setNomeCliente("");
      setNomeClienteInput("");
      setDadosEntrega(null);
      mostrarNotificacao(`Entrega #${numero} salva!`);
      if (configImpressora.habilitada && imprimirLigado) {
        const observacoes = [
          `Tel: ${telefone}`,
          `Entrega: ${endereco}${referencia ? ` (ref.: ${referencia})` : ""}`,
          `Pagamento na entrega: ${d.pagamento}${troco ? ` - troco para R$ ${moeda(troco)}` : ""}`,
          taxaEntrega ? `Taxa de entrega: R$ ${moeda(taxaEntrega)}` : "",
          obs ? `Obs: ${obs}` : "",
        ].filter(Boolean).join(" | ");
        const p = { itens: itensPedido, total: totalComTaxa, cliente, numero, titulo: "ENTREGA", observacoes };
        const impresso = configImpressora.autoImprimirPedido ? await imprimirViagem(p) : false;
        if (!impresso) setParaImprimir(p);
      }
    } catch (e) {
      console.error("Erro ao salvar entrega:", e);
      setDadosEntrega((x) => x && { ...x, salvando: false, erro: "Não foi possível salvar. Confira a internet e tente de novo." });
    }
  }

  const salvar = () => (ehEntrega ? abrirDadosEntrega() : salvarPedidoViagem());

  async function salvarPedidoViagem() {
    if (itensPedido.length === 0) {
      mostrarNotificacao("Adicione pelo menos 1 item antes de salvar.");
      return;
    }

    const idPedido = Date.now();

    const tituloViagem = nomeCliente
      ? `Pedido Viagem - ${nomeCliente}`
      : "Pedido Viagem";

    const dadosPedido = {
      idLocal: idPedido,
      tipo: "viagem",
      cliente: nomeCliente,
      titulo: tituloViagem,
      itens: itensPedido,
      total,
      totalItens,
      status: "aberto",
      salvoEm: new Date().toISOString(),
      criadoEm: serverTimestamp(),
    };

    try {
      const salvo = await addDoc(collection(db, ...L(), "pedidos"), dadosPedido);

      // ✅ CORREÇÃO BUG 2: baixa estoque após salvar pedido viagem
      await baixarEstoque(itensPedido);

      await addDoc(collection(db, ...L(), "notificacoes"), {
        tipo: "pedido",
        mensagem: nomeCliente
          ? `Novo pedido viagem - ${nomeCliente}`
          : "Novo pedido viagem",
        total,
        totalItens,
        horario: new Date().toISOString(),
        criadoEm: serverTimestamp(),
      });

      setPedido({});
      setNomeCliente("");
      setNomeClienteInput("");
      mostrarNotificacao("Pedido viagem salvo com sucesso!");

      if (configImpressora.habilitada && imprimirLigado) {
        const p = { itens: itensPedido, total, cliente: nomeCliente, numero: salvo.id };
        // "Imprimir automaticamente" ligado na configuração: tenta direto; se o celular bloquear, pergunta.
        const impresso = configImpressora.autoImprimirPedido ? await imprimirViagem(p) : false;
        if (!impresso) setParaImprimir(p);
      }
    } catch (erro) {
      console.error("Erro ao salvar pedido viagem:", erro);
      mostrarNotificacao("Erro ao salvar no Firebase.");
    }
  }

  return (
    <div className="mesa-page">
      {notificacao && <div className="toast">✅ {notificacao}</div>}

      {editandoNomeCliente && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-icon">✏️</div>

            <h2>Nome do cliente</h2>

            <p>Identifique o pedido viagem.</p>

            <input
              className="input-cliente-mesa"
              type="text"
              placeholder="Ex: Allan"
              value={nomeClienteInput}
              onChange={(e) => setNomeClienteInput(e.target.value)}
              autoFocus
            />

            <div className="modal-acoes">
              <button
                type="button"
                className="modal-btn cancelar"
                onClick={() => {
                  setEditandoNomeCliente(false);
                  setNomeClienteInput(nomeCliente);
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="modal-btn confirmar"
                onClick={salvarNomeCliente}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {dadosEntrega?.aberto && (() => {
        const d = dadosEntrega;
        const muda = (campo) => (e) => setDadosEntrega({ ...d, [campo]: e.target.value, erro: "" });
        const taxa = numeroDe(d.taxa);
        return (
          <div className="modal-overlay" onClick={() => !d.salvando && setDadosEntrega({ ...d, aberto: false })}>
            <div className="modal-card entrega-dados" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Dados da entrega">
              <h2>🛵 Dados da entrega</h2>
              <label>Nome do cliente<input value={d.cliente} onChange={muda("cliente")} maxLength={60} autoFocus /></label>
              <label>Telefone / WhatsApp<input value={d.telefone} onChange={muda("telefone")} inputMode="tel" maxLength={20} placeholder="(81) 9 9999-9999" /></label>
              <label>Endereço (rua, número e bairro)<input value={d.endereco} onChange={muda("endereco")} maxLength={140} /></label>
              <label>Ponto de referência (opcional)<input value={d.referencia} onChange={muda("referencia")} maxLength={100} /></label>
              <label>Taxa de entrega (R$)<input value={d.taxa} onChange={muda("taxa")} inputMode="decimal" placeholder="0,00" /></label>
              <div className="entrega-pagamento" role="radiogroup" aria-label="Pagamento na entrega">
                {PAGAMENTOS.map((f) => (
                  <button type="button" key={f} className={d.pagamento === f ? "ativo" : ""} aria-pressed={d.pagamento === f} onClick={() => setDadosEntrega({ ...d, pagamento: f, erro: "" })}>
                    {f}
                  </button>
                ))}
              </div>
              {d.pagamento === "Dinheiro" && (
                <label>Troco para quanto? (opcional)<input value={d.troco} onChange={muda("troco")} inputMode="decimal" placeholder="Ex.: 100" /></label>
              )}
              <label>Observação (opcional)<input value={d.obs} onChange={muda("obs")} maxLength={200} /></label>
              <div className="entrega-totais">
                <span>Itens</span><strong>R$ {moeda(total)}</strong>
                <span>Entrega</span><strong>R$ {moeda(taxa)}</strong>
                <span>Total</span><strong>R$ {moeda(total + taxa)}</strong>
              </div>
              {d.erro && <p className="entrega-erro">{d.erro}</p>}
              <div className="modal-acoes">
                <button type="button" className="modal-btn cancelar" onClick={() => setDadosEntrega({ ...d, aberto: false })}>
                  Voltar
                </button>
                <button type="button" className="modal-btn confirmar" disabled={d.salvando} onClick={salvarPedidoEntrega} data-atalho="F8">
                  {d.salvando ? "Salvando…" : "Salvar entrega"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {paraImprimir && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-icon">🖨️</div>
            <h2>{paraImprimir.titulo === "ENTREGA" ? "Entrega salva" : "Pedido viagem salvo"}</h2>
            <p>{`Imprimir ${paraImprimir.itens.reduce((s, i) => s + Number(i.qtd || 0), 0)} item(ns) na cozinha?`}</p>
            <div className="modal-acoes">
              <button type="button" className="modal-btn cancelar" onClick={() => setParaImprimir(null)}>
                Agora não
              </button>
              <button type="button" className="modal-btn confirmar" onClick={confirmarImpressaoCozinha} data-atalho="F1">
                Imprimir na cozinha
              </button>
            </div>
          </div>
        </div>
      )}

      {topo || (
        <Link className="voltar" to="/">
          ← Voltar
        </Link>
      )}

      <div className="mesa-topo">
        <div>
          <span>Pedido</span>

          <div className="mesa-titulo-cliente">
            <h1>
              {ehEntrega ? "Entrega" : "Viagem"}
              {nomeCliente ? ` - ${nomeCliente}` : ""}
            </h1>

            {!ehEntrega && <button onClick={() => setEditandoNomeCliente(true)}>✏️</button>}
          </div>
        </div>

        <div className="mesa-total">
          <span>Total atual</span>
          <strong>R$ {formatarMoeda(total)}</strong>
        </div>
      </div>

      <div className="acoes-mesa">
        <button className="btn-verde" onClick={salvar} data-atalho="F8">
          {ehEntrega ? "Continuar para a entrega" : "Salvar pedido viagem"}
        </button>

        <button className="btn-cinza" onClick={limparPedido}>
          Limpar pedido
        </button>
      </div>

      {itensPedido.length > 0 && (
        <div className="resumo-pedido">
          <h3>Pedido atual</h3>

          {itensPedido.map((item) => (
            <div className="resumo-linha resumo-linha-editavel" key={item.nome}>
              <span>
                {item.qtd}x {item.nome}
                {item.montagem && produtoPorId(item.produtoId) && (
                  <button type="button" className="resumo-editar" onClick={() => editarLinha(item)}>
                    ✏️ Editar
                  </button>
                )}
              </span>

              <strong>R$ {formatarMoeda(item.preco * item.qtd)}</strong>

              <div className="contador resumo-contador">
                <button onClick={() => ajustarItemPedido(item.nome, -1)}>-</button>
                <span>{item.qtd}</span>
                <button onClick={() => ajustarItemPedido(item.nome, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="titulo-secao">Adicionar pedido</h2>

      {montando && (
        <MontarPrato
          key={editando || "novo"}
          produto={montando}
          foto={fotos[montando.id] || null}
          fotos={fotos}
          bebidas={editando ? [] : sugestoesBebida(produtos)}
          permitirOutros
          inicial={editando ? pedido[editando]?.montagem : null}
          textoBotao={editando ? "Salvar alteração" : "Adicionar"}
          onAdicionar={adicionarMontado}
          onFechar={() => { setMontando(null); setEditando(null); }}
        />
      )}

      {perguntar && (
        <PratoNoPedido
          produto={perguntar}
          linhas={linhasDoProduto(perguntar.id)}
          onEditar={editarLinha}
          onMaisUm={() => { setEditando(null); setMontando(perguntar); setPerguntar(null); }}
          onFechar={() => setPerguntar(null)}
          noPedido="neste pedido"
        />
      )}

      {produtos.length === 0 ? (
        <div className="card-principal">
          <h2>Nenhum produto para hoje</h2>
          <p>Cadastre em Produtos ou ligue os pratos em Cardápio de hoje.</p>
        </div>
      ) : (
        <PedidoRapido
          categorias={produtos}
          emoji={emojiCategoria}
          montar={montarLigado}
          contagem={(item) => itensPedido.filter((p) => p.produtoId === item.id).reduce((s, p) => s + p.qtd, 0)}
          onTocar={tocarItem}
          fotos={fotos}
        />
      )}

      {totalItens > 0 && (
        <div className="barra-pedido">
          <div>
            <strong>{totalItens} itens</strong>
            <span>R$ {formatarMoeda(total)}</span>
          </div>

          <button onClick={salvar}>{ehEntrega ? "Continuar" : "Salvar Pedido"}</button>
        </div>
      )}
    </div>
  );
}

export default Viagem;