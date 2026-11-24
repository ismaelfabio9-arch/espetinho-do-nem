// As áreas do sistema (o resto fica no Painel, Pedidos, Mesas e Configurações):
//   💵 Vendas: Caixa · Pedidos de hoje · Dias anteriores · Relatório · O que foi mexido (registro, só o dono)
//   🍔 Cardápio e estoque: Produtos (com os ingredientes de cada um) · Cardápio de hoje · Ingredientes (preço e estoque) · Estoque (contagem, perdas, histórico, do dia) · Preço certo
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
import Registro from "./Registro";
import DinheiroHoje from "./DinheiroHoje";

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
        { id: "mexido", nome: "O que foi mexido", soDono: true, tela: () => <Registro /> },
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
  // A lista de ingredientes (preço, compra, estoque) fica na aba Ingredientes; aqui, contagem, perdas, histórico e o do dia.
  if (ingredientes) return <Insumos embutido semLista dia={doDia ? <Estoque /> : null} />;
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
      padrao="hoje"
      abas={[
        { id: "hoje", nome: "Hoje", recurso: "dinheiro-completo", tela: () => <DinheiroHoje /> },
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
        {
          id: "ingredientes",
          antigos: ["custos"],
          nome: "Ingredientes",
          recurso: "custos",
          soDono: true,
          tela: () => <Financas abas={["custos"]} titulo="Ingredientes" texto="O preço e o estoque de tudo o que se usa para fazer os produtos." />,
        },
        { id: "estoque", nome: "Estoque", recurso: ["custos", "estoque"], tela: () => <EstoqueArea /> },

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
