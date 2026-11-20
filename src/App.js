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
import Historico from "./pages/Garcom/Historico";
import Produtos from "./pages/Garcom/Produtos";
import HistoricoMesas from "./pages/Garcom/HistoricoMesas";
import RelatorioGerencial from "./pages/Garcom/RelatorioGerencial";
import CardapioMesa from "./pages/Cliente/CardapioMesa";
import Estoque from "./pages/Garcom/Estoque";
import QrCodes from "./pages/Garcom/QrCodes";
import CardapioHoje from "./pages/Garcom/CardapioHoje";
import VersaoNova from "./components/VersaoNova";
import { planoQueLibera, useRecurso } from "./recursos";


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
        {!MULTI && <Route path="/mesa-cliente/:mesa" element={<CardapioMesa />} />}
        <Route path="/*" element={MULTI ? <LojaGate><TelasEquipe /></LojaGate> : <TelasEquipe />} />
      </Routes>
    </BrowserRouter>
  );
}

/** Cardápio da mesa numa loja do site da IFTech (sem login). */
function MesaDaLoja() {
  const { loja } = useParams();
  return (
    <LojaDoEndereco id={loja}>
      <CardapioMesa />
    </LojaDoEndereco>
  );
}

/** Tela de uma função que a IFTech desligou só nesta loja. */
function SeLigado({ recurso, children }) {
  const ligado = useRecurso(recurso);
  if (ligado) return children;
  const plano = planoQueLibera(recurso);
  return (
    <div className="container" style={{ padding: 24 }}>
      <a href="./" className="voltar">← Voltar</a>
      {plano ? (
        <>
          <h1 style={{ marginTop: 16 }}>Função do plano {plano}</h1>
          <p>Esta função não faz parte do seu plano. Para usar, mude para o plano {plano}: fale com a IFTech pelo WhatsApp (81) 99245-8934.</p>
        </>
      ) : (
        <>
          <h1 style={{ marginTop: 16 }}>Função desligada</h1>
          <p>Esta função está desligada na sua loja. Para ligar de novo, fale com a IFTech.</p>
        </>
      )}
    </div>
  );
}

/** Telas do garçom e do dono. */
function TelasEquipe() {
  return (
    <Routes>
      <Route path="/estoque" element={<SeLigado recurso="estoque"><Estoque /></SeLigado>} />
      <Route path="/" element={<Dashboard />} />
      <Route path="/pedidos" element={<Pedidos />} />
      <Route path="/mesas" element={<Mesas />} />
      <Route path="/config" element={<Config />} />
      <Route path="/config/impressora" element={<ConfiguracaoImpressora />} />
      <Route path="/config/impressora/bluetooth" element={<ConectarImpressoraBluetooth />} />
      <Route path="/notificacoes" element={<Notificacoes />} />
      <Route path="/historico" element={<Historico />} />
      <Route path="/historico-mesas" element={<HistoricoMesas />} />
      <Route path="/relatorio" element={<SeLigado recurso="relatorios"><RelatorioGerencial /></SeLigado>} />
      <Route path="/mesa/:id" element={<MesaDetalhe />} />
      <Route path="/viagem" element={<SeLigado recurso="viagem"><Viagem /></SeLigado>} />
      <Route path="/produtos" element={<Produtos />} />
      <Route path="/qrcodes" element={<QrCodes />} />
      <Route path="/cardapio-hoje" element={<CardapioHoje />} />
    </Routes>
  );
}

export default App;