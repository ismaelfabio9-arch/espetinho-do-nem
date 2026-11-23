// Telas do cliente (QR Code da mesa e cardápio online): cabeçalho da loja, cardápio inteiro por seções
// (categorias presas no topo, que acompanham a rolagem), barra da sacola e a sacola.
// A lógica do pedido continua em cada página; aqui é só a aparência e a navegação.
import { useEffect, useMemo, useRef, useState } from "react";
import { abreEscolha, precosDoCardapio, tipoDe } from "../../utils/montagem";
import "./Cliente.css";

export const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");
const semAcento = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const idDaSecao = (nome) => `cl-sec-${semAcento(nome).replace(/[^a-z0-9]+/g, "-")}`;

/** Cabeçalho da loja: inicial do nome, nome, selos (Aberto, Mesa 4, Entrega) e os atalhos. */
export function ClienteTopo({ nome, selos = [], linha, acoes = [], aviso, children }) {
  const inicial = String(nome || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <header className="cl-topo">
      <div className="cl-capa" aria-hidden="true" />
      <div className="cl-topo-corpo">
        <div className="cl-loja">
          <span className="cl-logo" aria-hidden="true">{inicial}</span>
          <div className="cl-loja-txt">
            <h1>{nome || "Cardápio"}</h1>
            {linha && <p>{linha}</p>}
          </div>
        </div>
        {selos.length > 0 && (
          <div className="cl-selos">
            {selos.filter(Boolean).map((s, i) => (
              <span key={i} className={`cl-selo ${s.tom || ""}`}>{s.texto}</span>
            ))}
          </div>
        )}
        {aviso && <p className="cl-aviso">{aviso}</p>}
        {acoes.filter(Boolean).length > 0 && (
          <div className="cl-acoes">
            {acoes.filter(Boolean).map((a) =>
              a.href ? (
                <a key={a.texto} className="cl-acao" href={a.href} target="_blank" rel="noopener noreferrer">
                  <span aria-hidden="true">{a.icone}</span>
                  <b>{a.texto}</b>
                  {a.sub && <small>{a.sub}</small>}
                </a>
              ) : (
                <button key={a.texto} type="button" className={`cl-acao ${a.destaque ? "destaque" : ""}`} onClick={a.onClick} disabled={a.disabled}>
                  <span aria-hidden="true">{a.icone}</span>
                  <b>{a.texto}</b>
                  {a.sub && <small>{a.sub}</small>}
                </button>
              )
            )}
          </div>
        )}
        {children}
      </div>
    </header>
  );
}

/** Um produto da lista: nome, o que vem, preço (ou preços por tamanho), foto à direita e o +. */
function Produto({ item, n, off, foto, emoji, montar, onTocar }) {
  const precos = precosDoCardapio(item);
  const escolhe = abreEscolha(item, montar);
  return (
    <button type="button" className={`cl-prod ${n ? "sel" : ""} ${off ? "off" : ""}`} onClick={() => onTocar(item)} disabled={off}>
      <span className="cl-prod-txt">
        <strong>{item.nome}</strong>
        {(item.montagem?.vem || []).length > 0 && <span className="cl-prod-vem">{item.montagem.vem.join(", ")}</span>}
        {precos ? (
          <span className="cl-prod-precos">
            {precos.map((x) => (
              <span key={x.nome}>
                <small>{x.nome}</small> R$ {moeda(x.preco)}
              </span>
            ))}
          </span>
        ) : (
          <span className="cl-prod-preco">R$ {moeda(item.preco)}</span>
        )}
        {off ? <span className="cl-prod-esgotado">Esgotado</span> : escolhe && <span className="cl-prod-montar">{{ prato: "Montar o prato", lanche: "Montar o lanche", sabor: "Escolher o sabor", recheio: "Escolher" }[tipoDe(item)] || "Escolher"} ›</span>}
      </span>
      <span className="cl-prod-foto">
        {foto ? <img src={foto} alt="" loading="lazy" /> : <span className="cl-prod-emoji" aria-hidden="true">{emoji}</span>}
        {!off && <span className={`cl-prod-mais ${n ? "com" : ""}`} aria-hidden="true">{n ? n : "+"}</span>}
      </span>
    </button>
  );
}

/**
 * Cardápio inteiro, uma seção por categoria. A faixa de categorias fica presa no topo e marca a seção que
 * está na tela; tocar numa categoria rola até ela. A busca procura em tudo.
 */
export function CardapioCliente({ categorias, contagem, onTocar, emoji, indisponivel, montar = true, fotos = null }) {
  const [busca, setBusca] = useState("");
  const [ativa, setAtiva] = useState(categorias[0]?.categoria || "");
  const faixa = useRef(null);

  // Marca na faixa a categoria que está aparecendo (a última seção cujo título já passou do topo).
  useEffect(() => {
    if (busca.trim()) return undefined;
    const aoRolar = () => {
      let atual = categorias[0]?.categoria || "";
      for (const c of categorias) {
        const el = document.getElementById(idDaSecao(c.categoria));
        if (el && el.getBoundingClientRect().top <= 140) atual = c.categoria;
      }
      setAtiva((a) => (a === atual ? a : atual));
    };
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, [categorias, busca]);

  // A categoria marcada fica visível na faixa (rola a faixa para o lado).
  useEffect(() => {
    const b = faixa.current?.querySelector(`[data-cat="${CSS.escape(ativa)}"]`);
    if (b && faixa.current) faixa.current.scrollTo({ left: b.offsetLeft - 16, behavior: "smooth" });
  }, [ativa]);

  const achados = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return null;
    return categorias.flatMap((c) => (c.itens || []).map((i) => ({ ...i, _cat: c.categoria }))).filter((i) => semAcento(i.nome).includes(q) || semAcento((i.montagem?.vem || []).join(" ")).includes(q));
  }, [busca, categorias]);

  const ir = (cat) => {
    setAtiva(cat);
    const el = document.getElementById(idDaSecao(cat));
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 118, behavior: "smooth" });
  };

  const produto = (item, cat) => (
    <Produto key={item.id} item={item} n={contagem(item)} off={indisponivel ? indisponivel(item) : false} foto={fotos?.[item.id]} emoji={emoji ? emoji(cat) : "🍽️"} montar={montar} onTocar={onTocar} />
  );

  return (
    <div className="cl-cardapio">
      <div className="cl-fixo">
        <input className="cl-busca" type="search" placeholder="🔍 Buscar no cardápio" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no cardápio" />
        {!achados && (
          <nav className="cl-cats" ref={faixa} aria-label="Categorias">
            {categorias.map((c) => (
              <button type="button" key={c.categoria} data-cat={c.categoria} className={c.categoria === ativa ? "ativa" : ""} onClick={() => ir(c.categoria)}>
                {emoji ? `${emoji(c.categoria)} ` : ""}
                {c.categoria}
              </button>
            ))}
          </nav>
        )}
      </div>

      {achados ? (
        <section className="cl-secao">
          <h2>{achados.length ? `${achados.length} ${achados.length === 1 ? "resultado" : "resultados"}` : "Nada encontrado"}</h2>
          <div className="cl-lista">{achados.map((i) => produto(i, i._cat))}</div>
        </section>
      ) : (
        categorias.map((c) => (
          <section key={c.categoria} id={idDaSecao(c.categoria)} className="cl-secao">
            <h2>
              {emoji ? `${emoji(c.categoria)} ` : ""}
              {c.categoria}
              <small>{(c.itens || []).length}</small>
            </h2>
            <div className="cl-lista">{(c.itens || []).map((i) => produto(i, c.categoria))}</div>
          </section>
        ))
      )}
    </div>
  );
}

/** Barra presa embaixo: a sacola (ou outra ação, como a conta da mesa). */
export function BarraSacola({ qtd, total, texto = "Ver sacola", onClick, secundario }) {
  return (
    <div className="cl-barra">
      {secundario}
      {qtd > 0 && (
        <button type="button" className="cl-barra-btn" onClick={onClick}>
          <span className="cl-barra-qtd">
            🛍️ <b>{qtd}</b>
          </span>
          <span>{texto}</span>
          <strong>R$ {moeda(total)}</strong>
        </button>
      )}
    </div>
  );
}

/** Janela que sobe de baixo (sacola, conta da mesa). */
export function Folha({ titulo, onFechar, children, rodape }) {
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);
  return (
    <div className="cl-folha-fundo" onClick={onFechar}>
      <div className="cl-folha" role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="cl-folha-topo">
          <h2>{titulo}</h2>
          <button type="button" className="cl-x" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        <div className="cl-folha-corpo">{children}</div>
        {rodape && <div className="cl-folha-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

/** As escolhas do prato montado em lista curta: "Marmita P", "Feijão preto", "sem Cebola", "+ Ovo", "Obs.: pouco sal". */
export function detalhesMontagem(m) {
  if (!m) return [];
  const esc = Object.values(m.escolhas || {}).flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []));
  return [
    ...esc,
    ...(m.tirar || []).map((t) => `sem ${t}`),
    ...(m.extras || []).map((e) => `+ ${e}`),
    ...(m.outros || []).map((o) => `+ ${o.nome}`),
    ...(m.obs ? [`Obs.: ${m.obs}`] : []),
  ];
}

/** Itens da sacola: foto, nome, as escolhas em lista, − quantidade +, editar e o valor de cada linha. */
export function ItensSacola({ linhas, onMais, onMenos, onEditar, podeEditar = () => false, fotos = null, nomeBase = null }) {
  if (!linhas.length) return <p className="cl-vazio">A sacola está vazia. Toque nos produtos para pedir.</p>;
  return (
    <ul className="cl-itens">
      {linhas.map((l) => {
        const det = detalhesMontagem(l.montagem);
        const foto = fotos?.[l.produtoId];
        return (
          <li key={l.chave} className={foto ? "com-foto" : ""}>
            {foto && <img className="cl-item-foto" src={foto} alt="" loading="lazy" />}
            <div className="cl-item-txt">
              <strong>{(l.montagem && nomeBase?.(l)) || l.nome}</strong>
              {det.length > 0 ? (
                <ul className="cl-item-det">
                  {det.map((d, k) => (
                    <li key={k}>{d}</li>
                  ))}
                </ul>
              ) : (
                <small>R$ {moeda(l.preco)} cada</small>
              )}
              {l.montagem && podeEditar(l) && (
                <button type="button" className="cl-link" onClick={() => onEditar(l)}>
                  ✏️ Editar
                </button>
              )}
            </div>
            <div className="cl-qtd">
              <button type="button" onClick={() => onMenos(l.chave)} aria-label={`Tirar 1 ${l.nome}`}>{l.quantidade === 1 ? "🗑️" : "−"}</button>
              <b>{l.quantidade}</b>
              <button type="button" onClick={() => onMais(l.chave)} aria-label={`Mais 1 ${l.nome}`}>+</button>
            </div>
            <strong className="cl-item-valor">R$ {moeda(l.preco * l.quantidade)}</strong>
          </li>
        );
      })}
    </ul>
  );
}
