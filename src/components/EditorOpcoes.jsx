// Opções do produto no cadastro, sem texto para decorar: o que vem (o cliente tira), o que o cliente
// escolhe (Normal/Artesanal, tamanho, até 2 patês…) e os adicionais com preço. Grava o mesmo "montagem"
// que o pedido, o QR Code e o servidor usam (utils/montagem.js).
import { useState } from "react";
import { TIPOS } from "../utils/montagem";
import "./EditorOpcoes.css";

const moeda = (v) => (Number(v) > 0 ? String(Math.round(Number(v) * 100) / 100).replace(".", ",") : "");
const numero = (t) => {
  const v = Number(String(t ?? "").trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};

/** Produto salvo → o que a tela edita (preços como texto). */
export function opcoesParaEditar(produto) {
  const m = produto?.montagem || {};
  return {
    vem: [...(m.vem || [])],
    escolhas: (m.escolhas || []).map((g) => ({ nome: g.nome, max: Number(g.max) > 1 ? Number(g.max) : 1, opcoes: (g.opcoes || []).map((o) => ({ nome: o, mais: moeda(g.precos?.[o]) })) })),
    extras: (m.extras || []).map((e) => ({ nome: e.nome, preco: moeda(e.preco) })),
  };
}

/** O que a tela edita → montagem salva (null quando não tem nada). */
export function opcoesParaSalvar(tipo, ed) {
  if (tipo === "simples") return null;
  const limpa = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const vem = tipo === "prato" || tipo === "lanche" ? [...new Set(ed.vem.map(limpa).filter(Boolean))].slice(0, 12) : [];
  const escolhas = ed.escolhas
    .map((g) => {
      const opcoes = [];
      const precos = {};
      g.opcoes.forEach((o) => {
        const n = limpa(o.nome);
        if (!n || opcoes.includes(n)) return;
        opcoes.push(n);
        if (numero(o.mais) > 0) precos[n] = numero(o.mais);
      });
      const max = Math.min(Number(g.max) || 1, opcoes.length);
      return { nome: limpa(g.nome), opcoes: opcoes.slice(0, 12), ...(Object.keys(precos).length ? { precos } : {}), ...(max > 1 ? { max } : {}) };
    })
    .filter((g) => g.nome && g.opcoes.length)
    .slice(0, 6);
  const extras = ed.extras.map((e) => ({ nome: limpa(e.nome), preco: numero(e.preco) })).filter((e) => e.nome).slice(0, 12);
  return vem.length || escolhas.length || extras.length ? { vem, escolhas, extras } : null;
}

/** Erro para mostrar antes de salvar (ou ""). */
export function erroDasOpcoes(tipo, ed) {
  const m = opcoesParaSalvar(tipo, ed);
  if ((tipo === "sabor" || tipo === "recheio") && !(m?.escolhas || []).length)
    return tipo === "sabor" ? "Escreva os sabores (ex.: Coco, Morango)." : "Escreva as opções (ex.: Pequeno, Médio, Grande).";
  if (ed.escolhas.some((g) => g.opcoes.some((o) => o.nome.trim()) && !g.nome.trim())) return "Dê um nome para cada escolha (ex.: Tamanho, Hambúrguer).";
  return "";
}

const EXEMPLO_GRUPO = { sabor: "Sabor", recheio: "Tamanho", lanche: "Hambúrguer", prato: "Feijão" };
const DICA_GRUPO = { sabor: "Ex.: Sabor", recheio: "Ex.: Tamanho, Recheio", lanche: "Ex.: Hambúrguer, Carne, Patê", prato: "Ex.: Feijão, Salada" };
const DICA_OPCAO = { sabor: "Ex.: Morango", recheio: "Ex.: Grande", lanche: "Ex.: Artesanal", prato: "Ex.: Preto" };

export default function EditorOpcoes({ tipo, ed, onTipo, onChange, semVem = false }) {
  const [novoItem, setNovoItem] = useState("");
  const muda = (campos) => onChange({ ...ed, ...campos });
  const grupo = (i, campos) => muda({ escolhas: ed.escolhas.map((g, k) => (k === i ? { ...g, ...campos } : g)) });
  const opcao = (i, j, campos) => grupo(i, { opcoes: ed.escolhas[i].opcoes.map((o, k) => (k === j ? { ...o, ...campos } : o)) });
  const porItens = () => {
    const novos = novoItem.split(",").map((s) => s.trim()).filter(Boolean);
    if (!novos.length) return;
    muda({ vem: [...ed.vem, ...novos.filter((n) => !ed.vem.includes(n))] });
    setNovoItem("");
  };
  const novoGrupo = () => muda({ escolhas: [...ed.escolhas, { nome: ed.escolhas.length ? "" : EXEMPLO_GRUPO[tipo] || "", max: 1, opcoes: [{ nome: "", mais: "" }, { nome: "", mais: "" }] }] });
  const comVem = tipo === "prato" || tipo === "lanche";
  const nomeVem = tipo === "prato" ? "prato" : "lanche";

  return (
    <div className="eo">
      <div className="eo-bloco">
        <span className="eo-rotulo">Como é pedido</span>
        <div className="eo-tipos" role="radiogroup" aria-label="Como é pedido">
          {TIPOS.map((t) => (
            <button type="button" role="radio" aria-checked={t.id === tipo} key={t.id} className={t.id === tipo ? "ativo" : ""} onClick={() => onTipo(t.id)}>
              <b>{t.emoji} {t.nome}</b>
              <small>{t.exemplo}</small>
            </button>
          ))}
        </div>
        {tipo === "simples" && <p className="eo-dica">Entra direto no pedido com um toque, sem perguntar nada.</p>}
      </div>

      {comVem && semVem && (
        <div className="eo-bloco">
          <span className="eo-rotulo">O que vem no {nomeVem}</span>
          <p className="eo-dica">São os ingredientes do {nomeVem} (logo abaixo): aparecem no cardápio e o cliente toca para tirar (ex.: sem cebola).</p>
        </div>
      )}
      {comVem && !semVem && (
        <div className="eo-bloco">
          <span className="eo-rotulo">O que vem no {nomeVem}</span>
          <p className="eo-dica">Na hora do pedido, o cliente toca para tirar (ex.: sem cebola).</p>
          <div className="eo-chips">
            {ed.vem.map((v) => (
              <span key={v} className="eo-chip">
                {v}
                <button type="button" aria-label={`Tirar ${v}`} onClick={() => muda({ vem: ed.vem.filter((x) => x !== v) })}>✕</button>
              </span>
            ))}
          </div>
          <div className="eo-linha">
            <input value={novoItem} onChange={(e) => setNovoItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), porItens())} placeholder={tipo === "prato" ? "Ex.: Arroz" : "Ex.: Queijo"} aria-label={`Pôr item que vem no ${nomeVem}`} />
            <button type="button" className="eo-mais" onClick={porItens}>+ Pôr</button>
          </div>
        </div>
      )}

      {tipo !== "simples" && (
        <div className="eo-bloco">
          <span className="eo-rotulo">{tipo === "sabor" ? "Sabores" : "O cliente escolhe"}</span>
          <p className="eo-dica">{tipo === "lanche" ? "Ex.: Normal ou Artesanal (+ R$ 4,00), a carne, até 2 patês." : tipo === "recheio" ? "Ex.: o tamanho (Pequeno, Médio + R$ 5,00…) ou o recheio." : tipo === "sabor" ? "Se um sabor custar mais, ponha quanto a mais." : "Ex.: o feijão (Carioca, Preto)."} O preço do produto é o da opção mais barata.</p>
          {ed.escolhas.map((g, i) => (
            <div key={i} className="eo-grupo">
              <div className="eo-linha">
                <input className="eo-grupo-nome" value={g.nome} onChange={(e) => grupo(i, { nome: e.target.value })} placeholder={DICA_GRUPO[tipo] || "Nome da escolha"} aria-label={`Nome da escolha ${i + 1}`} />
                <select value={g.max} onChange={(e) => grupo(i, { max: Number(e.target.value) })} aria-label={`Quantas opções o cliente escolhe (${g.nome || i + 1})`}>
                  <option value={1}>escolhe 1</option>
                  {[2, 3, 4].map((n) => <option key={n} value={n}>até {n}</option>)}
                </select>
              </div>
              {g.opcoes.map((o, j) => (
                <div key={j} className="eo-linha eo-opcao">
                  <input value={o.nome} onChange={(e) => opcao(i, j, { nome: e.target.value })} placeholder={DICA_OPCAO[tipo] || "Opção"} aria-label={`Opção ${j + 1} de ${g.nome || "escolha"}`} />
                  <span className="eo-reais">+ R$</span>
                  <input className="eo-preco" inputMode="decimal" value={o.mais} onChange={(e) => opcao(i, j, { mais: e.target.value })} placeholder="0" aria-label={`Quanto custa a mais: ${o.nome || `opção ${j + 1}`}`} />
                  <button type="button" className="eo-x" aria-label={`Tirar a opção ${o.nome || j + 1}`} onClick={() => grupo(i, { opcoes: g.opcoes.filter((_, k) => k !== j) })}>✕</button>
                </div>
              ))}
              <div className="eo-acoes">
                <button type="button" className="eo-mais" onClick={() => grupo(i, { opcoes: [...g.opcoes, { nome: "", mais: "" }] })}>+ Opção</button>
                <button type="button" className="eo-tirar" onClick={() => muda({ escolhas: ed.escolhas.filter((_, k) => k !== i) })}>Tirar esta escolha</button>
              </div>
            </div>
          ))}
          {ed.escolhas.length < 6 && (
            <button type="button" className="eo-novo" onClick={novoGrupo}>
              + {ed.escolhas.length ? "Outra escolha" : tipo === "sabor" ? "Pôr os sabores" : "Pôr uma escolha"}
            </button>
          )}
        </div>
      )}

      {tipo !== "simples" && (
        <div className="eo-bloco">
          <span className="eo-rotulo">Adicionais com preço</span>
          <p className="eo-dica">O cliente põe a mais, se quiser (ex.: + Bacon R$ 4,00).</p>
          {ed.extras.map((x, i) => (
            <div key={i} className="eo-linha eo-opcao">
              <input value={x.nome} onChange={(e) => muda({ extras: ed.extras.map((y, k) => (k === i ? { ...y, nome: e.target.value } : y)) })} placeholder="Ex.: Bacon" aria-label={`Adicional ${i + 1}`} />
              <span className="eo-reais">R$</span>
              <input className="eo-preco" inputMode="decimal" value={x.preco} onChange={(e) => muda({ extras: ed.extras.map((y, k) => (k === i ? { ...y, preco: e.target.value } : y)) })} placeholder="0" aria-label={`Preço do adicional ${x.nome || i + 1}`} />
              <button type="button" className="eo-x" aria-label={`Tirar o adicional ${x.nome || i + 1}`} onClick={() => muda({ extras: ed.extras.filter((_, k) => k !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" className="eo-novo" onClick={() => muda({ extras: [...ed.extras, { nome: "", preco: "" }] })}>+ Adicional</button>
        </div>
      )}
    </div>
  );
}
