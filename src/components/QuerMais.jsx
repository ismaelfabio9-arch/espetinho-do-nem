// No fim do pedido (cardápio online e QR da mesa): "Vai querer mais alguma coisa?" com bebidas,
// acompanhamentos e sobremesas que ainda não estão no pedido. Um toque adiciona.
import { useState } from "react";
import { abreEscolha, ehCategoriaDeBebida, emojiCategoria } from "../utils/montagem";
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

export default function QuerMais({ sugestoes, contagem, onAdicionar, onContinuar, onFechar, total, textoContinuar = "Continuar", fotos = null }) {
  // Quanto já tinha ao abrir: o botão mostra o que a pessoa acrescentou aqui.
  const [inicial] = useState(total);
  const somou = Math.round((Number(total || 0) - Number(inicial || 0)) * 100) / 100;
  // Bebidas primeiro (é o que mais se acrescenta), depois o resto na ordem da loja.
  const lista = [...sugestoes].sort((a, b) => (ehCategoriaDeBebida(b.categoria) ? 1 : 0) - (ehCategoriaDeBebida(a.categoria) ? 1 : 0));
  return (
    <div className="quermais-fundo" onClick={onFechar}>
      <div className="quermais-folha" role="dialog" aria-modal="true" aria-label="Vai querer mais alguma coisa?" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="quermais-x" onClick={onFechar} aria-label="Fechar">✕</button>
        <h2>Vai querer mais alguma coisa? 😋</h2>
        <p>Toque para pôr na sacola. Arraste para o lado para ver mais.</p>
        <div className="quermais-lista">
          {lista.map((c) => (
            <section key={c.categoria}>
              <h3 className="quermais-cat">
                {emojiCategoria(c.categoria)} {c.categoria}
              </h3>
              <div className="quermais-itens">
                {c.itens.map((i) => {
                  const n = contagem(i);
                  const foto = fotos?.[i.id];
                  return (
                    <button type="button" key={i.id} className={`quermais-card${n ? " escolhido" : ""}`} onClick={() => onAdicionar(i)} aria-label={`${i.nome}: mais 1, R$ ${moeda(i.preco)}`}>
                      {foto ? <img src={foto} alt="" loading="lazy" /> : <span className="quermais-semfoto" aria-hidden="true">{emojiCategoria(c.categoria)}</span>}
                      <span className={`quermais-mais${n ? " com" : ""}`} aria-hidden="true">{n || "+"}</span>
                      <span className="quermais-txt">
                        <span className="quermais-nome">{i.nome}</span>
                        <b>+ R$ {moeda(i.preco)}</b>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="quermais-pe">
          <button type="button" className="quermais-nao" onClick={onContinuar}>Não, obrigado</button>
          <button type="button" className="quermais-continuar" onClick={onContinuar}>
            <span>{textoContinuar}</span>
            <span>{somou > 0 ? `+ R$ ${moeda(somou)}` : `R$ ${moeda(total)}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
