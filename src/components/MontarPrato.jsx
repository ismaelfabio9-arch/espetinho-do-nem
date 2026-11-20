// Janela "Montar o prato": o que vem no prato (toque para tirar), as escolhas, o que vai a mais
// e a bebida em um toque. Usada pelo garçom (MesaDetalhe) e pelo cliente no QR Code da mesa.
import { useState } from "react";
import { escolhaPadrao, grupoCortado, limparEscolha, nomeMontado, precoMontado, precoOpcao, tipoDe, tipoInfo } from "../utils/montagem";
import "./MontarPrato.css";

const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");

// inicial: a escolha de um prato que já está no pedido (para editar); textoBotao troca o "Adicionar".
export default function MontarPrato({ produto, bebidas: sugeridas = [], onAdicionar, onFechar, permitirOutros = false, inicial = null, textoBotao = "Adicionar" }) {
  const [escolha, setEscolha] = useState(() => {
    const base = escolhaPadrao(produto);
    return inicial ? { ...base, ...inicial, escolhas: { ...base.escolhas, ...(inicial.escolhas || {}) }, tirar: inicial.tirar || [], extras: inicial.extras || [], outros: inicial.outros || [] } : base;
  });
  const [bebidasEscolhidas, setBebidasEscolhidas] = useState([]);
  // "+ Outro" (só o garçom): algo fora da lista, com preço.
  const [outroAberto, setOutroAberto] = useState(false);
  const [outroNome, setOutroNome] = useState("");
  const [outroPreco, setOutroPreco] = useState("");

  function porOutro() {
    const nome = outroNome.trim().slice(0, 40);
    if (!nome) return;
    const preco = Math.max(0, Number(String(outroPreco).replace(",", ".")) || 0);
    setEscolha((e) => ({ ...e, outros: [...(e.outros || []), { nome, preco }] }));
    setOutroNome("");
    setOutroPreco("");
    setOutroAberto(false);
  }
  const m = produto.montagem || {};
  const tipo = tipoDe(produto);
  // Bebida em um toque só depois do prato (no picolé ou na tapioca não faz sentido).
  const bebidas = tipo === "prato" ? sugeridas : [];

  const alternar = (lista, valor) => (lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);
  const precoPrato = precoMontado(produto, escolha);
  const total = precoPrato + bebidas.filter((b) => bebidasEscolhidas.includes(b.id)).reduce((s, b) => s + Number(b.preco || 0), 0);

  // Tirar/voltar um item do prato: a escolha com o mesmo nome some junto (e volta com a 1ª opção).
  function alternarVem(v) {
    const tirar = alternar(escolha.tirar, v);
    const escolhas = { ...escolha.escolhas };
    (m.escolhas || []).forEach((g) => {
      if (grupoCortado(g, tirar)) delete escolhas[g.nome];
      else if (!escolhas[g.nome] && (g.opcoes || []).length) escolhas[g.nome] = g.opcoes[0];
    });
    setEscolha({ ...escolha, tirar, escolhas });
  }

  function adicionar() {
    const final = limparEscolha(produto, escolha);
    onAdicionar({
      prato: {
        produtoId: produto.id,
        nome: nomeMontado(produto, final),
        nomeBase: produto.nome,
        preco: precoPrato,
        montagem: final,
      },
      bebidas: bebidas.filter((b) => bebidasEscolhidas.includes(b.id)),
    });
  }

  return (
    <div className="montar-fundo" onClick={onFechar}>
      <div className="montar-folha" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${tipoInfo(tipo).titulo || "Escolher"}: ${produto.nome}`}>
        <div className="montar-topo">
          <h2>{produto.nome}</h2>
          <strong>R$ {moeda(precoPrato)}</strong>
          <button type="button" className="montar-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        {(m.vem || []).length > 0 && (
          <>
            <div className="montar-grupo">{tipo === "prato" ? "VEM NO PRATO" : "VEM"} · toque para tirar</div>
            <div className="montar-opcoes">
              {m.vem.map((v) => {
                const tirou = escolha.tirar.includes(v);
                return (
                  <button type="button" key={v} className={tirou ? "montar-op tirou" : "montar-op tem"} onClick={() => alternarVem(v)}>
                    {tirou ? v : `✓ ${v}`}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {(m.escolhas || []).filter((g) => !grupoCortado(g, escolha.tirar)).map((g) => (
          <div key={g.nome}>
            <div className="montar-grupo">{g.nome.toUpperCase()}</div>
            <div className="montar-opcoes">
              {g.opcoes.map((op) => (
                <button type="button" key={op} className={escolha.escolhas[g.nome] === op ? "montar-op escolhida" : "montar-op"} onClick={() => setEscolha({ ...escolha, escolhas: { ...escolha.escolhas, [g.nome]: op } })}>
                  {op}
                  {precoOpcao(g, op) ? ` · + R$ ${moeda(precoOpcao(g, op))}` : ""}
                </button>
              ))}
            </div>
          </div>
        ))}

        {((m.extras || []).length > 0 || permitirOutros) && (
          <>
            <div className="montar-grupo">A MAIS</div>
            <div className="montar-opcoes">
              {(m.extras || []).map((e) => (
                <button type="button" key={e.nome} className={escolha.extras.includes(e.nome) ? "montar-op escolhida" : "montar-op"} onClick={() => setEscolha({ ...escolha, extras: alternar(escolha.extras, e.nome) })}>
                  + {e.nome} · R$ {moeda(e.preco)}
                </button>
              ))}
              {(escolha.outros || []).map((o, i) => (
                <button type="button" key={`o${i}`} className="montar-op escolhida" title="Toque para tirar" onClick={() => setEscolha({ ...escolha, outros: escolha.outros.filter((_, j) => j !== i) })}>
                  + {o.nome}{o.preco ? ` · R$ ${moeda(o.preco)}` : ""} ✕
                </button>
              ))}
              {permitirOutros && !outroAberto && (
                <button type="button" className="montar-op montar-outro" onClick={() => setOutroAberto(true)}>
                  + Outro
                </button>
              )}
            </div>
            {permitirOutros && outroAberto && (
              <div className="montar-outro-linha">
                <input autoFocus placeholder="O quê? Ex.: macarrão" value={outroNome} onChange={(e) => setOutroNome(e.target.value)} maxLength={40} />
                <input inputMode="decimal" placeholder="R$ 0,00" value={outroPreco} onChange={(e) => setOutroPreco(e.target.value)} />
                <button type="button" onClick={porOutro}>Pôr</button>
              </div>
            )}
          </>
        )}

        <div className="montar-grupo">OBSERVAÇÃO</div>
        <input className="montar-obs" placeholder={tipo === "prato" ? "Ex.: pouco sal, trocar arroz por macaxeira" : "Ex.: sem açúcar, bem passado"} value={escolha.obs || ""} maxLength={60} onChange={(e) => setEscolha({ ...escolha, obs: e.target.value })} />

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
          {textoBotao} · R$ {moeda(total)}
        </button>
      </div>
    </div>
  );
}
