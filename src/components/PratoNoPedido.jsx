// Prato que já está no pedido do cliente: pergunta se edita (esqueceu o feijão) ou acrescenta mais um.
// Usada no cardápio online e no cardápio do QR Code da mesa.
import "./MontarPrato.css";

export default function PratoNoPedido({ produto, linhas, onEditar, onMaisUm, onFechar }) {
  return (
    <div className="montar-fundo" onClick={onFechar}>
      <div className="montar-folha prato-no-pedido" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${produto.nome} já está no pedido`}>
        <div className="montar-topo">
          <h2>{produto.nome} já está no seu pedido</h2>
          <button type="button" className="montar-fechar" onClick={onFechar} aria-label="Fechar" data-fechar>✕</button>
        </div>
        <p className="prato-no-pedido-dica">Esqueceu alguma coisa? Edite o prato. Ou acrescente mais um.</p>
        {linhas.map((l) => (
          <button type="button" key={l.chave} className="prato-no-pedido-op" onClick={() => onEditar(l)}>
            <strong>✏️ Editar{l.quantidade > 1 ? ` (${l.quantidade}x)` : ""}</strong>
            <span>{String(l.nome).replace(`${produto.nome} — `, "")}</span>
          </button>
        ))}
        <button type="button" className="montar-adicionar" onClick={onMaisUm}>
          + Acrescentar mais um
        </button>
      </div>
    </div>
  );
}
