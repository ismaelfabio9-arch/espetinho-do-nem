// Janela "Montar o prato": o que vem no prato (toque para tirar), as escolhas, o que vai a mais
// e a bebida em um toque. Usada pelo garçom (MesaDetalhe) e pelo cliente no QR Code da mesa.
import { useState } from "react";
import { escolhaPadrao, nomeMontado, precoMontado } from "../utils/montagem";
import "./MontarPrato.css";

const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");

export default function MontarPrato({ produto, bebidas = [], onAdicionar, onFechar }) {
  const [escolha, setEscolha] = useState(() => escolhaPadrao(produto));
  const [bebidasEscolhidas, setBebidasEscolhidas] = useState([]);
  const m = produto.montagem || {};

  const alternar = (lista, valor) => (lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);
  const precoPrato = precoMontado(produto, escolha);
  const total = precoPrato + bebidas.filter((b) => bebidasEscolhidas.includes(b.id)).reduce((s, b) => s + Number(b.preco || 0), 0);

  function adicionar() {
    onAdicionar({
      prato: {
        produtoId: produto.id,
        nome: nomeMontado(produto, escolha),
        nomeBase: produto.nome,
        preco: precoPrato,
        montagem: escolha,
      },
      bebidas: bebidas.filter((b) => bebidasEscolhidas.includes(b.id)),
    });
  }

  return (
    <div className="montar-fundo" onClick={onFechar}>
      <div className="montar-folha" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Montar ${produto.nome}`}>
        <div className="montar-topo">
          <h2>{produto.nome}</h2>
          <strong>R$ {moeda(precoPrato)}</strong>
          <button type="button" className="montar-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        {(m.vem || []).length > 0 && (
          <>
            <div className="montar-grupo">VEM NO PRATO · toque para tirar</div>
            <div className="montar-opcoes">
              {m.vem.map((v) => {
                const tirou = escolha.tirar.includes(v);
                return (
                  <button type="button" key={v} className={tirou ? "montar-op tirou" : "montar-op tem"} onClick={() => setEscolha({ ...escolha, tirar: alternar(escolha.tirar, v) })}>
                    {tirou ? v : `✓ ${v}`}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {(m.escolhas || []).map((g) => (
          <div key={g.nome}>
            <div className="montar-grupo">{g.nome.toUpperCase()}</div>
            <div className="montar-opcoes">
              {g.opcoes.map((op) => (
                <button type="button" key={op} className={escolha.escolhas[g.nome] === op ? "montar-op escolhida" : "montar-op"} onClick={() => setEscolha({ ...escolha, escolhas: { ...escolha.escolhas, [g.nome]: op } })}>
                  {op}
                </button>
              ))}
            </div>
          </div>
        ))}

        {(m.extras || []).length > 0 && (
          <>
            <div className="montar-grupo">A MAIS</div>
            <div className="montar-opcoes">
              {m.extras.map((e) => (
                <button type="button" key={e.nome} className={escolha.extras.includes(e.nome) ? "montar-op escolhida" : "montar-op"} onClick={() => setEscolha({ ...escolha, extras: alternar(escolha.extras, e.nome) })}>
                  + {e.nome} · R$ {moeda(e.preco)}
                </button>
              ))}
            </div>
          </>
        )}

        {bebidas.length > 0 && (
          <>
            <div className="montar-grupo">BEBIDA? · um toque</div>
            <div className="montar-bebidas">
              {bebidas.map((b) => (
                <button type="button" key={b.id} className={bebidasEscolhidas.includes(b.id) ? "escolhida" : ""} onClick={() => setBebidasEscolhidas(alternar(bebidasEscolhidas, b.id))}>
                  {b.nome}
                  <span>R$ {moeda(b.preco)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <button type="button" className="montar-adicionar" onClick={adicionar}>
          Adicionar · R$ {moeda(total)}
        </button>
      </div>
    </div>
  );
}
