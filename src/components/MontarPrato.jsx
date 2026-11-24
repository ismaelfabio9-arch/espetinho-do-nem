// Janela "Montar o prato": o que vem no prato (toque para tirar), as escolhas, o que vai a mais
// e a bebida em um toque. Usada pelo garçom (MesaDetalhe) e pelo cliente no QR Code da mesa.
import { useState } from "react";
import { cobraEscolhas, ehEscolhaDeTamanho, escolhaPadrao, escolhidas, grupoCortado, limparEscolha, maxDoGrupo, maxNaEscolha, nomeMontado, precoMontado, precoOpcao, sortear, tipoDe, tipoInfo } from "../utils/montagem";
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
  if (g.maxDe || g.livre) {
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

export default function MontarPrato({ produto, bebidas: sugeridas = [], onAdicionar, onFechar, permitirOutros = false, inicial = null, textoBotao = "Adicionar", foto = null, fotos = null, claro = false }) {
  // Quantidade (só ao pôr um novo; editando, fica a quantidade que já estava).
  const [qtd, setQtd] = useState(1);
  const comQtd = !inicial;
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
  const total = precoPrato * (comQtd ? qtd : 1) + bebidas.filter((b) => bebidasEscolhidas.includes(b.id)).reduce((s, b) => s + Number(b.preco || 0), 0);

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
      qtd: comQtd ? qtd : 1,
    });
  }

  const visiveis = (m.escolhas || []).filter((g) => !grupoCortado(g, escolha.tirar));
  const doTopo = visiveis.filter(ehEscolhaDeTamanho);
  const resto = visiveis.filter((g) => !ehEscolhaDeTamanho(g));
  // Situação do passo: ✓ escolhido, "falta N" (recheios pelo tamanho) ou opcional.
  function situacao(g) {
    const n = escolhidas(escolha.escolhas[g.nome]).length;
    if (g.livre) return n ? { ok: true, txt: `✓ ${n}` } : { ok: null, txt: "opcional" };
    if (g.maxDe) {
      const max = maxNaEscolha(g, escolha.escolhas);
      return n >= max ? { ok: true, txt: "✓" } : { ok: false, txt: `falta ${max - n}` };
    }
    return n ? { ok: true, txt: "✓" } : { ok: false, txt: "escolha" };
  }
  // Resumo do que está escolhido (no topo e, no computador, na coluna da foto).
  const resumo = [
    ...visiveis.flatMap((g) => escolhidas(escolha.escolhas[g.nome]).map((op) => ({ nome: op, preco: cobraEscolhas(produto) && g !== grupoPreco ? precoOpcao(g, op) : g === grupoPreco ? Number(produto.preco || 0) + precoOpcao(g, op) : 0 }))),
    ...escolha.tirar.map((v) => ({ nome: `sem ${v}`, preco: 0 })),
    ...(m.extras || []).filter((e) => escolha.extras.includes(e.nome)).map((e) => ({ nome: `+ ${e.nome}`, preco: Number(e.preco || 0) })),
    ...(escolha.outros || []).map((o) => ({ nome: `+ ${o.nome}`, preco: Number(o.preco || 0) })),
  ];
  let passo = 0;
  const titulo = (texto, extra, st) => (
    <h3 className="montar-passo-titulo">
      <span className="montar-num">{++passo}</span>
      <span className="montar-passo-nome">
        {texto}
        {extra && <small> · {extra}</small>}
      </span>
      {st && <span className={`montar-status ${st.ok === true ? "ok" : st.ok === false ? "falta" : ""}`}>{st.txt}</span>}
    </h3>
  );
  const grupoNaTela = (g) => {
    const tiles = ehEscolhaDeTamanho(g) && (g.opcoes || []).length <= 4;
    return (
      <section className="montar-passo" key={g.nome}>
        {titulo(g.nome, g.livre ? "quantos quiser" : g.maxDe ? `${escolhidas(escolha.escolhas[g.nome]).length} de ${maxNaEscolha(g, escolha.escolhas)}` : maxDoGrupo(g) > 1 ? `até ${maxDoGrupo(g)}` : "", situacao(g))}
        {g.maxDe && (
          <div className="montar-misto">
            <button type="button" className="montar-op montar-misto-btn" onClick={() => setEscolha({ ...escolha, escolhas: { ...escolha.escolhas, [g.nome]: sortear(g.opcoes, maxNaEscolha(g, escolha.escolhas)) } })}>
              Misto
            </button>
          </div>
        )}
        <div className={tiles ? "montar-tams" : "montar-opcoes"} style={tiles ? { gridTemplateColumns: `repeat(${g.opcoes.length}, 1fr)` } : undefined}>
          {g.opcoes.map((op) => {
            const on = escolhidas(escolha.escolhas[g.nome]).includes(op);
            const preco = cobraEscolhas(produto) && g === grupoPreco ? `R$ ${moeda(Number(produto.preco || 0) + precoOpcao(g, op))}` : cobraEscolhas(produto) && precoOpcao(g, op) ? `+ R$ ${moeda(precoOpcao(g, op))}` : "";
            return tiles ? (
              <button type="button" key={op} className={on ? "montar-tam on" : "montar-tam"} aria-pressed={on} onClick={() => escolher(g, op)}>
                {op}
                {preco && <b>{preco}</b>}
              </button>
            ) : (
              <button type="button" key={op} className={on ? "montar-op escolhida" : "montar-op"} aria-pressed={on} onClick={() => escolher(g, op)}>
                {on ? "✓ " : ""}
                {op}
                {preco ? ` · ${preco}` : ""}
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className={`montar-fundo${claro ? " montar-claro" : ""}`} onClick={onFechar}>
      <div className={`montar-folha${foto ? " com-foto" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${tipoInfo(tipo).titulo || "Escolher"}: ${produto.nome}`}>
        <button type="button" className="montar-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
        <div className="montar-rolagem">
          <div className="montar-esq">
            {foto && (
              <div className="montar-capa">
                <img className="montar-foto" src={foto} alt={produto.nome} />
              </div>
            )}
            <div className="montar-cab">
              <h2>{produto.nome}</h2>
              <p className="montar-resumo">{resumo.length ? resumo.map((r) => r.nome).join(" · ") : `R$ ${moeda(precoPrato)}`}</p>
            </div>
            {resumo.length > 0 && (
              <ul className="montar-resumo-lista" aria-label="Resumo">
                {resumo.map((r, i) => (
                  <li key={i}>
                    <span>{r.nome}</span>
                    <span>{r.preco ? `R$ ${moeda(r.preco)}` : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="montar-corpo">
            {/* Tamanho (peixe pequeno, médio, grande; açaí 300 ml, 500 ml) vem primeiro: é o que define o produto e o preço. */}
            {doTopo.map(grupoNaTela)}

            {(m.vem || []).length > 0 && (
              <section className="montar-passo">
                {titulo(tipo === "prato" ? "Vem no prato" : tipo === "lanche" ? "Vem no lanche" : "Vem")}
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
              </section>
            )}

            {resto.map(grupoNaTela)}

            {((m.extras || []).length > 0 || permitirOutros) && (
              <section className="montar-passo">
                {titulo("A mais", "", escolha.extras.length + (escolha.outros || []).length ? { ok: true, txt: `✓ ${escolha.extras.length + (escolha.outros || []).length}` } : { ok: null, txt: "opcional" })}
                <div className="montar-extras">
                  {(m.extras || []).map((e) => {
                    const on = escolha.extras.includes(e.nome);
                    return (
                      <button type="button" key={e.nome} className={on ? "montar-extra on" : "montar-extra"} aria-pressed={on} onClick={() => setEscolha({ ...escolha, extras: alternar(escolha.extras, e.nome) })}>
                        <span>{e.nome}</span>
                        <small>{Number(e.preco) > 0 ? `+ R$ ${moeda(e.preco)}` : "grátis"}</small>
                        <i aria-hidden="true">{on ? "✓" : "+"}</i>
                      </button>
                    );
                  })}
                  {(escolha.outros || []).map((o, i) => (
                    <button type="button" key={`o${i}`} className="montar-extra on" title="Toque para tirar" onClick={() => setEscolha({ ...escolha, outros: escolha.outros.filter((_, j) => j !== i) })}>
                      <span>{o.nome}</span>
                      <small>{o.preco ? `+ R$ ${moeda(o.preco)}` : "grátis"}</small>
                      <i aria-hidden="true">✕</i>
                    </button>
                  ))}
                </div>
                {permitirOutros && !outroAberto && (
                  <button type="button" className="montar-op montar-outro" onClick={() => setOutroAberto(true)}>
                    + Outro
                  </button>
                )}
                {permitirOutros && outroAberto && (
                  <div className="montar-outro-linha">
                    <input autoFocus placeholder="O quê? Ex.: macarrão" value={outroNome} onChange={(e) => setOutroNome(e.target.value)} maxLength={40} />
                    <input inputMode="decimal" placeholder="R$ 0,00" value={outroPreco} onChange={(e) => setOutroPreco(e.target.value)} />
                    <button type="button" onClick={porOutro}>Pôr</button>
                  </div>
                )}
              </section>
            )}

            {bebidas.length > 0 && (
              <section className="montar-passo">
                 {titulo("Bebida", "", bebidasEscolhidas.length ? { ok: true, txt: `✓ ${bebidasEscolhidas.length}` } : { ok: null, txt: "opcional" })}
                {[...new Set(bebidas.map((b) => b.grupo || ""))].map((g) => (
                  <div key={g || "bebidas"} className="montar-bebidas-grupo">
                    {g && <div className="montar-bebidas-cat">{g}</div>}
                    <div className="montar-bebidas">
                      {bebidas.filter((b) => (b.grupo || "") === g).map((b) => (
                        <button type="button" key={b.id} className={`${bebidasEscolhidas.includes(b.id) ? "escolhida" : ""}${fotos?.[b.id] ? " com-foto" : ""}`} onClick={() => setBebidasEscolhidas(alternar(bebidasEscolhidas, b.id))}>
                          {fotos?.[b.id] && <img src={fotos[b.id]} alt="" loading="lazy" />}
                          <span className="montar-beb-nome">{b.nome}</span>
                          <span>R$ {moeda(b.preco)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className="montar-passo">
              <h3 className="montar-passo-titulo">
                <span className="montar-passo-nome">Observação</span>
              </h3>
              <input className="montar-obs" placeholder="Observação para a cozinha" value={escolha.obs || ""} maxLength={60} onChange={(e) => setEscolha({ ...escolha, obs: e.target.value })} />
            </section>
          </div>
        </div>

        <div className="montar-pe">
          {comQtd && (
            <div className="montar-qtd" aria-label="Quantidade">
              <button type="button" onClick={() => setQtd((n) => Math.max(1, n - 1))} aria-label="Menos 1">−</button>
              <b>{qtd}</b>
              <button type="button" onClick={() => setQtd((n) => Math.min(50, n + 1))} aria-label="Mais 1">+</button>
            </div>
          )}
          <button type="button" className="montar-adicionar" onClick={adicionar} disabled={!!faltaRecheio}>
            {faltaRecheio ? (
              `Escolha: ${String(faltaRecheio.nome).toLowerCase()}`
            ) : (
              <>
                <span>{textoBotao}</span>
                <span>R$ {moeda(total)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
