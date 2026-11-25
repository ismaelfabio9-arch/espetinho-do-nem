// As áreas do sistema (o resto fica no Painel, Pedidos, Mesas e Configurações):
//   💵 Vendas: Caixa · Pedidos de hoje · Dias anteriores · Relatório · O que foi mexido (registro, só o dono)
//   🍔 Cardápio e estoque: Produtos (com os ingredientes de cada um) · Cardápio de hoje · Ingredientes (preço e estoque) · Estoque (contagem, perdas, histórico, do dia) · Preço certo
//   💰 Dinheiro: Lucro e caixa · Despesas e compras (pages/Garcom/Financas.jsx)
import { Navigate, useSearchParams } from "react-router-dom";
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
import RelatorioCompleto, { LucroPorProduto } from "./RelatorioCompleto";

// Com o Dinheiro completo, Vendas e Dinheiro viram uma área só (Dinheiro): o que era de Vendas vai para lá.
const VENDAS_PARA_DINHEIRO = { caixa: "hoje", hoje: "relatorio&parte=pedidos", dias: "relatorio&parte=dias", relatorio: "relatorio", mexido: "relatorio&parte=mexido" };

export function Vendas() {
  const caixa = useRecurso("financas");
  const completo = useRecurso("dinheiro-completo");
  const [params] = useSearchParams();
  if (completo) return <Navigate to={`/dinheiro?aba=${VENDAS_PARA_DINHEIRO[params.get("aba")] || "hoje"}`} replace />;
  return (
    <Area
      titulo="Vendas"
      icone="💵"
      padrao={caixa ? "caixa" : "hoje"}
      abas={[
        { id: "caixa", nome: "Caixa", recurso: "financas", senha: true, tela: () => <Caixa /> },
        { id: "hoje", nome: "Pedidos de hoje", tela: () => <HistoricoMesas /> },
        { id: "dias", nome: "Dias anteriores", tela: () => <Historico /> },
        { id: "relatorio", nome: "Relatório", recurso: "relatorios", senha: true, tela: () => (completo ? <RelatorioCompleto /> : <RelatorioGerencial />) },
        { id: "mexido", nome: "O que foi mexido", soDono: true, senha: true, tela: () => <Registro /> },
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
  const completo = useRecurso("dinheiro-completo");
  // A lista de ingredientes (preço, compra, estoque) fica na aba Ingredientes; aqui, contagem, perdas, histórico e o do dia.
  if (ingredientes) return <Insumos embutido semLista dia={doDia ? <Estoque /> : null} somente={completo ? ["contagem", "dia"] : null} />;
  return (
    <SeLigado recurso="estoque" embutido>
      <Estoque />
    </SeLigado>
  );
}

/** Dinheiro: mesmo jeito das outras áreas (título e abas), cada aba é uma parte de Finanças. */
export function Dinheiro() {
  const completo = useRecurso("dinheiro-completo");
  if (completo)
    return (
      <Area
        titulo="Dinheiro"
        icone="💰"
        padrao="hoje"
        abas={[
          { id: "hoje", antigos: ["lancamentos", "despesas"], nome: "Hoje", tela: () => <DinheiroHoje /> },
          { id: "relatorio", antigos: ["lucro", "pedidos", "dias", "mexido"], nome: "Relatório", tela: () => <RelatorioArea /> },
        ]}
      />
    );
  return (
    <Area
      titulo="Dinheiro"
      icone="💰"
      padrao="hoje"
      abas={[
        { id: "hoje", nome: "Hoje", recurso: "dinheiro-completo", tela: () => <DinheiroHoje /> },
        { id: "lucro", nome: "Lucro e caixa", recurso: "financas", soDono: true, senha: true, tela: () => <Financas abas={["resumo"]} titulo="Lucro e caixa" /> },
        { id: "despesas", nome: "Despesas e compras", recurso: "financas", soDono: true, senha: true, tela: () => <Financas abas={["lancamentos"]} titulo="Despesas e compras" /> },
      ]}
    />
  );
}

/** Um lugar só para todos os relatórios (Dinheiro completo): geral, lucro, pedidos do dia, dias anteriores, estoque e perdas, o que foi mexido. */
function RelatorioArea() {
  const custos = useRecurso("custos");
  const souDono = useSouDono();
  const [params] = useSearchParams();
  // Links antigos (?aba=pedidos, dias, mexido, lucro) caem na parte certa.
  const antiga = { pedidos: "pedidos", dias: "dias", mexido: "mexido", lucro: "lucro" }[params.get("aba")];
  return (
    <Area
      titulo="Relatório"
      sub
      param="parte"
      padrao={antiga || "geral"}
      abas={[
        { id: "geral", nome: "Geral", senha: true, tela: () => <RelatorioCompleto /> },
        { id: "lucro", nome: "Lucro por produto", soDono: true, senha: true, tela: () => <LucroPorProduto /> },
        { id: "pedidos", nome: "Pedidos do dia", tela: () => <HistoricoMesas emRelatorio /> },
        { id: "dias", nome: "Dias anteriores", tela: () => <Historico emRelatorio /> },
        ...(custos && souDono ? [{ id: "estoque", nome: "Estoque e perdas", senha: true, tela: () => <Insumos embutido semLista somente={["perdas", "historico"]} /> }] : []),
        { id: "mexido", nome: "O que foi mexido", soDono: true, senha: true, tela: () => <Registro emRelatorio /> },
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
          senha: true,
          tela: () => <Financas abas={["custos"]} titulo="Ingredientes" texto="O preço e o estoque de tudo o que se usa para fazer os produtos." />,
        },
        { id: "estoque", nome: "Estoque", recurso: ["custos", "estoque"], tela: () => <EstoqueArea /> },

        {
          id: "preco",
          nome: "Preço certo",
          recurso: "custos",
          soDono: true,
          senha: true,
          tela: () => <Financas abas={["preco"]} titulo="Preço certo" texto="Quanto custa cada produto, por quanto vender e quanto sobra de lucro." />,
        },
      ]}
    />
  );
}
