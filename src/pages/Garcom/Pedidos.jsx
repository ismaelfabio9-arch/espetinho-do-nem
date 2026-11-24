import { L } from "../../loja";
import { useEffect, useState } from "react";

import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  setDoc,
} from "firebase/firestore";
import { registrar } from "../../utils/registro";
import { textoDoItem } from "../../utils/montagem";
import { db } from "../../firebase";
import "../../styles/Garcom/Pedidos.css";
import { useConfigImpressora } from "../../hooks/useConfigImpressora";
import { gerarComandaHTML, imprimir } from "../../utils/print";
import { baixarInsumos } from "../../utils/insumos";
import { AVISO_PARCIAL, temPagamentoParcial } from "../../utils/contaMesa";
import useNomeLoja from "../../hooks/useNomeLoja";
import { linkWhats, mostrarFone, numeroWhats } from "../../utils/contato";
import FormasPagamento, { FORMAS, resolverPartes } from "../../components/FormasPagamento";
import "../../components/QuerMais.css";

// Painel: separa os pedidos em Mesas, Balcão (viagem) e Entregas. No computador, uma coluna para cada.
const GRUPOS = [
  { id: "mesa", rotulo: "🍽️ Mesas" },
  { id: "balcao", rotulo: "🛍️ Balcão" },
  { id: "entrega", rotulo: "🛵 Entregas" },
];
const grupoDe = (p) => (p.tipo === "mesa" ? "mesa" : p.tipo === "entrega" ? "entrega" : "balcao");
const largo = () => typeof window !== "undefined" && window.matchMedia?.("(min-width: 1000px)").matches;

function Pedidos() {
  const configImpressora = useConfigImpressora();
  const nomeLoja = useNomeLoja();
  const [pedidos, setPedidos] = useState([]);
  const [nomesMesas, setNomesMesas] = useState({});
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [pc, setPc] = useState(largo);
  // Finalizar pedido sem forma de pagamento (balcão, mesa): pergunta como foi pago (Caixa e Finanças).
  const [pagarPedido, setPagarPedido] = useState(null);
  const [partesPagar, setPartesPagar] = useState({});
  useEffect(() => {
    const m = window.matchMedia?.("(min-width: 1000px)");
    if (!m) return;
    const f = () => setPc(m.matches);
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);

  function formatarMoeda(valor) {
    return Number(valor).toFixed(2).replace(".", ",");
  }

  function formatarHora(data) {
    if (!data) return "";

    return new Date(data).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function pesoStatus(status) {
    if (status === "aberta" || status === "aberto") return 1;
    if (status === "Em preparo") return 2;
    if (status === "Entregue") return 3;
    return 4;
  }

  function tituloPedido(pedido) {
    if (pedido.tipo !== "mesa") {
      return pedido.titulo || "Pedido Viagem";
    }

    const cliente = nomesMesas[String(pedido.mesa)];

    return `Mesa ${pedido.mesa}${cliente ? ` - ${cliente}` : ""}`;
  }

  // Para mostrar: junta o mesmo item de pessoas diferentes (pedidos do QR Code guardam quem pediu).
  function ordenarItensPorPreco(itens) {
    const juntos = Object.values(
      (itens || []).reduce((acc, item) => {
        const q = Number(item.qtd || item.quantidade || 0);
        if (acc[item.nome]) acc[item.nome].qtd += q;
        else acc[item.nome] = { ...item, qtd: q };
        return acc;
      }, {})
    );
    return juntos.sort((a, b) => {
      const totalA =
        Number(a.preco || 0) * Number(a.qtd || a.quantidade || 0);

      const totalB =
        Number(b.preco || 0) * Number(b.qtd || b.quantidade || 0);

      if (totalA !== totalB) return totalA - totalB;

      return (a.nome || "").localeCompare(b.nome || "");
    });
  }

  useEffect(() => {
    const pedidosRef = collection(db, ...L(), "pedidos");
    const consulta = query(pedidosRef, orderBy("salvoEm", "desc"));

    const cancelarMesas = onSnapshot(collection(db, ...L(), "mesas"), (snapshot) => {
      const nomes = {};

      snapshot.docs.forEach((documento) => {
        nomes[documento.id] = documento.data().cliente || "";
      });

      setNomesMesas(nomes);
    });

    const cancelarInscricao = onSnapshot(consulta, (snapshot) => {
      const listaPedidos = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      listaPedidos.sort((a, b) => {
        const statusA = pesoStatus(a.status);
        const statusB = pesoStatus(b.status);

        if (statusA !== statusB) {
          return statusA - statusB;
        }

        return new Date(b.salvoEm || 0) - new Date(a.salvoEm || 0);
      });

      setPedidos(listaPedidos);
    });

    return () => {
      cancelarInscricao();
      cancelarMesas();
    };
  }, []);

  async function alterarStatus(id, novoStatus) {
    const pedidoRef = doc(db, ...L(), "pedidos", id);

    await updateDoc(pedidoRef, {
      status: novoStatus,
    });
    const p = pedidos.find((x) => x.id === id);
    registrar({ area: "pedidos", acao: "Mudou o status", texto: p ? tituloPedido(p) : id, antes: p?.status || "", depois: novoStatus });
  }

  /** Comanda do pedido de casa com endereço, pagamento e troco (Bluetooth ou impressora do navegador). */
  async function imprimirEntrega(pedido) {
    const info = [
      pedido.telefone ? `Tel: ${pedido.telefone}` : "",
      pedido.modo === "entrega" ? `Entrega: ${pedido.endereco}${pedido.referencia ? ` (ref.: ${pedido.referencia})` : ""}` : "Retirada no balcão",
      `Pagamento na ${pedido.modo === "entrega" ? "entrega" : "retirada"}: ${pedido.pagamento}${pedido.troco ? ` - troco para R$ ${formatarMoeda(pedido.troco)}` : ""}`,
      pedido.taxaEntrega ? `Taxa de entrega: R$ ${formatarMoeda(pedido.taxaEntrega)}` : "",
      pedido.obs ? `Obs: ${pedido.obs}` : "",
    ].filter(Boolean);
    const html = gerarComandaHTML({
      numeroPedido: pedido.numero,
      titulo: pedido.modo === "entrega" ? "ENTREGA" : "RETIRADA",
      cliente: pedido.cliente,
      itens: pedido.itens || [],
      total: pedido.total,
      observacoes: info.join(" | "),
      config: configImpressora,
    });
    await imprimir(html, configImpressora.larguraPapel);
  }

  async function finalizar(pedido) {
    if (pedido.tipo === "mesa" && (await temPagamentoParcial(pedido.mesa))) {
      window.alert(AVISO_PARCIAL(pedido.mesa));
      return;
    }
    // Sempre pergunta como foi pago. Pedido de entrega já vem com a forma que o cliente escolheu marcada
    // (se pagou de outro jeito na hora, é só trocar).
    const escolhida = FORMAS.find((f) => f.toLowerCase() === String(pedido.pagamento || "").toLowerCase());
    setPartesPagar(escolhida ? { [escolhida]: Number(pedido.total || 0).toFixed(2).replace(".", ",") } : {});
    setPagarPedido(pedido);
  }

  // pagamento: forma única ("Pix") ou a lista de formas [{ forma, valor }] quando pagou em mais de uma.
  async function removerPedido(pedido, pagamento) {
    const lista = Array.isArray(pagamento) ? pagamento : null;
    const forma = lista ? (lista.length === 1 ? lista[0].forma : "Dividido") : pagamento;
    const clienteMesa =
      pedido.tipo === "mesa" ? nomesMesas[String(pedido.mesa)] || "" : "";

    const vendaFinalizada = {
      origem: pedido.tipo || "viagem",
      ...(pedido.tipo === "entrega" ? { modo: pedido.modo || "entrega", taxaEntrega: pedido.taxaEntrega || 0 } : {}),
      formaPagamento: forma || pedido.pagamento || "",
      ...(lista && lista.length > 1 ? { pagamentos: lista } : {}),
      mesa: pedido.mesa || null,
      cliente: clienteMesa,
      titulo: tituloPedido(pedido),
      itens: pedido.itens || [],
      total: pedido.total || 0,
      totalItens: pedido.totalItens || 0,
      ...(pedido.tipo === "mesa"
        ? { sessaoMesa: `${pedido.mesa}-${Date.now()}`, abertaEm: pedido.salvoEm || new Date().toISOString(), fechadaEm: new Date().toISOString(), pedidosNaMesa: Number(pedido.lancamentos || 1) }
        : {}),
      finalizadoEm: new Date().toISOString(),
      criadoEm: serverTimestamp(),
    };

    await addDoc(collection(db, ...L(), "vendasDia"), vendaFinalizada);
    registrar({
      area: "dinheiro",
      acao: "Finalizou pedido",
      ...(pedido.mesa ? { mesa: pedido.mesa } : {}),
      texto: `${tituloPedido(pedido)}: R$ ${formatarMoeda(pedido.total || 0)} · ${lista ? lista.map((x) => `${x.forma} R$ ${formatarMoeda(x.valor)}`).join(" + ") : forma || pedido.pagamento || "sem forma"}`,
      valor: pedido.total || 0,
      detalhes: (pedido.itens || []).map(textoDoItem),
    });

    await addDoc(collection(db, ...L(), "historicoMesas"), {
      ...vendaFinalizada,
      pedidoOriginalId: pedido.id,
      status: "finalizada",
    });

    await deleteDoc(doc(db, ...L(), "pedidos", pedido.id));
    // Matéria-prima: desconta o que a ficha técnica de cada produto usa.
    baixarInsumos(pedido.itens || []);

    // ✅ CORREÇÃO ALERTA 1: limpa nome do cliente na mesa após finalizar
    if (pedido.tipo === "mesa" && pedido.mesa) {
      await setDoc(
        doc(db, ...L(), "mesas", String(pedido.mesa)),
        {
          numero: Number(pedido.mesa),
          cliente: "",
        },
        { merge: true }
      );
    }
  }

  function classeStatus(status) {
    if (status === "Em preparo") return "status-preparo";
    if (status === "Entregue") return "status-entregue";
    return "status-novo";
  }

  const contagem = pedidos.reduce((c, p) => ({ ...c, [grupoDe(p)]: (c[grupoDe(p)] || 0) + 1 }), {});

  const pedidosFiltrados = pedidos.filter((pedido) => {
    if (filtro !== "todos" && grupoDe(pedido) !== filtro) return false;
    const termo = busca.toLowerCase().trim();

    if (!termo) return true;

    const textoItens = (pedido.itens || [])
      .map((item) => item.nome)
      .join(" ")
      .toLowerCase();

    return (
      tituloPedido(pedido).toLowerCase().includes(termo) ||
      (pedido.tipo || "").toLowerCase().includes(termo) ||
      (pedido.status || "").toLowerCase().includes(termo) ||
      textoItens.includes(termo)
    );
  });

  const cartao = (pedido) => (
    <div key={pedido.id} className="pedido-card">
      <div className="pedido-topo">
        <div>
          <span className={`pedido-tipo ${pedido.tipo === "entrega" ? "pedido-tipo-entrega" : ""}`}>
            {pedido.tipo === "mesa" ? "🍽️ Mesa" : pedido.tipo === "entrega" ? `${pedido.modo === "retirada" ? "🏪 Retirada" : "🛵 Entrega"} · ${pedido.origem === "manual" ? "telefone" : "site"}` : "🛍️ Balcão / viagem"}
          </span>

          <h3>{tituloPedido(pedido)}</h3>

          <span>
            {pedido.totalItens} itens • R$ {formatarMoeda(pedido.total)}
          </span>

          {pedido.salvoEm && (
            <small className="pedido-horario">
              Criado às {formatarHora(pedido.salvoEm)}
            </small>
          )}
        </div>

        <strong className={classeStatus(pedido.status)}>
          {pedido.status}
        </strong>
      </div>

      <div className="pedido-itens">
        {ordenarItensPorPreco(pedido.itens).map((item) => (
          <div className="pedido-item-linha" key={item.nome}>
            <span>
              {Number(item.qtd || item.quantidade || 0)}x {item.nome}
            </span>

            <strong>
              R${" "}
              {formatarMoeda(
                Number(item.preco || 0) * Number(item.qtd || item.quantidade || 0)
              )}
            </strong>
          </div>
        ))}
      </div>

      {pedido.tipo === "entrega" && (
        <div className="pedido-entrega">
          <p>
            <strong>{pedido.cliente}</strong>
            {pedido.telefone ? ` · ${mostrarFone(pedido.telefone)}` : ""}
          </p>
          {numeroWhats(pedido.telefone) && (
            <a
              className="whats-btn pedido-whats"
              href={linkWhats(pedido.telefone, `Olá, ${String(pedido.cliente || "").split(" ")[0]}! Aqui é da ${nomeLoja || "loja"}, sobre o seu pedido${pedido.numero ? ` #${pedido.numero}` : ""}: `)}
              target="_blank"
              rel="noopener noreferrer"
            >
              💬 Chamar o cliente no WhatsApp
            </a>
          )}
          {pedido.modo === "entrega" && (
            <p>
              📍 {pedido.endereco}
              {pedido.referencia ? ` (ref.: ${pedido.referencia})` : ""}
            </p>
          )}
          <p>
            💰 Paga na {pedido.modo === "entrega" ? "entrega" : "retirada"}: <strong>{pedido.pagamento}</strong>
            {pedido.troco ? ` · troco para R$ ${formatarMoeda(pedido.troco)}` : ""}
          </p>
          {pedido.obs && <p>📝 {pedido.obs}</p>}
          {pedido.taxaEntrega > 0 && (
            <p>
              Itens R$ {formatarMoeda(pedido.subtotal)} + entrega R$ {formatarMoeda(pedido.taxaEntrega)}
            </p>
          )}
        </div>
      )}

      <div className="pedido-total">
        <span>Total</span>
        <strong>R$ {formatarMoeda(pedido.total)}</strong>
      </div>

      <div className="pedido-acoes">
        <button
          className="btn-verde"
          onClick={() => alterarStatus(pedido.id, "Em preparo")}
        >
          Em preparo
        </button>

        <button
          className="btn-cinza"
          onClick={() => alterarStatus(pedido.id, "Entregue")}
        >
          Entregue
        </button>

        {pedido.tipo === "entrega" && (
          <button className="btn-cinza" onClick={() => void imprimirEntrega(pedido)}>
            🖨️ Imprimir
          </button>
        )}

        <button
          className="btn-remover"
          onClick={() => finalizar(pedido)}
        >
          Finalizar
        </button>
      </div>
    </div>
  );

  const modalPagamento = pagarPedido && (
    <div className="modal-overlay" onClick={() => setPagarPedido(null)}>
      <div className="modal-card" role="dialog" aria-label="Como foi pago?" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">💳</div>
        <h2>Como foi pago?</h2>
        <p className="modal-total-encerrar">
          {tituloPedido(pagarPedido)} · Total: <strong>R$ {formatarMoeda(pagarPedido.total)}</strong>
        </p>
        {pagarPedido.pagamento && (
          <p className="modal-total-encerrar">
            O cliente disse que ia pagar com <strong>{pagarPedido.pagamento}</strong>
            {pagarPedido.troco ? ` (troco para R$ ${formatarMoeda(pagarPedido.troco)})` : ""}. Confira e confirme.
          </p>
        )}
        <FormasPagamento valor={Number(pagarPedido.total || 0)} partes={partesPagar} onChange={setPartesPagar} />
        <div className="modal-acoes">
          <button type="button" className="modal-btn cancelar" onClick={() => setPagarPedido(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="modal-btn confirmar"
            onClick={() => {
              const r = resolverPartes(Number(pagarPedido.total || 0), partesPagar, null);
              if (!r.ok) return window.alert(r.erro);
              const p = pagarPedido;
              setPagarPedido(null);
              void removerPedido(p, r.lista.map(({ forma, valor }) => ({ forma, valor })));
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container pedidos-pagina">
      {modalPagamento}
      <Link to="/" className="voltar">
        ← Voltar
      </Link>

      <div className="pedidos-header">
        <div>
          <span>Atendimento</span>
          <h1>Pedidos</h1>
          <p>Mesas, balcão e entregas em andamento, numa tela só.</p>
        </div>
        <Link to="/novo" className="pedidos-novo" data-atalho="F2">
          + Novo pedido
        </Link>
      </div>

      <div className="pedidos-filtros" role="tablist" aria-label="Tipo de pedido">
        {[{ id: "todos", rotulo: "Todos" }, ...GRUPOS].map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={filtro === g.id}
            className={filtro === g.id ? "ativo" : ""}
            onClick={() => setFiltro(g.id)}
          >
            {g.rotulo} <small>{g.id === "todos" ? pedidos.length : contagem[g.id] || 0}</small>
          </button>
        ))}
      </div>

      <input
        className="campo-busca"
        type="text"
        placeholder="Buscar por mesa, cliente, viagem, status ou item..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {pedidosFiltrados.length === 0 ? (
        <div className="card-principal">
          <h2>Nenhum pedido aberto</h2>
          <p>{busca.trim() ? "Tente buscar por mesa, cliente, item ou status." : "Os pedidos de mesa, balcão e entrega aparecem aqui."}</p>
        </div>
      ) : pc && filtro === "todos" ? (
        <div className="pedidos-colunas">
          {GRUPOS.map((g) => {
            const lista = pedidosFiltrados.filter((p) => grupoDe(p) === g.id);
            return (
              <section key={g.id} className="pedidos-coluna">
                <h2>
                  {g.rotulo} <small>{lista.length}</small>
                </h2>
                {lista.length ? <div className="lista-pedidos">{lista.map(cartao)}</div> : <p className="pedidos-coluna-vazia">Nenhum agora.</p>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="lista-pedidos">{pedidosFiltrados.map(cartao)}</div>
      )}

      <div className="menu-inferior">
        <Link to="/" style={{ textDecoration: "none" }}>
          ▦
          <span>Painel</span>
        </Link>

        <Link to="/pedidos" className="ativo" style={{ textDecoration: "none" }}>
          ▤
          <span>Pedidos</span>
        </Link>

        <Link to="/mesas" style={{ textDecoration: "none" }}>
          ▥
          <span>Mesas</span>
        </Link>

        <Link to="/config" style={{ textDecoration: "none" }}>
          ⚙
          <span>Config.</span>
        </Link>
      </div>
    </div>
  );
}

export default Pedidos;