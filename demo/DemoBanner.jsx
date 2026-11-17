import { seedDemo } from "./seed";
import { DemoPill } from "./DemoPill";

// Controles da demonstração do Sistema de Mesas: botão pequeno no canto (igual ao Delivery).
export function DemoBanner() {
  function recomecar() {
    if (!window.confirm("Apagar o que você fez na demonstração e voltar para o restaurante de exemplo do começo?")) return false;
    seedDemo();
    window.location.hash = "#/";
    window.location.reload();
    return true;
  }

  return (
    <DemoPill
      titulo="Demonstração do Sistema de Mesas"
      intro="Restaurante de almoço com dados de exemplo. Lance pedidos nas mesas e no viagem; o cliente também pode pedir pelo QR Code da mesa."
      atalhos={[
        { texto: "Painel do restaurante", href: "#/" },
        { texto: "Ver como o cliente (QR Code da mesa 4)", href: "#/mesa-cliente/4", novaAba: true },
      ]}
      contratar={{ texto: "Quero para o meu restaurante", href: "/ativar/espetinho" }}
      sair="/sistemas/sistema-de-mesas"
      onRecomecar={recomecar}
      distanciaDoFundo={96}
    />
  );
}
