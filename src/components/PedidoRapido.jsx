// Tela rápida do garçom: busca e categorias presas no topo e os produtos em grade com foto (1 toque = +1;
// prato com montagem abre a janela "Montar o prato"). No computador as categorias ficam numa coluna à esquerda.
import { useMemo, useState } from "react";
import { abreEscolha, ehCategoriaDePrato, precosDoCardapio, tipoDe } from "../utils/montagem";
import "./PedidoRapido.css";

const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");
const curto = (v) => (Number(v) % 1 ? moeda(v) : String(Number(v)));
const semAcento = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** "Marmita P" → "P", "Copo 300ml" → "300ml": o que muda entre as opções (para caber no card). */
function rotulos(nomes) {
  const partes = nomes.map((n) => String(n).split(" "));
  const menor = Math.min(...partes.map((p) => p.length));
  let igual = 0;
  for (let k = 0; k < menor - 1; k++) {
    const palavra = partes[0][k];
    if (partes.some((p) => p[k] !== palavra)) break;
    igual = k + 1;
  }
  return partes.map((p) => p.slice(igual).join(" "));
}

export default function PedidoRapido({ categorias, contagem, onTocar, emoji, indisponivel, montar = true, fotos = null }) {
  const [busca, setBusca] = useState("");
  // Sem escolha do garçom, abre nos pratos (a 1ª categoria de prato na ordem da loja).
  const [cat, setCat] = useState("");
  const atual = categorias.find((c) => c.categoria === cat) || categorias.find((c) => ehCategoriaDePrato(c.categoria)) || categorias[0];

  const itens = useMemo(() => {
    const q = semAcento(busca.trim());
    if (q) return categorias.flatMap((c) => c.itens).filter((i) => semAcento(i.nome).includes(q) || semAcento((i.montagem?.vem || []).join(" ")).includes(q));
    return atual?.itens || [];
  }, [busca, categorias, atual]);
  // Foto da categoria: a do 1º produto dela que tem foto.
  const fotoDaCat = (c) => (fotos ? (c.itens || []).map((i) => fotos[i.id]).find(Boolean) : null);

  return (
    <div className={`rapido${fotos && Object.keys(fotos).length ? " rapido-com-fotos" : ""}`}>
      <div className="rapido-fixo">
        <input className="rapido-busca" type="search" placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {!busca.trim() && (
          <div className="rapido-cats">
            {categorias.map((c) => {
              const f = fotoDaCat(c);
              return (
                <button type="button" key={c.categoria} className={c.categoria === atual?.categoria ? "ativa" : ""} onClick={() => setCat(c.categoria)}>
                  {f ? <img src={f} alt="" /> : emoji ? <span className="rapido-cat-emoji" aria-hidden="true">{emoji(c.categoria)}</span> : null}
                  <span className="rapido-cat-nome">{c.categoria}</span>
                  <small>{(c.itens || []).length}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="rapido-lista">
        <div className="rapido-titulo">
          <h3>{busca.trim() ? (itens.length ? `${itens.length} ${itens.length === 1 ? "resultado" : "resultados"}` : "Nada encontrado") : `${emoji ? `${emoji(atual?.categoria)} ` : ""}${atual?.categoria || ""}`}</h3>
          {!busca.trim() && <small>{itens.length} {itens.length === 1 ? "item" : "itens"}</small>}
        </div>
        {itens.length > 0 && (
          <div className="rapido-grade">
            {itens.map((item) => {
              const n = contagem(item);
              const off = indisponivel ? indisponivel(item) : false;
              const precos = precosDoCardapio(item);
              const foto = fotos?.[item.id];
              const nomes = precos ? rotulos(precos.map((x) => x.nome)) : [];
              return (
                <button type="button" key={item.id} className={`rapido-item${off ? " off" : n ? " sel" : ""}${foto ? " com-foto" : ""}`} onClick={() => onTocar(item)} disabled={off}>
                  {foto ? (
                    <img className="rapido-foto" src={foto} alt="" loading="lazy" />
                  ) : fotos ? (
                    <span className="rapido-semfoto" aria-hidden="true">{emoji ? emoji(item.categoria || atual?.categoria) : "🍽️"}</span>
                  ) : null}
                  {!off && <span className={`rapido-mais${n ? " com" : ""}`} aria-hidden="true">{n || "+"}</span>}
                  {off && <span className="rapido-tag">Esgotado</span>}
                  <span className="rapido-txt">
                    <strong>{item.nome}</strong>
                    {(item.montagem?.vem || []).length > 0 && <span className="rapido-vem">{item.montagem.vem.join(", ")}</span>}
                    {precos ? (
                      <>
                        <span className="rapido-preco">a partir de R$ {moeda(Math.min(...precos.map((x) => x.preco)))}</span>
                        <span className="rapido-tams">
                          {precos.map((x, k) => (
                            <span key={x.nome} title={x.nome}>
                              <small>{nomes[k]}</small> {curto(x.preco)}
                            </span>
                          ))}
                        </span>
                      </>
                    ) : (
                      <span className="rapido-preco">R$ {moeda(item.preco)}</span>
                    )}
                    {!off && abreEscolha(item, montar) && <span className="rapido-montar">{{ prato: "montar", lanche: "montar", sabor: "sabor", recheio: "escolher" }[tipoDe(item)] || "escolher"} ›</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
