// Opções do produto no cadastro, sem texto para decorar: o que vem (o cliente tira), o que o cliente
// escolhe (Normal/Artesanal, tamanho, até 2 patês…) e os adicionais com preço. Grava o mesmo "montagem"
// que o pedido, o QR Code e o servidor usam (utils/montagem.js).
import { useState } from "react";
import { TIPOS, tipoDe } from "../utils/montagem";
import "./EditorOpcoes.css";

const moeda = (v) => (Number(v) > 0 ? String(Math.round(Number(v) * 100) / 100).replace(".", ",") : "");
const numero = (t) => {
  const v = Number(String(t ?? "").trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};

/**
 * A 1ª escolha de uma opção só (tamanho, Normal/Artesanal) recebe o PREÇO FINAL de cada opção (6 sabores R$ 13,
 * 10 sabores R$ 16): o preço do produto vira o menor deles e o banco guarda a diferença, como sempre.
 * No prato a escolha não tem preço (-1). As outras escolhas continuam com "+ R$".
 */
export const indicePrecoCheio = (tipo, escolhas) => (tipo === "prato" ? -1 : (escolhas || []).findIndex((g) => !(Number(g.max) > 1) && !g.maxDe && !g.livre));
/**
 * A escolha de tamanho (de uma opção só, com 2 ou mais opções) que diz quantos recheios o cliente escolhe:
 * 6 sabores → 6, açaí 300 ml → 3, tapioca grande → 4 (o dono põe o número de cada tamanho).
 * Prefere a que tem número no nome das opções.
 */
const grupoComNumero = (escolhas, menos) => {
  const ok = (escolhas || []).filter((g) => g !== menos && g.nome && !g.maxDe && !g.livre && !(Number(g.max) > 1) && (g.opcoes || []).filter((o) => String(o?.nome ?? o).trim()).length >= 2);
  return ok.find((g) => g.opcoes.some((o) => numeroOp(o))) || ok[0];
};
const numeroOp = (o) => /\d/.test(typeof o === "string" ? o : o?.nome || "");
const numeroDoNome = (t) => {
  const n = parseInt(String(t || "").match(/\d+/)?.[0], 10);
  return Number.isFinite(n) && n > 0 && n <= 20 ? n : null;
};

/** Produto salvo → o que a tela edita (preços como texto). */
export function opcoesParaEditar(produto) {
  const m = produto?.montagem || {};
  const ic = indicePrecoCheio(tipoDe(produto), m.escolhas);
  const base = Number(produto?.preco || 0);
  return {
    vem: [...(m.vem || [])],
    escolhas: (m.escolhas || []).map((g, i) => {
      const temPreco = (g.opcoes || []).some((o) => Number(g.precos?.[o]) > 0);
      // Escolha de tamanho que conta os recheios de outra: quantos recheios em cada opção.
      const contador = (m.escolhas || []).find((x) => x.maxDe && x.maxDe === g.nome);
      const qtd = (o) => (contador ? String(contador.maxPor?.[o] ?? numeroDoNome(o) ?? "") : undefined);
      return {
        nome: g.nome,
        max: Number(g.max) > 1 ? Number(g.max) : 1,
        ...(g.maxDe ? { maxDe: g.maxDe } : {}),
        ...(g.livre ? { livre: true } : {}),
        opcoes: (g.opcoes || []).map((o) => ({ nome: o, mais: i === ic ? (temPreco ? moeda(base + (Number(g.precos?.[o]) || 0)) : "") : moeda(g.precos?.[o]), ...(contador ? { qtd: qtd(o) } : {}) })),
      };
    }),
    extras: (m.extras || []).map((e) => ({ nome: e.nome, preco: moeda(e.preco) })),
  };
}

/** O preço do produto quando a escolha tem o preço de cada opção: o menor deles (null quando não tem). */
export function precoPelasOpcoes(tipo, ed) {
  const g = ed.escolhas[indicePrecoCheio(tipo, ed.escolhas)];
  const v = (g?.opcoes || []).filter((o) => String(o.nome || "").trim() && numero(o.mais) > 0).map((o) => numero(o.mais));
  return v.length ? Math.min(...v) : null;
}

/** O que a tela edita → montagem salva (null quando não tem nada). */
export function opcoesParaSalvar(tipo, ed) {
  const ic = indicePrecoCheio(tipo, ed.escolhas);
  const base = precoPelasOpcoes(tipo, ed);
  if (tipo === "simples") return null;
  const limpa = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const vem = tipo === "prato" || tipo === "lanche" ? [...new Set(ed.vem.map(limpa).filter(Boolean))].slice(0, 12) : [];
  const escolhas = ed.escolhas
    .map((g, i) => {
      const opcoes = [];
      const precos = {};
      g.opcoes.forEach((o) => {
        const n = limpa(o.nome);
        if (!n || opcoes.includes(n)) return;
        opcoes.push(n);
        if (tipo === "prato") return;
        // Preço final da opção → a diferença para o preço do produto (o menor). Vazio = o preço do produto.
        const v = i === ic ? (base !== null && numero(o.mais) > 0 ? Math.round((numero(o.mais) - base) * 100) / 100 : 0) : numero(o.mais);
        if (v > 0) precos[n] = v;
      });
      const max = g.livre ? 1 : Math.min(Number(g.max) || 1, opcoes.length);
      // Recheios pelo tamanho: quantos em cada tamanho (o número que o dono pôs; vazio = o número do nome).
      const tam = g.maxDe ? ed.escolhas.find((x) => x !== g && limpa(x.nome) === limpa(g.maxDe)) : null;
      const maxPor = {};
      (tam?.opcoes || []).forEach((o) => {
        const n = Math.round(numero(o.qtd)) || numeroDoNome(o.nome);
        if (limpa(o.nome) && n > 0) maxPor[limpa(o.nome)] = Math.min(20, n);
      });
      return {
        nome: limpa(g.nome),
        opcoes: opcoes.slice(0, g.maxDe ? 20 : 12),
        ...(Object.keys(precos).length ? { precos } : {}),
        ...(max > 1 ? { max } : {}),
        ...(g.maxDe && !(max > 1) && !g.livre ? { maxDe: limpa(g.maxDe), maxPor } : {}),
        ...(g.livre ? { livre: true } : {}),
      };
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
  const solto = ed.escolhas.find((g) => g.maxDe && !ed.escolhas.some((x) => x !== g && x.nome.trim() === String(g.maxDe).trim()));
  if (solto) return `"${solto.nome}" conta pelo tamanho, mas não achei a escolha do tamanho: confira o nome dela.`;
  const contador = ed.escolhas.find((g) => g.maxDe);
  const tam = contador && ed.escolhas.find((x) => x !== contador && x.nome.trim() === String(contador.maxDe).trim());
  const semQtd = (tam?.opcoes || []).filter((o) => o.nome.trim() && !(Math.round(numero(o.qtd)) > 0) && !numeroDoNome(o.nome));
  if (semQtd.length) return `Diga quantos ${contador.nome.toLowerCase()} vêm em: ${semQtd.map((o) => o.nome.trim()).join(", ")}.`;
  return "";
}

const EXEMPLO_GRUPO = { sabor: "Sabor", recheio: "Tamanho", lanche: "Hambúrguer", prato: "Feijão" };
const DICA_GRUPO = { sabor: "Ex.: Sabor", recheio: "Ex.: Tamanho, Recheio", lanche: "Ex.: Hambúrguer, Carne, Patê", prato: "Ex.: Feijão, Salada" };
const DICA_OPCAO = { sabor: "Ex.: Morango", recheio: "Ex.: Grande", lanche: "Ex.: Artesanal", prato: "Ex.: Preto" };

export default function EditorOpcoes({ tipo, ed, onTipo, onChange, semVem = false, ingredientes = [], precoBase = null }) {
  // Os ingredientes do produto que podem ser recheio (a massa não é).
  const recheios = [...new Set((ingredientes || []).filter((n) => n && !/massa/i.test(n)))];
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
          <p className="eo-dica">{tipo === "lanche" ? "Ex.: Normal ou Artesanal (+ R$ 4,00), a carne, até 2 patês." : tipo === "recheio" ? "Ex.: o tamanho (Pequeno, Médio + R$ 5,00…) ou o recheio." : tipo === "sabor" ? "Se um sabor custar mais, ponha quanto a mais." : "Ex.: o feijão (Carioca, Preto)."} {tipo === "prato" ? "No prato a escolha não muda o preço: porção a mais de arroz ou feijão vai em Adicionais com preço (ou como acompanhamento)." : "Na 1ª escolha ponha o preço de cada opção (ex.: 6 sabores R$ 13, 10 sabores R$ 16); nas outras, só quanto custa a mais."}</p>
          {ed.escolhas.map((g, i) => (
            <div key={i} className="eo-grupo">
              <div className="eo-linha">
                <input className="eo-grupo-nome" value={g.nome} onChange={(e) => grupo(i, { nome: e.target.value })} placeholder={DICA_GRUPO[tipo] || "Nome da escolha"} aria-label={`Nome da escolha ${i + 1}`} />
                <select
                  value={g.livre ? "livre" : g.maxDe ? "tam" : g.max}
                  onChange={(e) =>
                    e.target.value === "livre"
                      ? grupo(i, { max: 1, maxDe: undefined, livre: true })
                      : e.target.value === "tam"
                      ? grupo(i, { max: 1, maxDe: grupoComNumero(ed.escolhas, g)?.nome || "", livre: undefined })
                      : grupo(i, { max: Number(e.target.value), maxDe: undefined, livre: undefined })
                  }
                  aria-label={`Quantas opções o cliente escolhe (${g.nome || i + 1})`}
                >
                  <option value={1}>escolhe 1</option>
                  {[2, 3, 4].map((n) => <option key={n} value={n}>até {n}</option>)}
                  <option value="livre">quantos quiser (opcional)</option>
                  {(g.maxDe || grupoComNumero(ed.escolhas, g)) && <option value="tam">pelo {String(g.maxDe || grupoComNumero(ed.escolhas, g)?.nome).toLowerCase()} (6 sabores = 6)</option>}
                </select>
              </div>
              {(() => {
                const ic = indicePrecoCheio(tipo, ed.escolhas);
                const conta = ed.escolhas.find((x) => x.maxDe && x.maxDe === g.nome);
                return tipo !== "prato" && (i === ic || conta) ? (
                  <div className="eo-cabeca">
                    <span>Opção</span>
                    {i === ic && <span>Preço</span>}
                    {conta && <span>{conta.nome || "Recheios"}</span>}
                  </div>
                ) : null;
              })()}
              {g.opcoes.map((o, j) => (
                <div key={j} className="eo-linha eo-opcao">
                  <input value={o.nome} onChange={(e) => opcao(i, j, { nome: e.target.value })} placeholder={DICA_OPCAO[tipo] || "Opção"} aria-label={`Opção ${j + 1} de ${g.nome || "escolha"}`} />
                  {tipo !== "prato" && i === indicePrecoCheio(tipo, ed.escolhas) && (
                    <>
                      <span className="eo-reais">R$</span>
                      <input className="eo-preco" inputMode="decimal" value={o.mais} onChange={(e) => opcao(i, j, { mais: e.target.value })} placeholder="preço" aria-label={`Preço de ${o.nome || `opção ${j + 1}`}`} />
                    </>
                  )}
                  {tipo !== "prato" && i !== indicePrecoCheio(tipo, ed.escolhas) && (
                    <>
                      <span className="eo-reais">+ R$</span>
                      <input className="eo-preco" inputMode="decimal" value={o.mais} onChange={(e) => opcao(i, j, { mais: e.target.value })} placeholder="0" aria-label={`Quanto custa a mais: ${o.nome || `opção ${j + 1}`}`} />
                    </>
                  )}
                  {ed.escolhas.some((x) => x.maxDe && x.maxDe === g.nome) && (
                    <input className="eo-preco eo-qtd" inputMode="numeric" value={o.qtd ?? ""} onChange={(e) => opcao(i, j, { qtd: e.target.value })} placeholder={String(numeroDoNome(o.nome) ?? "?")} aria-label={`Quantos recheios em ${o.nome || `opção ${j + 1}`}`} />
                  )}
                  <button type="button" className="eo-x" aria-label={`Tirar a opção ${o.nome || j + 1}`} onClick={() => grupo(i, { opcoes: g.opcoes.filter((_, k) => k !== j) })}>✕</button>
                </div>
              ))}
              {tipo !== "prato" && i === indicePrecoCheio(tipo, ed.escolhas) && (() => {
                const nomes = g.opcoes.filter((o) => o.nome.trim());
                const sem = nomes.filter((o) => !(numero(o.mais) > 0));
                if (nomes.length < 2 || !sem.length) return null;
                const base = precoPelasOpcoes(tipo, ed) ?? (Number(String(precoBase ?? "").replace(",", ".")) || 0);
                return (
                  <p className="eo-aviso">
                    ⚠️ Sem preço: {sem.map((o) => o.nome.trim()).join(", ")}. {sem.length === nomes.length ? "Todos saem" : "Sai"} pelo preço do produto (R$ {moeda(base) || "0"}). Ponha o preço de cada um.
                  </p>
                );
              })()}
              <div className="eo-acoes">
                <button type="button" className="eo-mais" onClick={() => grupo(i, { opcoes: [...g.opcoes, { nome: "", mais: "" }] })}>+ Opção</button>
                {g.maxDe && recheios.length > 0 && (
                  <button type="button" className="eo-mais" onClick={() => grupo(i, { opcoes: recheios.map((n) => ({ nome: n, mais: "" })) })}>Usar os ingredientes do produto ({recheios.length})</button>
                )}
                <button type="button" className="eo-tirar" onClick={() => muda({ escolhas: ed.escolhas.filter((_, k) => k !== i) })}>Tirar esta escolha</button>
              </div>
            </div>
          ))}
          {tipo !== "prato" && grupoComNumero(ed.escolhas) && !ed.escolhas.some((g) => g.maxDe) && ed.escolhas.length < 6 && (
            <button
              type="button"
              className="eo-novo"
              onClick={() => {
                const tam = grupoComNumero(ed.escolhas);
                muda({
                  escolhas: [
                    ...ed.escolhas.map((x) => (x === tam ? { ...x, opcoes: x.opcoes.map((o) => ({ ...o, qtd: o.qtd ?? String(numeroDoNome(o.nome) ?? "") })) } : x)),
                    { nome: tipo === "sabor" ? "Sabores" : "Recheios", max: 1, maxDe: tam.nome, opcoes: recheios.length ? recheios.map((n) => ({ nome: n, mais: "" })) : [{ nome: "", mais: "" }, { nome: "", mais: "" }, { nome: "", mais: "" }] },
                  ],
                });
              }}
            >
              + O cliente monta: escolhe os recheios, quantos depende do {String(grupoComNumero(ed.escolhas).nome).toLowerCase()} (ex.: 6 sabores = 6){recheios.length ? " · com os ingredientes do produto" : ""}
            </button>
          )}
          {tipo !== "prato" && ed.escolhas.length > 0 && ed.escolhas.length < 6 && (
            <button type="button" className="eo-novo" onClick={() => muda({ escolhas: [...ed.escolhas, { nome: "", max: 1, livre: true, opcoes: [{ nome: "", mais: "" }, { nome: "", mais: "" }, { nome: "", mais: "" }] }] })}>
              + Opcionais: o cliente põe quantos quiser (ex.: acompanhamentos, molhos)
            </button>
          )}
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
