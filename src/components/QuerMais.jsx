// No fim do pedido (cardápio online e QR da mesa): "Vai querer mais alguma coisa?" com bebidas,
// acompanhamentos e sobremesas que ainda não estão no pedido. Um toque adiciona.
import { abreEscolha, ehCategoriaDeBebida } from "../utils/montagem";
import "./QuerMais.css";

const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");
export const ehComplemento = (cat) => ehCategoriaDeBebida(cat) || /acompanh|por[cç][aã]o|por[cç][oõ]es|petisc|guarni|sobremes|doce|picol|sorvet|adiciona|extra|salgad/i.test(String(cat || ""));

/** Sugestões: [{ categoria, itens }] só com o que dá para pôr com um toque e ainda não está no pedido. */
export function sugestoesComplemento(categorias, noPedido, indisponivel, montar = true) {
  return (categorias || [])
    .filter((c) => ehComplemento(c.categoria))
    .map((c) => ({ categoria: c.categoria, itens: (c.itens || []).filter((i) => !noPedido.has(i.id) && !indisponivel?.(i) && !abreEscolha(i, montar)).slice(0, 8) }))
    .filter((c) => c.itens.length);
}

export default function QuerMais({ sugestoes, contagem, onAdicionar, onContinuar, onFechar, total, textoContinuar = "Continuar" }) {
  return (
    <div className="quermais-fundo" onClick={onFechar}>
      <div className="quermais-folha" role="dialog" aria-modal="true" aria-label="Vai querer mais alguma coisa?" onClick={(e) => e.stopPropagation()}>
        <h2>Vai querer mais alguma coisa? 😋</h2>
        <p>Uma bebida, um acompanhamento ou uma sobremesa? É só tocar.</p>
        <div className="quermais-lista">
          {sugestoes.map((c) => (
            <div key={c.categoria}>
              <div className="quermais-cat">{c.categoria}</div>
              <div className="quermais-itens">
                {c.itens.map((i) => {
                  const n = contagem(i);
                  return (
                    <button type="button" key={i.id} className={n ? "escolhido" : ""} onClick={() => onAdicionar(i)}>
                      <span>{i.nome}</span>
                      <b>{n ? `${n}× · ` : "+ "}R$ {moeda(i.preco)}</b>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="quermais-continuar" onClick={onContinuar}>
          {textoContinuar} · R$ {moeda(total)}
        </button>
        <button type="button" className="quermais-nao" onClick={onContinuar}>Não, obrigado</button>
      </div>
    </div>
  );
}
