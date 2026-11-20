// Novo pedido num lugar só: Mesa, Balcão (o cliente leva) ou Entrega (pedido por telefone/WhatsApp).
// Balcão e Entrega usam a tela de pedido para viagem (o mesmo cardápio); trocar de aba não perde os
// itens já escolhidos. Mesa abre a mesa escolhida (onde o pedido da mesa já funciona).
import { L } from "../../loja";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import Viagem from "./Viagem";
import { planoQueLibera, useRecurso } from "../../recursos";
import "../../styles/Garcom/NovoPedido.css";

const ABAS = [
  { id: "mesa", rotulo: "🍽️ Mesa", tecla: "1" },
  { id: "balcao", rotulo: "🛍️ Balcão", tecla: "2" },
  { id: "entrega", rotulo: "🛵 Entrega", tecla: "3" },
];

const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");

function Abas({ aba, onTroca }) {
  return (
    <div className="novo-topo">
      <Link className="voltar" to="/">
        ← Voltar
      </Link>
      <h1 className="novo-titulo">Novo pedido</h1>
      <div className="novo-abas" role="tablist" aria-label="Tipo do pedido">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            className={aba === a.id ? "ativa" : ""}
            onClick={() => onTroca(a.id)}
            data-atalho={a.tecla}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

function EscolherMesa() {
  const [mesas, setMesas] = useState([]);
  const [abertas, setAbertas] = useState({});

  useEffect(() => {
    const a = onSnapshot(collection(db, ...L(), "mesas"), (s) => setMesas(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const b = onSnapshot(collection(db, ...L(), "pedidos"), (s) => {
      const m = {};
      s.docs.forEach((d) => {
        const p = d.data();
        if (p.tipo === "mesa" && p.mesa != null) m[String(p.mesa)] = (m[String(p.mesa)] || 0) + Number(p.total || 0);
      });
      setAbertas(m);
    });
    return () => {
      a();
      b();
    };
  }, []);

  const lista = useMemo(
    () =>
      mesas
        .map((m) => ({ ...m, numero: m.numero ?? Number(m.id) }))
        .filter((m) => Number.isFinite(Number(m.numero)))
        .sort((x, y) => Number(x.numero) - Number(y.numero)),
    [mesas]
  );

  if (!lista.length)
    return (
      <div className="card-principal">
        <h2>Nenhuma mesa cadastrada</h2>
        <p>Cadastre as mesas em Mesas.</p>
      </div>
    );

  return (
    <>
      <p className="novo-dica">Escolha a mesa. As ocupadas mostram o total que já está na conta.</p>
      <div className="novo-mesas">
        {lista.map((m) => {
          const total = abertas[String(m.numero)];
          return (
            <Link key={m.id} to={`/mesa/${m.numero}`} className={total !== undefined ? "novo-mesa ocupada" : "novo-mesa"}>
              <strong>Mesa {m.numero}</strong>
              <span>{total !== undefined ? `R$ ${moeda(total)}` : "Livre"}</span>
              {m.cliente ? <small>{m.cliente}</small> : null}
            </Link>
          );
        })}
      </div>
    </>
  );
}

export default function NovoPedido() {
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some((a) => a.id === params.get("aba")) ? params.get("aba") : "mesa";
  const viagemLigado = useRecurso("viagem");
  const trocar = (id) => setParams(id === "mesa" ? {} : { aba: id }, { replace: true });
  const topo = <Abas aba={aba} onTroca={trocar} />;

  if (aba !== "mesa" && viagemLigado)
    return <Viagem modo={aba} topo={topo} />;

  const plano = planoQueLibera("viagem");
  return (
    <div className="mesa-page">
      {topo}
      {aba === "mesa" ? (
        <EscolherMesa />
      ) : (
        <div className="card-principal">
          <h2>{plano ? `Função do plano ${plano}` : "Função desligada"}</h2>
          <p>
            {plano
              ? `Pedido de balcão e entrega lançada pelo garçom fazem parte do plano ${plano}. Para usar, fale com a IFTech pelo WhatsApp (81) 99245-8934.`
              : "Esta função está desligada na sua loja. Para ligar de novo, fale com a IFTech."}
          </p>
        </div>
      )}
    </div>
  );
}
