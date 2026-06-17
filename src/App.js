import { BrowserRouter, Routes, Route } from "react-router-dom";

import { useEffect } from "react";
import "./App.css";
import Dashboard from "./pages/Garçom/Dashboard";
import MesaDetalhe from "./pages/Garçom/MesaDetalhe";
import Viagem from "./pages/Garçom/Viagem";
import Pedidos from "./pages/Garçom/Pedidos";
import Mesas from "./pages/Garçom/Mesas";
import Config from "./pages/Garçom/Config";
import Notificacoes from "./pages/Garçom/Notificacoes";
import Historico from "./pages/Garçom/Historico";
import Produtos from "./pages/Garçom/Produtos";
import HistoricoMesas from "./pages/Garçom/HistoricoMesas";
import RelatorioGerencial from "./pages/Garçom/RelatorioGerencial";
import CardapioMesa from "./pages/Cliente/CardapioMesa";
import Estoque from "./pages/Garçom/Estoque";


function App() {
 useEffect(() => {
  const tema = localStorage.getItem("tema");

  if (tema === "dark") {
    document.body.classList.add("dark");
  }
}, []);
  return (
    
    <BrowserRouter>
      <Routes>
        <Route path="/estoque" element={<Estoque />} />
        <Route path="/mesa-cliente/:mesa" element={<CardapioMesa />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/mesas" element={<Mesas />} />
        <Route path="/config" element={<Config />} />
        <Route path="/notificacoes" element={<Notificacoes />} />
        <Route path="/historico" element={<Historico />} />
        <Route path="/historico-mesas" element={<HistoricoMesas />} />
        <Route path="/relatorio" element={<RelatorioGerencial />} />
        <Route path="/mesa/:id" element={<MesaDetalhe />} />
        <Route path="/viagem" element={<Viagem />} />
        <Route path="/produtos" element={<Produtos />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;