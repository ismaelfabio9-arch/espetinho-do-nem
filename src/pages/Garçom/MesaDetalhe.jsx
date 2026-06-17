import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import "../../styles/Garçom/MesaDetalhe.css";

function MesaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [produtos, setProdutos] = useState([]);
  const [categoriaAberta, setCategoriaAberta] = useState("");
  const [pedido, setPedido] = useState({});
  const [pedidoMesa, setPedidoMesa] = useState(null);
  const [pedidoMesaId, setPedidoMesaId] = useState(null);
  const [todosPedidosIds, setTodosPedidosIds] = useState([]); // ✅ CORREÇÃO BUG 4
  const [mostrarPedidoMesa, setMostrarPedidoMesa] = useState(false);
  const [nomeCliente, setNomeCliente] = useState("");
  const [nomeClienteInput, setNomeClienteInput] = useState("");
  const [editandoNomeCliente, setEditandoNomeCliente] = useState(false);
  const [notificacao, setNotificacao] = useState("");
  const [encerrando, setEncerrando] = useState(false);
  const [mostrarModalEncerrarMesa, setMostrarModalEncerrarMesa] = useState(false);

  useEffect(() => {
    const cancelar = onSnapshot(doc(db, "mesas", String(id)), (documento) => {
      if (documento.exists()) {
        const cliente = documento.data().cliente || "";
        setNomeCliente(cliente);
        setNomeClienteInput(cliente);
      } else {
        setNomeCliente("");
        setNomeClienteInput("");
      }
    });

    return () => cancelar();
  }, [id]);

  useEffect(() => {
    const cancelar = onSnapshot(collection(db, "produtos"), (snapshot) => {
      const listaProdutos = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      const produtosAtivos = listaProdutos.filter(
        (produto) => produto.ativo !== false
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
        });

        return resultado;
      }, {});

      const listaCategorias = Object.values(grupos);

      listaCategorias.forEach((categoria) => {
        categoria.itens.sort((a, b) => a.preco - b.preco);
      });

      setProdutos(listaCategorias);
    });

    return () => cancelar();
  }, []);

  useEffect(() => {
    const pedidosRef = collection(db, "pedidos");

    const consultaMesa = query(
  pedidosRef,
  where("tipo", "==", "mesa")
);

    const cancelar = onSnapshot(consultaMesa, (snapshot) => {
      if (snapshot.empty) {
        setPedidoMesa(null);
        setPedidoMesaId(null);
        setTodosPedidosIds([]); // ✅ CORREÇÃO BUG 4
        return;
      }

      const pedidosDaMesa = snapshot.docs
  .map((documento) => ({
    id: documento.id,
    ...documento.data(),
  }))
  .filter((pedido) => Number(pedido.mesa) === Number(id));

if (pedidosDaMesa.length === 0) {
  setPedidoMesa(null);
  setPedidoMesaId(null);
  setTodosPedidosIds([]);
  return;
}

      // ✅ CORREÇÃO BUG 4: guarda todos os ids, não só o primeiro
      const idsEncontrados = pedidosDaMesa.map((p) => p.id);
      setTodosPedidosIds(idsEncontrados);

      const todosItens = pedidosDaMesa.flatMap((pedido) => pedido.itens || []);

      const itensAgrupados = todosItens.reduce((resultado, item) => {
        const nome = item.nome;

        if (!resultado[nome]) {
          resultado[nome] = {
            nome: item.nome,
            preco: Number(item.preco || 0),
            qtd: 0,
          };
        }

        resultado[nome].qtd += Number(item.qtd || item.quantidade || 0);

        return resultado;
      }, {});

      const itensOrdenados = Object.values(itensAgrupados).sort((a, b) => {
        const totalA = Number(a.preco || 0) * Number(a.qtd || 0);
        const totalB = Number(b.preco || 0) * Number(b.qtd || 0);

        if (totalA !== totalB) return totalA - totalB;

        return a.nome.localeCompare(b.nome);
      });

      setPedidoMesa({
        id: pedidosDaMesa[0].id,
        pedidosIds: idsEncontrados,
        tipo: "mesa",
        mesa: Number(id),
        itens: itensOrdenados,
        total: itensOrdenados.reduce(
          (soma, item) => soma + Number(item.preco || 0) * Number(item.qtd || 0),
          0
        ),
        totalItens: itensOrdenados.reduce(
          (soma, item) => soma + Number(item.qtd || 0),
          0
        ),
      });

      setPedidoMesaId(pedidosDaMesa[0].id);
    });

    return () => cancelar();
  }, [id]);

  function alternarCategoria(nomeCategoria) {
    setCategoriaAberta(categoriaAberta === nomeCategoria ? "" : nomeCategoria);
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

  function removerItem(item) {
    setPedido((pedidoAtual) => {
      const itemAtual = pedidoAtual[item.nome];

      if (!itemAtual) return pedidoAtual;

      if (itemAtual.qtd === 1) {
        const novoPedido = { ...pedidoAtual };
        delete novoPedido[item.nome];
        return novoPedido;
      }

      return {
        ...pedidoAtual,
        [item.nome]: {
          ...itemAtual,
          qtd: itemAtual.qtd - 1,
        },
      };
    });
  }

  function mostrarNotificacao(texto) {
    setNotificacao(texto);
    setTimeout(() => setNotificacao(""), 2500);
  }

  function formatarMoeda(valor) {
    return Number(valor).toFixed(2).replace(".", ",");
  }

  async function salvarNomeCliente() {
    await setDoc(
      doc(db, "mesas", String(id)),
      {
        numero: Number(id),
        cliente: nomeClienteInput.trim(),
      },
      { merge: true }
    );

    setEditandoNomeCliente(false);
    mostrarNotificacao("Nome do cliente salvo!");
  }

  const itensPedido = Object.values(pedido).sort(
    (a, b) => Number(a.preco) - Number(b.preco)
  );

  const total = itensPedido.reduce(
    (soma, item) => soma + item.preco * item.qtd,
    0
  );

  const totalItens = itensPedido.reduce((soma, item) => soma + item.qtd, 0);

  const itensMesa = pedidoMesa?.itens || [];

  const totalMesa = itensMesa.reduce(
    (soma, item) => soma + Number(item.preco || 0) * Number(item.qtd || 0),
    0
  );

  const totalItensMesa = itensMesa.reduce(
    (soma, item) => soma + Number(item.qtd || 0),
    0
  );

  const totalGeralMesa = totalMesa + total;

  // ✅ CORREÇÃO BUG 4: atualiza sempre o primeiro pedido com os itens agrupados de todos
  async function atualizarPedidoMesa(novosItens) {
    if (!pedidoMesaId) return;

    if (novosItens.length === 0) {
      // Se ficou sem itens, apaga todos os pedidos da mesa
      for (const pedidoId of todosPedidosIds) {
        await deleteDoc(doc(db, "pedidos", pedidoId));
      }
      setMostrarPedidoMesa(false);
      mostrarNotificacao("Pedido da mesa removido.");
      return;
    }

    const novoTotal = novosItens.reduce(
      (soma, item) => soma + Number(item.preco || 0) * Number(item.qtd || 0),
      0
    );

    const novoTotalItens = novosItens.reduce(
      (soma, item) => soma + Number(item.qtd || 0),
      0
    );

    // Consolida tudo no primeiro pedido
    await updateDoc(doc(db, "pedidos", pedidoMesaId), {
      itens: novosItens,
      total: novoTotal,
      totalItens: novoTotalItens,
      atualizadoEm: new Date().toISOString(),
    });

    // ✅ CORREÇÃO BUG 4: apaga pedidos extras se houver mais de um
    for (const pedidoId of todosPedidosIds) {
      if (pedidoId !== pedidoMesaId) {
        await deleteDoc(doc(db, "pedidos", pedidoId));
      }
    }
  }

  async function aumentarItemMesa(itemSelecionado) {
    const novosItens = itensMesa.map((item) =>
      item.nome === itemSelecionado.nome
        ? { ...item, qtd: Number(item.qtd || 0) + 1 }
        : item
    );

    await atualizarPedidoMesa(novosItens);
  }

  async function diminuirItemMesa(itemSelecionado) {
    const novosItens = itensMesa
      .map((item) =>
        item.nome === itemSelecionado.nome
          ? { ...item, qtd: Number(item.qtd || 0) - 1 }
          : item
      )
      .filter((item) => Number(item.qtd || 0) > 0);

    await atualizarPedidoMesa(novosItens);
  }

  async function salvarPedido() {
    if (itensPedido.length === 0) {
      mostrarNotificacao("Adicione pelo menos 1 item antes de salvar.");
      return;
    }

    try {
      const pedidosRef = collection(db, "pedidos");

      const consultaMesaAberta = query(
        pedidosRef,
        where("tipo", "==", "mesa"),
        where("mesa", "==", Number(id))
      );

      const resultado = await getDocs(consultaMesaAberta);

      if (!resultado.empty) {
        const documentoMesa = resultado.docs[0];
        const pedidoAtual = documentoMesa.data();

        const itensAntigos = pedidoAtual.itens || [];
        const itensNovos = [...itensAntigos];

        itensPedido.forEach((novoItem) => {
          const itemExistente = itensNovos.find(
            (item) => item.nome === novoItem.nome
          );

          if (itemExistente) {
            itemExistente.qtd += novoItem.qtd;
          } else {
            itensNovos.push(novoItem);
          }
        });

        const novoTotal = itensNovos.reduce(
          (soma, item) => soma + Number(item.preco || 0) * Number(item.qtd || 0),
          0
        );

        const novoTotalItens = itensNovos.reduce(
          (soma, item) => soma + Number(item.qtd || 0),
          0
        );

        await updateDoc(doc(db, "pedidos", documentoMesa.id), {
          itens: itensNovos,
          total: novoTotal,
          totalItens: novoTotalItens,
          atualizadoEm: new Date().toISOString(),
        });
      } else {
        const idPedido = Date.now();

        await addDoc(collection(db, "pedidos"), {
          idLocal: idPedido,
          tipo: "mesa",
          mesa: Number(id), // ✅ já estava correto aqui
          titulo: `Mesa ${id}`,
          itens: itensPedido,
          total,
          totalItens,
          status: "aberto",
          salvoEm: new Date().toISOString(),
          criadoEm: serverTimestamp(),
        });
      }

      for (const item of itensPedido) {
        if (!item.produtoId) continue;

        const estoqueRef = doc(db, "estoque", item.produtoId);
        const estoqueSnap = await getDoc(estoqueRef);

        if (estoqueSnap.exists()) {
          const quantidadeAtual = Number(estoqueSnap.data().quantidade || 0);
          const novaQuantidade = Math.max(0, quantidadeAtual - Number(item.qtd || 0));

          await setDoc(
            estoqueRef,
            {
              quantidade: novaQuantidade,
              atualizadoEm: new Date().toISOString(),
            },
            { merge: true }
          );

          if (novaQuantidade === 0 && quantidadeAtual > 0) {
            await addDoc(collection(db, "notificacoes"), {
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

      setPedido({});
      mostrarNotificacao("Pedido salvo com sucesso!");
    } catch (erro) {
      console.error("Erro ao salvar pedido da mesa:", erro);
      mostrarNotificacao("Erro ao salvar no Firebase.");
    }
  }

  async function encerrarMesa() {
    setEncerrando(true);
    setMostrarModalEncerrarMesa(false);

    try {
      const pedidosRef = collection(db, "pedidos");

      const consultaMesa = query(
        pedidosRef,
        where("tipo", "==", "mesa"),
        where("mesa", "==", Number(id))
      );

      const resultado = await getDocs(consultaMesa);

      for (const documento of resultado.docs) {
        const pedidoDados = documento.data();

        await addDoc(collection(db, "vendasDia"), {
          origem: "mesa",
          mesa: Number(id), // ✅ CORREÇÃO BUG 3: sempre Number
          titulo: pedidoDados.titulo || `Mesa ${id}`,
          itens: pedidoDados.itens || [],
          total: pedidoDados.total || 0,
          totalItens: pedidoDados.totalItens || 0,
          finalizadoEm: new Date().toISOString(),
          criadoEm: serverTimestamp(),
        });

        await addDoc(collection(db, "historicoMesas"), {
          origem: "mesa",
          mesa: Number(id), // ✅ CORREÇÃO BUG 3: sempre Number
          titulo: pedidoDados.titulo || `Mesa ${id}`,
          itens: pedidoDados.itens || [],
          total: pedidoDados.total || 0,
          totalItens: pedidoDados.totalItens || 0,
          finalizadoEm: new Date().toISOString(),
          pedidoOriginalId: documento.id,
          status: "finalizada",
          criadoEm: serverTimestamp(),
        });

        await deleteDoc(doc(db, "pedidos", documento.id));
      }

      await setDoc(
        doc(db, "mesas", String(id)),
        {
          numero: Number(id),
          cliente: "",
        },
        { merge: true }
      );

      navigate("/mesas");
    } catch (erro) {
      console.error("Erro ao encerrar mesa:", erro);
      mostrarNotificacao("Erro ao encerrar a mesa.");
      setEncerrando(false);
    }
  }

  return (
    <div className="mesa-page">
      {notificacao && <div className="toast">{notificacao}</div>}

      {editandoNomeCliente && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-icon">✏️</div>

            <h2>Nome do cliente</h2>

            <p>Identifique quem está usando a Mesa {id}.</p>

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

      {mostrarModalEncerrarMesa && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-icon">🍽️</div>

            <h2>Encerrar Mesa {id}?</h2>

            <p>O pedido será finalizado e salvo no histórico de mesas.</p>

            <p className="modal-aviso">
              O nome do cliente também será removido da mesa.
            </p>

            <div className="modal-acoes">
              <button
                type="button"
                className="modal-btn cancelar"
                onClick={() => setMostrarModalEncerrarMesa(false)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="modal-btn confirmar"
                onClick={encerrarMesa}
              >
                Encerrar Mesa
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarPedidoMesa && pedidoMesa && (
        <div className="modal-overlay">
          <div className="modal-card modal-pedido-mesa">
            <div className="modal-icon">🧾</div>

            <h2>
              Pedido da Mesa {id}
              {nomeCliente ? ` - ${nomeCliente}` : ""}
            </h2>

            <p>
              Ajuste os itens caso o garçom tenha errado ou o cliente desista.
            </p>

            <div className="mesa-pedido-lista">
              {itensMesa.map((item) => (
                <div className="mesa-pedido-item" key={item.nome}>
                  <div className="mesa-pedido-info">
                    <strong>{item.nome}</strong>
                    <span>
                      {item.qtd}x • R${" "}
                      {formatarMoeda(
                        Number(item.preco || 0) * Number(item.qtd || 0)
                      )}
                    </span>
                  </div>

                  <div className="mesa-pedido-controles">
                    <button onClick={() => diminuirItemMesa(item)}>-</button>
                    <span>{item.qtd}</span>
                    <button onClick={() => aumentarItemMesa(item)}>+</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mesa-pedido-total-modal">
              <span>Total da mesa</span>
              <strong>R$ {formatarMoeda(totalMesa)}</strong>
            </div>

            <div className="modal-acoes">
              <button
                type="button"
                className="modal-btn cancelar"
                onClick={() => setMostrarPedidoMesa(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <button className="voltar-fixo" onClick={() => navigate("/")}>
        ← Voltar para o Painel
      </button>

      <div className="mesa-topo">
        <div>
          <span>Comanda</span>

          <div className="mesa-titulo-cliente">
            <h1>
              Mesa {id}
              {nomeCliente ? ` - ${nomeCliente}` : ""}
            </h1>

            <button onClick={() => setEditandoNomeCliente(true)}>✏️</button>
          </div>
        </div>

        <div className="mesa-total">
          <span>Total atual</span>
          <strong>R$ {formatarMoeda(totalGeralMesa)}</strong>
        </div>
      </div>

      <div className="acoes-mesa">
        <button className="btn-verde" onClick={salvarPedido}>
          Salvar pedido
        </button>

        <button
          className="btn-cinza"
          onClick={() => setMostrarModalEncerrarMesa(true)}
          disabled={encerrando}
        >
          {encerrando ? "Encerrando..." : "Encerrar mesa"}
        </button>
      </div>

      {pedidoMesa && totalItensMesa > 0 && (
        <div className="pedido-mesa-resumo">
          <div>
            <span>Pedido da mesa</span>
            <strong>
              {totalItensMesa} itens • R$ {formatarMoeda(totalMesa)}
            </strong>
          </div>

          <button onClick={() => setMostrarPedidoMesa(true)}>Ver pedido</button>
        </div>
      )}

      {itensPedido.length > 0 && (
        <div className="resumo-pedido">
          <h3>Pedido atual</h3>

          {itensPedido.map((item) => (
            <div className="resumo-linha" key={item.nome}>
              <span>
                {item.qtd}x {item.nome}
              </span>
              <strong>R$ {formatarMoeda(item.preco * item.qtd)}</strong>
            </div>
          ))}
        </div>
      )}

      <h2 className="titulo-secao">Adicionar pedido</h2>

      {produtos.length === 0 ? (
        <div className="card-principal">
          <h2>Nenhum produto cadastrado</h2>
          <p>Importe o cardápio na tela Produtos.</p>
        </div>
      ) : (
        produtos.map((categoria) => (
          <section className="categoria-bloco" key={categoria.categoria}>
            <div
              className="categoria-header"
              onClick={() => alternarCategoria(categoria.categoria)}
            >
              <h3>{categoria.categoria}</h3>
              <span>{categoriaAberta === categoria.categoria ? "▲" : "▼"}</span>
            </div>

            {categoriaAberta === categoria.categoria && (
              <div className="produtos-grid">
                {categoria.itens.map((item) => {
                  const quantidade = pedido[item.nome]?.qtd || 0;

                  return (
                    <div className="produto-card" key={item.id}>
                      <div className="produto-info">
                        <strong>{item.nome}</strong>
                        <span>R$ {formatarMoeda(item.preco)}</span>
                      </div>

                      <div className="contador">
                        <button onClick={() => removerItem(item)}>-</button>
                        <span>{quantidade}</span>
                        <button onClick={() => adicionarItem(item)}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))
      )}

      {totalItens > 0 && (
        <div className="barra-pedido">
          <div>
            <strong>{totalItens} itens</strong>
            <br />
            <span>R$ {formatarMoeda(total)}</span>
          </div>

          <button onClick={salvarPedido}>Salvar Pedido</button>
        </div>
      )}
    </div>
  );
}

export default MesaDetalhe;