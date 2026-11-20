import { L } from "../../loja";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import "../../styles/Garcom/Pedidos.css";
import "../../styles/Garcom/Historico.css";
import AbasTipo from "../../components/AbasTipo";
import { TIPOS_VENDA, contarPorTipo, moeda, qtdItem, resumir, tipoVenda } from "../../utils/tipoVenda";

function HistoricoMesas() {
  const [historico, setHistorico] = useState([]);
  const [mensagem, setMensagem] = useState("");
  const [tipo, setTipo] = useState("mesa");

  function formatarData(data) {
    if (!data) return "";

    return new Date(data).toLocaleString("pt-BR");
  }

  function mostrarMensagem(texto) {
    setMensagem(texto);

    setTimeout(() => {
      setMensagem("");
    }, 2500);
  }

  useEffect(() => {
    const historicoRef = query(
      collection(db, ...L(), "historicoMesas"),
      orderBy("finalizadoEm", "desc")
    );

    const cancelar = onSnapshot(historicoRef, (snapshot) => {
      const lista = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      setHistorico(lista);
    });

    return () => cancelar();
  }, []);

  async function restaurarMesa(mesa) {
    try {
      await addDoc(collection(db, ...L(), "pedidos"), {
        tipo: mesa.origem || "mesa",
        mesa: mesa.mesa || null,
        titulo: mesa.titulo || `Mesa ${mesa.mesa}`,
        itens: mesa.itens || [],
        total: mesa.total || 0,
        totalItens: mesa.totalItens || 0,
        status: "aberto",
        salvoEm: new Date().toISOString(),
        restauradoEm: new Date().toISOString(),
        criadoEm: serverTimestamp(),
      });

      await deleteDoc(doc(db, ...L(), "historicoMesas", mesa.id));

      mostrarMensagem("Mesa restaurada com sucesso!");
    } catch (erro) {
      console.error("Erro ao restaurar mesa:", erro);
      mostrarMensagem("Erro ao restaurar mesa.");
    }
  }

  const lista = historico.filter((v) => tipoVenda(v) === tipo);
  const resumo = resumir(lista);
  const nomeTipo = TIPOS_VENDA.find((t) => t.id === tipo).nome;

  return (
    <div className="container">
      {mensagem && <div className="toast">{mensagem}</div>}

      <Link to="/config" className="voltar">
        ← Voltar
      </Link>

      <div className="pedidos-header">
        <div>
          <span>Pedidos finalizados</span>
          <h1>Histórico de pedidos</h1>
          <p>Mesas, balcão e entregas separados. Tudo junto só no Relatório Gerencial.</p>
        </div>
      </div>

      <AbasTipo tipo={tipo} onTroca={setTipo} contagem={contarPorTipo(historico)} />

      <div className="hist-resumo">
        <div><span>Pedidos</span><strong>{resumo.pedidos}</strong></div>
        <div><span>Itens</span><strong>{resumo.itens}</strong></div>
        <div><span>Total</span><strong>R$ {moeda(resumo.total)}</strong></div>
      </div>

      {lista.length === 0 ? (
        <div className="card-principal">
          <h2>Nenhum pedido de {nomeTipo.toLowerCase()}</h2>
          <p>Os pedidos finalizados de hoje aparecem aqui até o fechamento do dia.</p>
        </div>
      ) : (
        <div className="lista-pedidos">
          {lista.map((mesa) => (
            <div key={mesa.id} className="pedido-card">
              <div className="hist-topo">
                <div>
                  <span className="pedido-tipo">
                    {tipo === "mesa" ? `Mesa ${mesa.mesa}` : tipo === "entrega" ? (mesa.modo === "retirada" ? "🏪 Retirada" : "🛵 Entrega") : "🛍️ Balcão"}
                  </span>
                  <h3>{mesa.titulo}</h3>
                  <small>{formatarData(mesa.finalizadoEm)}</small>
                </div>
                <strong>R$ {moeda(mesa.total)}</strong>
              </div>

              <div className="hist-itens">
                {(mesa.itens || []).map((item, i) => (
                  <div key={`${item.nome}-${i}`} className="hist-linha">
                    <span className="hist-qtd">{qtdItem(item)}x</span>
                    <span className="hist-nome">{item.nome}</span>
                    <span className="hist-valor">R$ {moeda(Number(item.preco || 0) * qtdItem(item))}</span>
                  </div>
                ))}
                {Number(mesa.taxaEntrega || 0) > 0 && (
                  <div className="hist-linha">
                    <span className="hist-qtd"></span>
                    <span className="hist-nome">Taxa de entrega</span>
                    <span className="hist-valor">R$ {moeda(mesa.taxaEntrega)}</span>
                  </div>
                )}
              </div>

              <div className="hist-linha hist-rodape">
                <span className="hist-qtd">{mesa.totalItens || 0}</span>
                <span className="hist-nome">{mesa.formaPagamento ? `itens · ${mesa.formaPagamento}` : "itens"}</span>
                <span className="hist-valor">R$ {moeda(mesa.total)}</span>
              </div>

              {tipo === "mesa" && (
                <button
                  className="btn-verde"
                  style={{
                    width: "100%",
                    marginTop: "12px",
                  }}
                  onClick={() => restaurarMesa(mesa)}
                >
                  Restaurar mesa
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default HistoricoMesas;