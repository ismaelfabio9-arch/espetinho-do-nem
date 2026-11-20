import { L } from "../../loja";
import useNomeLoja from "../../hooks/useNomeLoja";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../firebase";
import "../../styles/Garcom/RelatorioGerencial.css";
import { TIPOS_VENDA, nomeProduto, qtdItem, resumir, tipoVenda } from "../../utils/tipoVenda";


function RelatorioGerencial() {
  const nomeLoja = useNomeLoja();
  const [historico, setHistorico] = useState([]);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  function formatarMoeda(valor) {
    return Number(valor).toFixed(2).replace(".", ",");
  }

  function formatarDataInput(data) {
    if (!data) return "Início";
    return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
  }

  function converterDataBR(data) {
    if (!data) return null;
    const partes = data.split("/");
    if (partes.length !== 3) return null;
    return new Date(`${partes[2]}-${partes[1]}-${partes[0]}T00:00:00`);
  }

  useEffect(() => {
    const historicoRef = query(
      collection(db, ...L(), "relatorioGerencial"),
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

  const diasFiltrados = historico.filter((dia) => {
    const dataDia = converterDataBR(dia.data);
    if (!dataDia) return false;

    if (dataInicio) {
      const inicio = new Date(`${dataInicio}T00:00:00`);
      if (dataDia < inicio) return false;
    }

    if (dataFim) {
      const fim = new Date(`${dataFim}T23:59:59`);
      if (dataDia > fim) return false;
    }

    return true;
  });

  // Tudo junto (o único lugar do sistema que soma mesas, balcão e entregas).
  const produtos = {};
  let totalVendido = 0;
  let totalPedidos = 0;
  let totalItens = 0;
  const vendasPorTipo = { mesa: [], balcao: [], entrega: [] };

  diasFiltrados.forEach((dia) => {
    totalVendido += Number(dia.totalVendido || 0);
    totalPedidos += Number(dia.totalPedidos || 0);
    totalItens += Number(dia.totalItens || 0);

    (dia.vendasDia || []).forEach((venda) => {
      const tipo = tipoVenda(venda);
      vendasPorTipo[tipo].push(venda);

      (venda.itens || []).forEach((item) => {
        const nome = nomeProduto(item);
        if (!produtos[nome]) {
          produtos[nome] = { nome, preco: Number(item.preco || 0), qtd: 0, total: 0, mesa: 0, balcao: 0, entrega: 0 };
        }
        // lê qtd ou quantidade para compatibilidade com pedidos antigos
        const q = qtdItem(item);
        produtos[nome].qtd += q;
        produtos[nome][tipo] += q;
        produtos[nome].total += Number(item.preco || 0) * q;
      });
    });
  });

  const porTipo = TIPOS_VENDA.map((t) => ({ ...t, ...resumir(vendasPorTipo[t.id]) }));

  const listaProdutos = Object.values(produtos).sort((a, b) => b.total - a.total);
  const listaPorQuantidade = [...listaProdutos].sort((a, b) => b.qtd - a.qtd);

  const ticketMedio = totalPedidos > 0 ? totalVendido / totalPedidos : 0;
  const produtoMaisVendido = listaPorQuantidade[0];
  const produtoMaiorFaturamento = listaProdutos[0];

  return (
    <div className="container relatorio-page">
      <div className="no-print">
        <Link to="/config" className="voltar">
          ← Voltar
        </Link>

        <div className="relatorio-filtros">
          <h1>Relatório Gerencial</h1>
          <p>Escolha um período e gere um relatório profissional.</p>

          <div className="relatorio-filtro-linha">
            <div>
              <label>Data inicial</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>

            <div>
              <label>Data final</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </div>

          <button className="btn-verde" onClick={() => window.print()}>
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="relatorio-documento">
        <div className="relatorio-cabecalho">
          <div>
            <span>Relatório Gerencial</span>
            <h1>{nomeLoja}</h1>
            <p>Mesas, balcão e entregas: faturamento e produtos vendidos</p>
          </div>

          <div className="relatorio-emissao">
            <strong>Emissão</strong>
            <span>{new Date().toLocaleString("pt-BR")}</span>
          </div>
        </div>

        <div className="relatorio-periodo">
          <span>Período analisado</span>
          <strong>
            {formatarDataInput(dataInicio)} até{" "}
            {dataFim ? formatarDataInput(dataFim) : "Hoje"}
          </strong>
        </div>

        <div className="relatorio-resumo-grid">
          <div className="relatorio-resumo-card destaque">
            <span>Faturamento total</span>
            <strong>R$ {formatarMoeda(totalVendido)}</strong>
          </div>

          <div className="relatorio-resumo-card">
            <span>Pedidos finalizados</span>
            <strong>{totalPedidos}</strong>
          </div>

          <div className="relatorio-resumo-card">
            <span>Itens vendidos</span>
            <strong>{totalItens}</strong>
          </div>

          <div className="relatorio-resumo-card">
            <span>Ticket médio</span>
            <strong>R$ {formatarMoeda(ticketMedio)}</strong>
          </div>
        </div>

        <div className="relatorio-secao">
          <h2>Destaques do período</h2>

          <div className="relatorio-destaques">
            <div>
              <span>Produto mais vendido</span>
              <strong>
                {produtoMaisVendido
                  ? produtoMaisVendido.nome
                  : "Nenhum produto"}
              </strong>
              <p>
                {produtoMaisVendido
                  ? `${produtoMaisVendido.qtd} unidades`
                  : "Sem vendas no período"}
              </p>
            </div>

            <div>
              <span>Maior faturamento</span>
              <strong>
                {produtoMaiorFaturamento
                  ? produtoMaiorFaturamento.nome
                  : "Nenhum produto"}
              </strong>
              <p>
                {produtoMaiorFaturamento
                  ? `R$ ${formatarMoeda(produtoMaiorFaturamento.total)}`
                  : "Sem faturamento no período"}
              </p>
            </div>
          </div>
        </div>

        <div className="relatorio-secao">
          <h2>Por tipo de pedido</h2>

          <div className="relatorio-tabela-wrapper">
            <table className="relatorio-tabela relatorio-tabela-numeros">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Pedidos</th>
                  <th>Itens</th>
                  <th>Ticket médio</th>
                  <th>Faturamento</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {porTipo.map((t) => (
                  <tr key={t.id}>
                    <td>{t.rotulo}</td>
                    <td>{t.pedidos}</td>
                    <td>{t.itens}</td>
                    <td>R$ {formatarMoeda(t.ticket)}</td>
                    <td>R$ {formatarMoeda(t.total)}</td>
                    <td>{totalVendido > 0 ? Math.round((t.total / totalVendido) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{totalPedidos}</td>
                  <td>{totalItens}</td>
                  <td>R$ {formatarMoeda(ticketMedio)}</td>
                  <td>R$ {formatarMoeda(totalVendido)}</td>
                  <td>{totalVendido > 0 ? "100%" : "0%"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {porTipo[2].taxaEntrega > 0 && (
            <p className="relatorio-nota">Nas entregas, R$ {formatarMoeda(porTipo[2].taxaEntrega)} são taxas de entrega (já somadas no faturamento).</p>
          )}
        </div>

        <div className="relatorio-secao">
          <h2>Produtos vendidos</h2>

          {listaProdutos.length === 0 ? (
            <p>Nenhum produto encontrado nesse período.</p>
          ) : (
            <div className="relatorio-tabela-wrapper">
              <table className="relatorio-tabela relatorio-tabela-numeros">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Preço</th>
                    <th>Mesas</th>
                    <th>Balcão</th>
                    <th>Entregas</th>
                    <th>Qtd</th>
                    <th>Total</th>
                  </tr>
                </thead>

                <tbody>
                  {listaProdutos.map((produto) => (
                    <tr key={produto.nome}>
                      <td>{produto.nome}</td>
                      <td>R$ {formatarMoeda(produto.preco)}</td>
                      <td>{produto.mesa || "–"}</td>
                      <td>{produto.balcao || "–"}</td>
                      <td>{produto.entrega || "–"}</td>
                      <td>{produto.qtd}</td>
                      <td>R$ {formatarMoeda(produto.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="relatorio-rodape">
          <p>Relatório gerado automaticamente pelo sistema {nomeLoja}.</p>
        </div>
      </div>
    </div>
  );
}

export default RelatorioGerencial;