// As áreas do sistema (o resto fica no Painel, Pedidos, Mesas e Configurações):
//   💵 Vendas: Caixa · Pedidos de hoje · Dias anteriores · Relatório
//   🍔 Cardápio e estoque: Produtos (com ingredientes, custo e preço certo) · Cardápio de hoje · Estoque · Preço certo
//   💰 Dinheiro: Lucro e caixa · Despesas e compras (pages/Garcom/Financas.jsx)
import Area from "../../components/Area";
import { useRecurso } from "../../recursos";
import Caixa from "./Caixa";
import HistoricoMesas from "./HistoricoMesas";
import Historico from "./Historico";
import RelatorioGerencial from "./RelatorioGerencial";
import Produtos from "./Produtos";
import CardapioHoje from "./CardapioHoje";
import Estoque from "./Estoque";
import Insumos from "./Insumos";
import Financas from "./Financas";

export function Vendas() {
  const caixa = useRecurso("financas");
  return (
    <Area
      titulo="Vendas"
      icone="💵"
      texto="O dia a dia do dinheiro que entra: caixa, pedidos e relatórios."
      padrao={caixa ? "caixa" : "hoje"}
      abas={[
        { id: "caixa", nome: "Caixa", recurso: "financas", tela: () => <Caixa /> },
        { id: "hoje", nome: "Pedidos de hoje", tela: () => <HistoricoMesas /> },
        { id: "dias", nome: "Dias anteriores", tela: () => <Historico /> },
        { id: "relatorio", nome: "Relatório", recurso: "relatorios", tela: () => <RelatorioGerencial /> },
      ]}
    />
  );
}

function EstoqueArea() {
  const ingredientes = useRecurso("financas");
  return (
    <Area
      sub
      param="sub"
      titulo="Estoque"
      padrao={ingredientes ? "ingredientes" : "dia"}
      abas={[
        { id: "ingredientes", nome: "Ingredientes (carne, arroz, pão…)", recurso: "financas", tela: () => <Insumos /> },
        { id: "dia", nome: "Quantidade do dia por produto", recurso: "estoque", tela: () => <Estoque /> },
      ]}
    />
  );
}

export function CardapioArea() {
  return (
    <Area
      titulo="Cardápio e estoque"
      icone="🍔"
      texto="Os produtos (com ingredientes, custo e preço certo), o que tem hoje e o estoque."
      padrao="produtos"
      abas={[
        { id: "produtos", nome: "Produtos", tela: () => <Produtos /> },
        { id: "hoje", nome: "Cardápio de hoje", tela: () => <CardapioHoje /> },
        { id: "estoque", nome: "Estoque", tela: () => <EstoqueArea /> },
        {
          id: "preco",
          nome: "Preço certo",
          recurso: "financas",
          tela: () => <Financas abas={["preco"]} titulo="Preço certo" texto="Quanto custa cada produto, por quanto vender e quanto sobra de lucro." />,
        },
      ]}
    />
  );
}
