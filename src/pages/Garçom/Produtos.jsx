import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../../firebase";
import { produtos as produtosPadrao } from "../../data/produtos";
import "../../styles/Garçom/Produtos.css";

function Produtos() {
  const [produtos, setProdutos] = useState([]);
  const [editando, setEditando] = useState(null);
  const [novoPreco, setNovoPreco] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [precoNovoProduto, setPrecoNovoProduto] = useState("");
  const [segurandoProduto, setSegurandoProduto] = useState(null);
  const [produtoParaExcluir, setProdutoParaExcluir] = useState(null);
  const [erroProduto, setErroProduto] = useState("");

  function formatarMoeda(valor) {
    return Number(valor).toFixed(2).replace(".", ",");
  }

  function criarIdProduto(texto) {
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function ordenarPorPreco(lista) {
    return [...lista].sort((a, b) => {
      const precoA = Number(a.preco) || 0;
      const precoB = Number(b.preco) || 0;

      if (precoA !== precoB) return precoA - precoB;

      return a.nome.localeCompare(b.nome);
    });
  }

  useEffect(() => {
    const cancelar = onSnapshot(collection(db, "produtos"), (snapshot) => {
      const lista = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      setProdutos(lista);
    });

    return () => cancelar();
  }, []);

  async function importarProdutosPadrao() {
    for (const categoria of produtosPadrao) {
      for (const item of categoria.itens) {
        const produtoId =
          item.id || criarIdProduto(`${categoria.categoria}-${item.nome}`);

        await setDoc(
          doc(db, "produtos", produtoId),
          {
            categoria: categoria.categoria,
            nome: item.nome,
            preco: Number(item.preco),
            ativo: true,
            criadoEm: serverTimestamp(),
          },
          { merge: true }
        );

        await setDoc(
          doc(db, "estoque", produtoId),
          {
            nome: item.nome,
            categoria: categoria.categoria,
            quantidade: 0,
            atualizadoEm: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    }
  }

  async function adicionarProduto() {
    if (!novoNome || !novaCategoria || !precoNovoProduto) {
      setErroProduto("Preencha nome, categoria e preço.");
      return;
    }

    const nomeTratado = novoNome.trim();
    const categoriaTratada = novaCategoria.trim();
    const produtoId = criarIdProduto(`${categoriaTratada}-${nomeTratado}`);

    await setDoc(
      doc(db, "produtos", produtoId),
      {
        nome: nomeTratado,
        categoria: categoriaTratada,
        preco: Number(precoNovoProduto),
        ativo: true,
        criadoEm: serverTimestamp(),
      },
      { merge: true }
    );

    await setDoc(
      doc(db, "estoque", produtoId),
      {
        nome: nomeTratado,
        categoria: categoriaTratada,
        quantidade: 0,
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );

    setNovoNome("");
    setNovaCategoria("");
    setPrecoNovoProduto("");
    setErroProduto("");
    setAdicionando(false);
  }

  async function salvarPreco(produto) {
    await updateDoc(doc(db, "produtos", produto.id), {
      preco: Number(novoPreco),
      atualizadoEm: new Date().toISOString(),
    });

    setEditando(null);
    setNovoPreco("");
  }

  async function confirmarExcluirProduto() {
    if (!produtoParaExcluir) return;

    await deleteDoc(doc(db, "produtos", produtoParaExcluir.id));
    await deleteDoc(doc(db, "estoque", produtoParaExcluir.id));

    setProdutoParaExcluir(null);
  }

  function iniciarPressionar(produto) {
    const timer = setTimeout(() => {
      setProdutoParaExcluir(produto);
    }, 900);

    setSegurandoProduto(timer);
  }

  function cancelarPressionar() {
    if (segurandoProduto) {
      clearTimeout(segurandoProduto);
      setSegurandoProduto(null);
    }
  }

  const produtosPorCategoria = produtos.reduce((grupos, produto) => {
    if (!grupos[produto.categoria]) {
      grupos[produto.categoria] = [];
    }

    grupos[produto.categoria].push(produto);

    return grupos;
  }, {});

  return (
    <div className="container">
      <Link to="/" className="voltar">
        ← Voltar
      </Link>

      <div className="pedidos-header">
        <div>
          <span>Cardápio</span>
          <h1>Produtos</h1>
          <p>Altere os preços do cardápio.</p>
        </div>

        <button
          className="produto-mini-btn"
          onClick={() => {
            setAdicionando(true);
            setErroProduto("");
          }}
          title="Adicionar produto"
        >
          +
        </button>
      </div>

      {adicionando && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card produto-modal-card">
            <div className="modal-fechar-dia-icone">➕</div>

            <h2>Adicionar produto</h2>

            <p>Cadastre um novo item no cardápio.</p>

            {erroProduto && <strong>{erroProduto}</strong>}

            <div className="produto-modal-form">
              <input
                placeholder="Nome do produto"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
              />

              <input
                placeholder="Categoria"
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
              />

              <input
                type="number"
                placeholder="Preço"
                value={precoNovoProduto}
                onChange={(e) => setPrecoNovoProduto(e.target.value)}
              />
            </div>

            <div className="modal-fechar-dia-botoes">
              <button
                className="modal-btn-cancelar"
                onClick={() => {
                  setAdicionando(false);
                  setErroProduto("");
                }}
              >
                Cancelar
              </button>

              <button className="modal-btn-confirmar" onClick={adicionarProduto}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {produtoParaExcluir && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card">
            <div className="modal-fechar-dia-icone">🗑️</div>

            <h2>Excluir produto?</h2>

            <p>
              Você está prestes a excluir{" "}
              <strong>{produtoParaExcluir.nome}</strong> do cardápio.
            </p>

            <strong>Essa ação não pode ser desfeita.</strong>

            <div className="modal-fechar-dia-botoes">
              <button
                className="modal-btn-cancelar"
                onClick={() => setProdutoParaExcluir(null)}
              >
                Cancelar
              </button>

              <button
                className="modal-btn-confirmar"
                onClick={confirmarExcluirProduto}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {produtos.length === 0 && (
        <button
          className="btn-verde"
          style={{
            width: "100%",
            marginBottom: "16px",
          }}
          onClick={importarProdutosPadrao}
        >
          Importar cardápio padrão
        </button>
      )}

      {Object.keys(produtosPorCategoria).map((categoria) => (
        <div key={categoria} className="pedido-card">
          <h3 style={{ marginBottom: "12px" }}>{categoria}</h3>

          {ordenarPorPreco(produtosPorCategoria[categoria]).map((produto) => (
            <div
              key={produto.id}
              className="pedido-total produto-linha-editavel"
              onMouseDown={() => iniciarPressionar(produto)}
              onMouseUp={cancelarPressionar}
              onMouseLeave={cancelarPressionar}
              onTouchStart={() => iniciarPressionar(produto)}
              onTouchEnd={cancelarPressionar}
            >
              <span>{produto.nome}</span>

              {editando === produto.id ? (
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="number"
                    value={novoPreco}
                    onChange={(e) => setNovoPreco(e.target.value)}
                    style={{
                      width: "80px",
                      padding: "8px",
                    }}
                  />

                  <button
                    className="btn-verde"
                    onClick={() => salvarPreco(produto)}
                  >
                    OK
                  </button>
                </div>
              ) : (
                <strong
                  onClick={() => {
                    setEditando(produto.id);
                    setNovoPreco(produto.preco);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  R$ {formatarMoeda(produto.preco)}
                </strong>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default Produtos;