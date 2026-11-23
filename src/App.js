import EntrarPorLink from "./components/EntrarPorLink";
import CardapioOnline from "./pages/Cliente/CardapioOnline";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { MULTI } from "./loja";
import LojaGate, { LojaDoEndereco } from "./components/LojaGate";

import { useEffect } from "react";
import "./App.css";
import Dashboard from "./pages/Garcom/Dashboard";
import MesaDetalhe from "./pages/Garcom/MesaDetalhe";
import Viagem from "./pages/Garcom/Viagem";
import Pedidos from "./pages/Garcom/Pedidos";
import Mesas from "./pages/Garcom/Mesas";
import Config from "./pages/Garcom/Config";
import ConfiguracaoImpressora from "./pages/Garcom/ConfiguracaoImpressora";
import ConectarImpressoraBluetooth from "./pages/Garcom/ConectarImpressoraBluetooth";
import Notificacoes from "./pages/Garcom/Notificacoes";
import CardapioMesa from "./pages/Cliente/CardapioMesa";
import QrCodes from "./pages/Garcom/QrCodes";
import VersaoNova from "./components/VersaoNova";
import ErroTela from "./components/ErroTela";
import Atalhos from "./components/Atalhos";
import NovoPedido from "./pages/Garcom/NovoPedido";
import PainelDono from "./pages/Garcom/PainelDono";
import SeLigado from "./components/SeLigado";
import EstacaoImpressao from "./components/EstacaoImpressao";
import { Vendas, CardapioArea, Dinheiro } from "./pages/Garcom/Areas";
import { Navigate, useLocation } from "react-router-dom";


function App() {
 useEffect(() => {
  const tema = localStorage.getItem("tema");

  if (tema === "dark") {
    document.body.classList.add("dark");
  }
}, []);
  return (
    
    <BrowserRouter basename={MULTI ? "/mesas" : undefined}>
      <VersaoNova />
      <Routes>
        {MULTI && <Route path="/c/:loja/mesa-cliente/:mesa" element={<MesaDaLoja />} />}
        {MULTI && <Route path="/c/:loja/cardapio" element={<CardapioDaLoja />} />}
        {MULTI && <Route path="/entrar" element={<EntrarPorLink />} />}
        {!MULTI && <Route path="/mesa-cliente/:mesa" element={<ErroTela><CardapioMesa /></ErroTela>} />}
        <Route path="/*" element={MULTI ? <LojaGate><TelasEquipe /></LojaGate> : <TelasEquipe />} />
      </Routes>
    </BrowserRouter>
  );
}

/** Cardápio da mesa numa loja do site da IFTech (sem login). */
function MesaDaLoja() {
  const { loja } = useParams();
  return (
    <ErroTela>
      <LojaDoEndereco id={loja}>
        <CardapioMesa />
      </LojaDoEndereco>
    </ErroTela>
  );
}

/** Cardápio online da loja (pedido de casa, plano Premium; sem login). */
function CardapioDaLoja() {
  const { loja } = useParams();
  return (
    <ErroTela>
      <LojaDoEndereco id={loja}>
        <CardapioOnline />
      </LojaDoEndereco>
    </ErroTela>
  );
}

/** Endereço antigo → aba da área nova (mantém o que vier depois do "?"). */
function Para({ to }) {
  const { search } = useLocation();
  const extra = search.replace(/^\?/, "");
  return <Navigate to={extra ? `${to}${to.includes("?") ? "&" : "?"}${extra}` : to} replace />;
}

/** Telas do garçom e do dono. */
function TelasEquipe() {
  return (
    <>
    <Atalhos />
    <EstacaoImpressao />
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/pedidos" element={<Pedidos />} />
      <Route path="/mesas" element={<Mesas />} />
      <Route path="/config" element={<Config />} />
      <Route path="/config/impressora" element={<ConfiguracaoImpressora />} />
      <Route path="/config/impressora/bluetooth" element={<ConectarImpressoraBluetooth />} />
      <Route path="/notificacoes" element={<Notificacoes />} />
      {/* As 3 áreas */}
      <Route path="/vendas" element={<Vendas />} />
      <Route path="/cardapio" element={<CardapioArea />} />
      <Route path="/dinheiro" element={<Dinheiro />} />
      {/* Endereços antigos: caem na aba certa da área nova */}
      <Route path="/caixa" element={<Para to="/vendas?aba=caixa" />} />
      <Route path="/historico-mesas" element={<Para to="/vendas?aba=hoje" />} />
      <Route path="/historico" element={<Para to="/vendas?aba=dias" />} />
      <Route path="/relatorio" element={<Para to="/vendas?aba=relatorio" />} />
      <Route path="/produtos" element={<Para to="/cardapio?aba=produtos" />} />
      <Route path="/cardapio-hoje" element={<Para to="/cardapio?aba=hoje" />} />
      <Route path="/estoque" element={<Para to="/cardapio?aba=estoque&sub=dia" />} />
      <Route path="/materia-prima" element={<Para to="/cardapio?aba=ingredientes" />} />
      <Route path="/financas" element={<Para to="/dinheiro" />} />
      <Route path="/mesa/:id" element={<MesaDetalhe />} />
      <Route path="/viagem" element={<SeLigado recurso="viagem"><Viagem /></SeLigado>} />
      <Route path="/qrcodes" element={<QrCodes />} />
      <Route path="/novo" element={<NovoPedido />} />
      {MULTI && <Route path="/dono" element={<PainelDono />} />}
    </Routes>
    </>
  );
}

export default App;