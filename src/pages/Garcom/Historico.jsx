import { L } from "../../loja";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import "../../styles/Garcom/Historico.css";

import "../../styles/Garcom/Pedidos.css";
import AbasTipo from "../../components/AbasTipo";
import { TIPOS_VENDA, contarPorTipo, moeda, resumir, tipoVenda } from "../../utils/tipoVenda";


function Historico() {
  const [historico, setHistorico] = useState([]);
  const [fechamentoAberto, setFechamentoAberto] = useState(null);
  const [tipo, setTipo] = useState("mesa");

  useEffect(() => {
    const historicoRef = query(
      collection(db, ...L(), "historicoDias"),
      orderBy("criadoEm", "desc")
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

  async function limparHistorico() {
    for (const dia of historico) {
      await deleteDoc(doc(db, ...L(), "historicoDias", dia.id));
    }

    setFechamentoAberto(null);
  }

  const dias = historico
    .map((dia) => ({ dia, resumo: resumir((dia.vendasDia || []).filter((v) => tipoVenda(v) === tipo)) }))
    .filter((x) => x.resumo.pedidos > 0);
  const contagem = { mesa: 0, balcao: 0, entrega: 0 };
  historico.forEach((dia) => {
    const c = contarPorTipo(dia.vendasDia || []);
    Object.keys(c).forEach((k) => (contagem[k] += c[k] > 0 ? 1 : 0));
  });
  const nomeTipo = TIPOS_VENDA.find((t) => t.id === tipo).nome;

  return (
    <div className="container">
      <Link to="/config" className="voltar">
        ← Voltar
      </Link>

      <div className="pedidos-header">
        <div>
          <span>Fechamentos</span>
          <h1>Histórico dos dias</h1>
          <p>Cada dia encerrado, separado em mesas, balcão e entregas. Tudo junto só no Relatório Gerencial.</p>
        </div>
      </div>

      {historico.length > 0 && (
        <button
          className="btn-remover"
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "12px",
            marginBottom: "15px",
          }}
          onClick={limparHistorico}
        >
          Limpar histórico
        </button>
      )}

      <AbasTipo tipo={tipo} onTroca={(t) => { setTipo(t); setFechamentoAberto(null); }} contagem={contagem} />

      {dias.length === 0 ? (
        <div className="card-principal">
          <h2>{historico.length ? `Nenhum dia com ${nomeTipo.toLowerCase()}` : "Nenhum fechamento"}</h2>
          <p>{historico.length ? "Os dias com vendas deste tipo aparecem aqui." : "Quando encerrar o dia, o relatório aparecerá aqui."}</p>
        </div>
      ) : (
        <div className="lista-pedidos">
          {dias.map(({ dia, resumo }) => {
            const aberto = fechamentoAberto === dia.id;

            return (
              <div key={dia.id} className="pedido-card">
                <button
                  type="button"
                  className="hist-topo hist-topo-botao"
                  onClick={() => setFechamentoAberto(aberto ? null : dia.id)}
                  aria-expanded={aberto}
                >
                  <div>
                    <span className="pedido-tipo">{nomeTipo}</span>
                    <h3>{dia.data}</h3>
                    <small>Encerrado às {dia.horario}</small>
                  </div>
                  <strong>R$ {moeda(resumo.total)}</strong>
                </button>

                <div className="hist-resumo hist-resumo-dia">
                  <div><span>Pedidos</span><strong>{resumo.pedidos}</strong></div>
                  <div><span>Itens</span><strong>{resumo.itens}</strong></div>
                  <div><span>Ticket médio</span><strong>R$ {moeda(resumo.ticket)}</strong></div>
                </div>
                {tipo === "entrega" && resumo.taxaEntrega > 0 && (
                  <div className="hist-linha hist-rodape">
                    <span className="hist-qtd"></span>
                    <span className="hist-nome">Taxas de entrega (já no total)</span>
                    <span className="hist-valor">R$ {moeda(resumo.taxaEntrega)}</span>
                  </div>
                )}

                {aberto ? (
                  <div className="hist-itens">
                    {resumo.produtos.map((produto) => (
                      <div key={produto.nome} className="hist-linha">
                        <span className="hist-qtd">{produto.qtd}x</span>
                        <span className="hist-nome">{produto.nome}</span>
                        <span className="hist-valor">R$ {moeda(produto.total)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button type="button" className="hist-ver" onClick={() => setFechamentoAberto(dia.id)}>
                    Ver produtos vendidos ›
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Historico;