// Cardápio de hoje: o dono liga e desliga o que tem hoje. O que estiver desligado some da tela do
// garçom e do QR Code da mesa (fica guardado; é só ligar de novo).
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { L } from "../../loja";
import { ordenarGruposPorCategoria } from "../../utils/categorias";
import { ordenarItensCategoria } from "../../utils/produtosOrdem";
import "./CardapioHoje.css";

const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");

export default function CardapioHoje() {
  const [produtos, setProdutos] = useState([]);
  const [categoriasDocs, setCategoriasDocs] = useState([]);

  useEffect(() => onSnapshot(collection(db, ...L(), "categorias"), (s) => setCategoriasDocs(s.docs.map((d) => ({ id: d.id, ...d.data() })))), []);
  useEffect(() => onSnapshot(collection(db, ...L(), "produtos"), (s) => setProdutos(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.ativo !== false))), []);

  const grupos = useMemo(() => {
    const g = {};
    produtos.forEach((p) => {
      const c = p.categoria || "Sem categoria";
      (g[c] = g[c] || { categoria: c, itens: [] }).itens.push(p);
    });
    const lista = Object.values(g);
    lista.forEach((c) => (c.itens = ordenarItensCategoria(c.itens)));
    return ordenarGruposPorCategoria(lista, categoriasDocs);
  }, [produtos, categoriasDocs]);

  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const ligados = produtos.filter((p) => p.foraHoje !== true).length;
  const alternar = (p) => setDoc(doc(db, ...L(), "produtos", p.id), { foraHoje: p.foraHoje !== true }, { merge: true });
  const categoria = (c, ligar) =>
    c.itens.forEach((p) => {
      if ((p.foraHoje !== true) !== ligar) setDoc(doc(db, ...L(), "produtos", p.id), { foraHoje: !ligar }, { merge: true });
    });

  return (
    <div className="container hoje-page">
      <Link to="/produtos" className="voltar">← Voltar</Link>
      <div className="hoje-topo">
        <h1>Cardápio de hoje</h1>
        <span>{hoje}</span>
      </div>
      <p className="hoje-sub">Só o que estiver ligado aparece para o garçom e no QR Code da mesa. Fica salvo até você mudar.</p>
      {grupos.map((c) => (
        <section key={c.categoria} className="hoje-cat">
          <div className="hoje-cat-topo">
            <h2>{c.categoria}</h2>
            <span>
              <button type="button" onClick={() => categoria(c, true)}>ligar todos</button>
              <button type="button" onClick={() => categoria(c, false)}>desligar todos</button>
            </span>
          </div>
          {c.itens.map((p) => {
            const on = p.foraHoje !== true;
            return (
              <button type="button" key={p.id} className={on ? "hoje-item" : "hoje-item off"} onClick={() => alternar(p)} aria-pressed={on}>
                <span>
                  <b>{p.nome}</b>
                  <small>R$ {moeda(p.preco)}</small>
                </span>
                <i className={on ? "hoje-chave" : "hoje-chave off"} aria-hidden="true" />
              </button>
            );
          })}
        </section>
      ))}
      <Link to="/" className="hoje-pronto">Pronto · {ligados} {ligados === 1 ? "item" : "itens"} hoje</Link>
    </div>
  );
}
