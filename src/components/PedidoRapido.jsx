// Tela rápida do garçom: busca, categorias numa faixa e os produtos em grade (1 toque = +1;
// prato com montagem abre a janela "Montar o prato").
import { useMemo, useState } from "react";
import { ehCategoriaDePrato, temMontagem } from "../utils/montagem";
import "./PedidoRapido.css";

const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");
const semAcento = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function PedidoRapido({ categorias, contagem, onTocar, emoji }) {
  const [busca, setBusca] = useState("");
  // Sem escolha do garçom, abre nos pratos (a 1ª categoria de prato na ordem da loja).
  const [cat, setCat] = useState("");
  const atual = categorias.find((c) => c.categoria === cat) || categorias.find((c) => ehCategoriaDePrato(c.categoria)) || categorias[0];

  const itens = useMemo(() => {
    const q = semAcento(busca.trim());
    if (q) return categorias.flatMap((c) => c.itens).filter((i) => semAcento(i.nome).includes(q));
    return atual?.itens || [];
  }, [busca, categorias, atual]);

  return (
    <div className="rapido">
      <input className="rapido-busca" type="search" placeholder="🔍 Buscar: peito, coca, suco…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {!busca.trim() && (
        <div className="rapido-cats">
          {categorias.map((c) => (
            <button type="button" key={c.categoria} className={c.categoria === atual?.categoria ? "ativa" : ""} onClick={() => setCat(c.categoria)}>
              {emoji ? `${emoji(c.categoria)} ` : ""}
              {c.categoria}
            </button>
          ))}
        </div>
      )}
      {itens.length === 0 ? (
        <p className="rapido-vazio">Nada encontrado.</p>
      ) : (
        <div className="rapido-grade">
          {itens.map((item) => {
            const n = contagem(item);
            return (
              <button type="button" key={item.id} className={n ? "rapido-item sel" : "rapido-item"} onClick={() => onTocar(item)}>
                {n > 0 && <span className="rapido-qtd">{n}</span>}
                <strong>{item.nome}</strong>
                <span className="rapido-preco">R$ {moeda(item.preco)}</span>
                {temMontagem(item) && <span className="rapido-montar">montar ›</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
