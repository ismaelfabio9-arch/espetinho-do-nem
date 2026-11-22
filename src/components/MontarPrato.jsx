// Janela "Montar o prato": o que vem no prato (toque para tirar), as escolhas, o que vai a mais
// e a bebida em um toque. Usada pelo garçom (MesaDetalhe) e pelo cliente no QR Code da mesa.
import { useState } from "react";
import { cobraEscolhas, escolhaPadrao, escolhidas, grupoCortado, limparEscolha, maxDoGrupo, maxNaEscolha, nomeMontado, precoMontado, precoOpcao, sortear, tipoDe, tipoInfo } from "../utils/montagem";
import "./MontarPrato.css";

const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");

// inicial: a escolha de um prato que já está no pedido (para editar); textoBotao troca o "Adicionar".
/**
 * Toque numa opção. Grupo de 1: troca. Grupo de "até N": marca/desmarca (fica pelo menos 1; cheio, troca a
 * mais antiga). Guarda texto com 1 escolhida e lista com mais.
 */
function tocarOpcao(g, atual, op, maxAgora) {
  const max = maxAgora ?? maxDoGrupo(g);
  // Recheios pelo tamanho: toque tira; com o limite cheio, o novo troca o último que entrou.
  if (g.maxDe) {
    const l = escolhidas(atual);
    if (l.includes(op)) return l.filter((x) => x !== op);
    return l.length < max ? [...l, op] : [...l.slice(0, max - 1), op];
  }
  if (max === 1) return op;
  let lista = escolhidas(atual);
  if (lista.includes(op)) lista = lista.length > 1 ? lista.filter((x) => x !== op) : lista;
  else lista = [...lista, op].slice(-max);
  return lista.length === 1 ? lista[0] : lista;
}

export default function MontarPrato({ produto, bebidas: sugeridas = [], onAdicionar, onFechar, permitirOutros = false, inicial = null, textoBotao = "Adicionar", foto = null }) {
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

  // Trocou o tamanho (10 → 6 sabores): os recheios a mais saem (fica os primeiros).
  function escolher(g, op) {
    const escolhas = { ...escolha.escolhas, [g.nome]: tocarOpcao(g, escolha.escolhas[g.nome], op, maxNaEscolha(g, escolha.escolhas)) };
    (m.escolhas || []).forEach((x) => {
      if (x.maxDe === g.nome) escolhas[x.nome] = escolhidas(escolhas[x.nome]).slice(0, maxNaEscolha(x, escolhas));
    });
    setEscolha({ ...escolha, escolhas });
  }
  // A escolha que define o preço (tamanho, Normal/Artesanal): mostra o preço final de cada opção (6 sabores R$ 13).
  const grupoPreco = (m.escolhas || []).find((g) => !(Number(g.max) > 1) && !g.maxDe && (g.opcoes || []).some((o) => precoOpcao(g, o) > 0)) || null;
  const faltaRecheio = (m.escolhas || []).find((g) => g.maxDe && !grupoCortado(g, escolha.tirar) && !escolhidas(escolha.escolhas[g.nome]).length);

  function adicionar() {
    if (faltaRecheio) return;
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
        {foto && <img className="montar-foto" src={foto} alt={produto.nome} />}
        <div className="montar-topo">
          <h2>{produto.nome}</h2>
          <strong>R$ {moeda(precoPrato)}</strong>
          <button type="button" className="montar-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        {(m.vem || []).length > 0 && (
          <>
            <div className="montar-grupo">{tipo === "prato" ? "VEM NO PRATO" : tipo === "lanche" ? "VEM NO LANCHE" : "VEM"} · toque para tirar</div>
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
            <div className="montar-grupo">
              {g.nome.toUpperCase()}
              {g.maxDe ? ` · ${escolhidas(escolha.escolhas[g.nome]).length} de ${maxNaEscolha(g, escolha.escolhas)}` : maxDoGrupo(g) > 1 && ` · escolha até ${maxDoGrupo(g)}`}
            </div>
            {g.maxDe && (
              <div className="montar-misto">
                <button type="button" className="montar-op montar-misto-btn" onClick={() => setEscolha({ ...escolha, escolhas: { ...escolha.escolhas, [g.nome]: sortear(g.opcoes, maxNaEscolha(g, escolha.escolhas)) } })}>
                  🎲 Misto
                </button>
                <small>Sorteia os {maxNaEscolha(g, escolha.escolhas)}; toque para tirar ou trocar.</small>
              </div>
            )}
            <div className="montar-opcoes">
              {g.opcoes.map((op) => (
                <button type="button" key={op} className={escolhidas(escolha.escolhas[g.nome]).includes(op) ? "montar-op escolhida" : "montar-op"} onClick={() => escolher(g, op)}>
                  {op}
                  {cobraEscolhas(produto) && g === grupoPreco
                    ? ` · R$ ${moeda(Number(produto.preco || 0) + precoOpcao(g, op))}`
                    : cobraEscolhas(produto) && precoOpcao(g, op)
                    ? ` · + R$ ${moeda(precoOpcao(g, op))}`
                    : ""}
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
        <input className="montar-obs" placeholder={tipo === "prato" ? "Ex.: pouco sal, trocar arroz por macaxeira" : tipo === "lanche" ? "Ex.: carne bem passada, molho à parte" : "Ex.: sem açúcar, bem passado"} value={escolha.obs || ""} maxLength={60} onChange={(e) => setEscolha({ ...escolha, obs: e.target.value })} />

        {bebidas.length > 0 && (
          <>
            <div className="montar-grupo">BEBIDA? · um toque</div>
            {[...new Set(bebidas.map((b) => b.grupo || ""))].map((g) => (
              <div key={g || "bebidas"} className="montar-bebidas-grupo">
                {g && <div className="montar-bebidas-cat">{g}</div>}
                <div className="montar-bebidas">
                  {bebidas.filter((b) => (b.grupo || "") === g).map((b) => (
                    <button type="button" key={b.id} className={bebidasEscolhidas.includes(b.id) ? "escolhida" : ""} onClick={() => setBebidasEscolhidas(alternar(bebidasEscolhidas, b.id))}>
                      {b.nome}
                      <span>R$ {moeda(b.preco)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        <button type="button" className="montar-adicionar" onClick={adicionar} disabled={!!faltaRecheio}>
          {faltaRecheio ? `Escolha os ${String(faltaRecheio.nome).toLowerCase()} (ou toque em Misto)` : `${textoBotao} · R$ ${moeda(total)}`}
        </button>
      </div>
    </div>
  );
}
