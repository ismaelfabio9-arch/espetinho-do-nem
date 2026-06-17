import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import "../../styles/Garçom/Mesas.css";

function Mesas() {
  const [mesas, setMesas] = useState([]);
  const [nomesMesas, setNomesMesas] = useState({});
  const [modalCliente, setModalCliente] = useState(null);
  const [nomeCliente, setNomeCliente] = useState("");

  function formatarMoeda(valor) {
    return Number(valor).toFixed(2).replace(".", ",");
  }

  useEffect(() => {
    const cancelarNomes = onSnapshot(collection(db, "mesas"), (snapshot) => {
      const nomes = {};

      snapshot.docs.forEach((documento) => {
        nomes[documento.id] = documento.data().cliente || "";
      });

      setNomesMesas(nomes);
    });

    const cancelarPedidos = onSnapshot(collection(db, "pedidos"), (snapshot) => {
      const pedidos = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      const lista = [];

      for (let i = 1; i <= 15; i++) {
        const pedidosMesa = pedidos.filter(
          (pedido) => pedido.tipo === "mesa" && Number(pedido.mesa) === i
        );

        const total = pedidosMesa.reduce(
          (soma, pedido) => soma + Number(pedido.total || 0),
          0
        );

        const totalItens = pedidosMesa.reduce(
          (soma, pedido) => soma + Number(pedido.totalItens || 0),
          0
        );

        lista.push({
          numero: i,
          status: pedidosMesa.length > 0 ? "aberta" : "livre",
          total,
          totalItens,
        });
      }

      setMesas(lista);
    });

    return () => {
      cancelarPedidos();
      cancelarNomes();
    };
  }, []);

  function abrirModalCliente(e, mesa) {
    e.preventDefault();
    e.stopPropagation();

    setModalCliente(mesa.numero);
    setNomeCliente(nomesMesas[String(mesa.numero)] || "");
  }

  async function salvarNomeCliente() {
    if (!modalCliente) return;

    await setDoc(
      doc(db, "mesas", String(modalCliente)),
      {
        numero: modalCliente,
        cliente: nomeCliente.trim(),
      },
      { merge: true }
    );

    setModalCliente(null);
    setNomeCliente("");
  }

  return (
    <div className="container">
      {modalCliente && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card">
            <div className="modal-fechar-dia-icone">✏️</div>

            <h2>Nome do cliente</h2>

            <p>Identifique quem está usando a Mesa {modalCliente}.</p>

            <div className="produto-modal-form">
              <input
                placeholder="Ex: Allan"
                value={nomeCliente}
                onChange={(e) => setNomeCliente(e.target.value)}
                autoFocus
              />
            </div>

            <div className="modal-fechar-dia-botoes">
              <button
                className="modal-btn-cancelar"
                onClick={() => {
                  setModalCliente(null);
                  setNomeCliente("");
                }}
              >
                Cancelar
              </button>

              <button className="modal-btn-confirmar" onClick={salvarNomeCliente}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <Link to="/" className="voltar">
        ← Voltar
      </Link>

      <div className="mesas-header">
        <div>
          <span>Atendimento</span>
          <h1>Mesas</h1>
          <p>Visão geral das mesas do estabelecimento.</p>
        </div>
      </div>

      <div className="mesas-resumo">
        <div>
          <span>Abertas</span>
          <strong>{mesas.filter((m) => m.status === "aberta").length}</strong>
        </div>

        <div>
          <span>Livres</span>
          <strong>{mesas.filter((m) => m.status === "livre").length}</strong>
        </div>

        <div>
          <span>Total</span>
          <strong>15</strong>
        </div>
      </div>

      <div className="grid-mesas">
        {mesas.map((mesa) => {
          const cliente = nomesMesas[String(mesa.numero)];

          return (
            <Link
              key={mesa.numero}
              to={`/mesa/${mesa.numero}`}
              style={{ textDecoration: "none" }}
            >
              <div className={`mesa-card ${mesa.status}`}>
                <div className={`status-bolinha ${mesa.status}`}></div>

                <div className="mesa-nome-linha">
                  <h3>
                    Mesa {mesa.numero}
                    {cliente ? ` - ${cliente}` : ""}
                  </h3>

                  <button
                    className="mesa-editar-cliente"
                    onClick={(e) => abrirModalCliente(e, mesa)}
                    title="Editar nome do cliente"
                  >
                    ✏️
                  </button>
                </div>

                <div className="mesa-icone">🍽️</div>

                <p>R$ {formatarMoeda(mesa.total)}</p>

                <small>{mesa.totalItens} itens</small>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="menu-inferior">
        <Link to="/" style={{ textDecoration: "none" }}>
          ▦
          <span>Painel</span>
        </Link>

        <Link to="/pedidos" style={{ textDecoration: "none" }}>
          ▤
          <span>Pedidos</span>
        </Link>

        <Link to="/mesas" className="ativo" style={{ textDecoration: "none" }}>
          ▥
          <span>Mesas</span>
        </Link>

        <Link to="/config" style={{ textDecoration: "none" }}>
          ⚙
          <span>Config.</span>
        </Link>
      </div>
    </div>
  );
}

export default Mesas;