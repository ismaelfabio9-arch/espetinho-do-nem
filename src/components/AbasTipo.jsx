import { TIPOS_VENDA } from "../utils/tipoVenda";

/** Abas Mesas / Balcão / Entregas (cada histórico mostra um tipo por vez). */
export default function AbasTipo({ tipo, onTroca, contagem }) {
  return (
    <div className="pedidos-filtros" role="tablist" aria-label="Tipo de pedido">
      {TIPOS_VENDA.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tipo === t.id}
          className={tipo === t.id ? "ativo" : ""}
          onClick={() => onTroca(t.id)}
        >
          {t.rotulo} {contagem ? <small>{contagem[t.id] || 0}</small> : null}
        </button>
      ))}
    </div>
  );
}
