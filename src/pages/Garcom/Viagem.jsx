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
import { emojiCategoria, sugestoesBebida, temMontagem } from "../../utils/montagem";
import { useConfigImpressora } from "../../hooks/useConfigImpressora";
import { useRecurso } from "../../recursos";
import { gerarComandaHTML, imprimir } from "../../utils/print";

function Viagem() {
  const [produtos, setProdutos] = useState([]);
  const [categoriasDocs, setCategoriasDocs] = useState([]);
  // Prato com montagem aberto na janela "Montar o prato" (igual às mesas).
  const [montando, setMontando] = useState(null);
  // Depois de salvar: pergunta se imprime na cozinha (a janela de impressão só abre direito num toque).
  const [paraImprimir, setParaImprimir] = useState(null); // { itens, total, cliente, numero }
  const configImpressora = useConfigImpressora();
  const montarLigado = useRecurso("montar-prato");
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

  function tocarItem(item) {
    if (montarLigado && temMontagem(item)) setMontando(item);
    else adicionarItem(item);
  }

  /** Prato montado (e as bebidas escolhidas junto) entram no pedido. */
  function adicionarMontado({ prato, bebidas }) {
    setPedido((atual) => {
      const novo = { ...atual };
      const ja = novo[prato.nome];
      novo[prato.nome] = { ...prato, qtd: ja ? ja.qtd + 1 : 1 };
      bebidas.forEach((b) => {
        const jb = novo[b.nome];
        novo[b.nome] = { produtoId: b.id, nome: b.nome, preco: b.preco, qtd: jb ? jb.qtd + 1 : 1 };
      });
      return novo;
    });
    setMontando(null);
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

  function imprimirViagem(p) {
    const html = gerarComandaHTML({
      numeroPedido: p.numero,
      titulo: "PARA VIAGEM",
      cliente: p.cliente,
      itens: p.itens,
      total: p.total,
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

      {paraImprimir && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-icon">🖨️</div>
            <h2>Pedido viagem salvo</h2>
            <p>{`Imprimir ${paraImprimir.itens.reduce((s, i) => s + Number(i.qtd || 0), 0)} item(ns) na cozinha?`}</p>
            <div className="modal-acoes">
              <button type="button" className="modal-btn cancelar" onClick={() => setParaImprimir(null)}>
                Agora não
              </button>
              <button type="button" className="modal-btn confirmar" onClick={confirmarImpressaoCozinha}>
                Imprimir na cozinha
              </button>
            </div>
          </div>
        </div>
      )}

      <Link className="voltar" to="/">
        ← Voltar
      </Link>

      <div className="mesa-topo">
        <div>
          <span>Pedido</span>

          <div className="mesa-titulo-cliente">
            <h1>
              Viagem
              {nomeCliente ? ` - ${nomeCliente}` : ""}
            </h1>

            <button onClick={() => setEditandoNomeCliente(true)}>✏️</button>
          </div>
        </div>

        <div className="mesa-total">
          <span>Total atual</span>
          <strong>R$ {formatarMoeda(total)}</strong>
        </div>
      </div>

      <div className="acoes-mesa">
        <button className="btn-verde" onClick={salvarPedidoViagem}>
          Salvar pedido viagem
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
          produto={montando}
          bebidas={sugestoesBebida(produtos)}
          permitirOutros
          onAdicionar={adicionarMontado}
          onFechar={() => setMontando(null)}
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
        />
      )}

      {totalItens > 0 && (
        <div className="barra-pedido">
          <div>
            <strong>{totalItens} itens</strong>
            <span>R$ {formatarMoeda(total)}</span>
          </div>

          <button onClick={salvarPedidoViagem}>Salvar Pedido</button>
        </div>
      )}
    </div>
  );
}

export default Viagem;