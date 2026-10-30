import { seedDemo } from "./seed";

// Faixa da demonstração: avisa que os dados são de exemplo, que tudo fica só
// neste aparelho, mostra o cardápio do cliente, deixa sair para a página do sistema e leva
// para a contratação no site.
export function DemoBanner() {
  function recomecar() {
    if (!window.confirm("Apagar o que você fez na demonstração e voltar para o bar de exemplo do começo?")) return;
    seedDemo();
    window.location.hash = "#/";
    window.location.reload();
  }

  const botao = { background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.7)", borderRadius: 8, padding: "6px 12px", fontWeight: 600, cursor: "pointer", fontSize: 14, textDecoration: "none", fontFamily: "inherit" };

  return (
    <div role="note" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px", padding: "10px 16px", background: "#1d4ed8", color: "#fff", fontSize: 14, lineHeight: 1.35, fontFamily: "system-ui, sans-serif" }}>
      <span style={{ flex: "1 1 260px", color: "#fff" }}>
        <strong style={{ color: "#fff" }}>Demonstração do Sistema de Mesas</strong> — bar e dados de exemplo. Pode testar à vontade: o que você fizer fica só neste aparelho.
      </span>
      <a href="#/mesa-cliente/4" target="_blank" rel="noopener" style={botao} title="Abre o cardápio que o cliente vê ao ler o QR Code da mesa 4">
        Ver como o cliente
      </a>
      <button type="button" onClick={recomecar} style={botao}>
        Recomeçar
      </button>
      <a href="/sistemas/espetinho" style={botao}>
        Sair da demonstração
      </a>
      <a href="/ativar/espetinho" style={{ background: "#fff", color: "#1d4ed8", borderRadius: 8, padding: "7px 14px", fontWeight: 700, textDecoration: "none" }}>
        Quero para o meu bar
      </a>
    </div>
  );
}
