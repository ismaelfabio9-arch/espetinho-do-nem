// As áreas do sistema (o resto fica no Painel, Pedidos, Mesas e Configurações):
//   💵 Vendas: Caixa · Pedidos de hoje · Dias anteriores · Relatório
//   🍔 Cardápio e estoque: Produtos · Cardápio de hoje · Estoque · Custos (o preço de cada ingrediente) · Preço certo
//   💰 Dinheiro: Lucro e caixa · Despesas e compras (pages/Garcom/Financas.jsx)
import Area from "../../components/Area";
import SeLigado from "../../components/SeLigado";
import { useRecurso } from "../../recursos";
import { useSouDono } from "../../tenant";
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

/** Estoque: ingredientes (com contagem, perdas e histórico) e a quantidade do dia por produto, numa fileira de abas só. */
function EstoqueArea() {
  // Ingredientes (com preço) só para o dono; a equipe fica com o estoque do dia.
  const custos = useRecurso("custos");
  const souDono = useSouDono();
  const ingredientes = custos && souDono;
  const doDia = useRecurso("estoque");
  if (ingredientes) return <Insumos embutido dia={doDia ? <Estoque /> : null} />;
  return (
    <SeLigado recurso="estoque" embutido>
      <Estoque />
    </SeLigado>
  );
}

/** Dinheiro: mesmo jeito das outras áreas (título e abas), cada aba é uma parte de Finanças. */
export function Dinheiro() {
  return (
    <Area
      titulo="Dinheiro"
      icone="💰"
      padrao="lucro"
      abas={[
        { id: "lucro", nome: "Lucro e caixa", recurso: "financas", soDono: true, tela: () => <Financas abas={["resumo"]} titulo="Lucro e caixa" /> },
        { id: "despesas", nome: "Despesas e compras", recurso: "financas", soDono: true, tela: () => <Financas abas={["lancamentos"]} titulo="Despesas e compras" /> },
      ]}
    />
  );
}

export function CardapioArea() {
  return (
    <Area
      titulo="Cardápio e estoque"
      icone="🍔"
      padrao="produtos"
      abas={[
        { id: "produtos", nome: "Produtos", tela: () => <Produtos /> },
        { id: "hoje", nome: "Cardápio de hoje", tela: () => <CardapioHoje /> },
        { id: "estoque", nome: "Estoque", recurso: ["custos", "estoque"], tela: () => <EstoqueArea /> },
        {
          id: "custos",
          nome: "Custos",
          recurso: "custos",
          soDono: true,
          tela: () => <Financas abas={["custos"]} titulo="Custos" texto="Quanto você paga em cada ingrediente." />,
        },
        {
          id: "preco",
          nome: "Preço certo",
          recurso: "custos",
          soDono: true,
          tela: () => <Financas abas={["preco"]} titulo="Preço certo" texto="Quanto custa cada produto, por quanto vender e quanto sobra de lucro." />,
        },
      ]}
    />
  );
}
