import { L } from "../../loja";
import { partesDoItem } from "../../utils/montagem";
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
  { id: "mesa", rotulo: "Mesas" },
  { id: "balcao", rotulo: "Balcão" },
  { id: "entrega", rotulo: "Entregas" },
];
const grupoDe = (p) => (p.tipo === "mesa" ? "mesa" : p.tipo === "entrega" ? "entrega" : "balcao");
const largo = () => typeof window !== "undefined" && window.matchMedia?.("(min-width: 1000px)").matches;

function Pedidos() {
  const configImpressora = useConfigImpressora();
  const nomeLoja = useNomeLoja();
  const [pedidos, setPedidos] = useState([]);
  const [nomesMesas, setNomesMesas] = useState({});
  // Número curto do dia (1, 2, 3…) de cada pedido que já foi impresso, e o relógio para o "há X min".
  const [numeros, setNumeros] = useState({});
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    const sair = onSnapshot(doc(db, ...L(), "contadores", "pedidos"), (snap) => {
      const d = snap.data() || {};
      setNumeros(d.dia === new Date().toLocaleDateString("sv-SE") ? d.ids || {} : {});
    }, () => {});
    return () => {
      clearInterval(t);
      sair();
    };
  }, []);
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
    if (status === "Pronto") return 3;
    if (status === "Entregue") return 4;
    return 5;
  }

  function tituloPedido(pedido) {
    if (pedido.tipo !== "mesa") {
      if (pedido.titulo) return pedido.titulo;
      if (pedido.tipo === "entrega") return `${pedido.modo === "retirada" ? "Retirada" : "Entrega"}${pedido.numero ? ` #${pedido.numero}` : ""}${pedido.cliente ? ` · ${pedido.cliente}` : ""}`;
      return "Pedido Viagem";
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

  // Passos do pedido: aberto → Em preparo → Pronto → Entregue. Um botão só leva ao próximo.
  const PASSOS = ["aberto", "Em preparo", "Pronto", "Entregue"];
  const passoDe = (st) => (st === "aberta" ? 0 : Math.max(0, PASSOS.indexOf(st)));
  const PROXIMO = { 0: ["Em preparo", "Começar preparo"], 1: ["Pronto", "Marcar pronto"], 2: ["Entregue", "Marcar entregue"] };
  const minutosDe = (p) => {
    const t = Date.parse(p.salvoEm || p.criadoEm?.toDate?.()?.toISOString?.() || "");
    return Number.isFinite(t) ? Math.max(0, Math.floor((agora - t) / 60000)) : null;
  };
  const textoTempo = (m) => (m === null ? "" : m < 1 ? "agora" : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);
  const nomeCartao = (p) => {
    if (p.tipo === "mesa") return tituloPedido(p);
    if (p.tipo === "entrega") return tituloPedido(p);
    // Título genérico ("Pedido Viagem", "PARA VIAGEM") não diz nada: usa o número do dia e o nome.
    if (p.titulo && !/^(pedido viagem|para viagem|viagem|balc[aã]o)$/i.test(String(p.titulo).trim())) return p.titulo;
    const n = numeros[p.id] || numeros[p.numero];
    return `${n ? `Pedido ${n}` : "Balcão"}${p.cliente ? ` · ${p.cliente}` : ""}`;
  };

  const cartao = (pedido) => {
    const passo = passoDe(pedido.status);
    const min = minutosDe(pedido);
    const atrasado = min !== null && min >= 20 && passo < 3;
    const prox = PROXIMO[passo];
    return (
    <div key={pedido.id} className={`pedido-card pc2${atrasado ? " atrasado" : ""}`}>
      <div className="pc2-topo">
        <div>
          <span className="pc2-tipo">
            {pedido.tipo === "mesa" ? "Mesa" : pedido.tipo === "entrega" ? `${pedido.modo === "retirada" ? "Retirada" : "Entrega"} · ${pedido.origem === "manual" ? "telefone" : "site"}` : "Balcão · viagem"}
          </span>
          <h3>{nomeCartao(pedido)}</h3>
          <small>{pedido.totalItens} {Number(pedido.totalItens) === 1 ? "item" : "itens"}{pedido.salvoEm ? ` · feito às ${formatarHora(pedido.salvoEm)}` : ""}</small>
        </div>
        <div className="pc2-st">
          <b className={`pc2-status p${passo}`}>{passo === 0 ? "Novo" : PASSOS[passo]}</b>
          {min !== null && passo < 3 && <small className={atrasado ? "pc2-atraso" : ""}>{textoTempo(min)}</small>}
        </div>
      </div>
      <div className="pc2-passos" aria-hidden="true">
        {PASSOS.map((x, i) => <i key={x} className={i <= passo ? "on" : ""} />)}
      </div>

      <div className="pc2-itens">
        {ordenarItensPorPreco(pedido.itens).map((item) => (
          <div className="pc2-item" key={item.nome}>
            <div className="pc2-l1">
              <span>{Number(item.qtd || item.quantidade || 0)}× {partesDoItem(item).nome}</span>
              <span>R$ {formatarMoeda(Number(item.preco || 0) * Number(item.qtd || item.quantidade || 0))}</span>
            </div>
            {partesDoItem(item).detalhes.length > 0 && (
              <div className="pc2-det">
                {partesDoItem(item).detalhes.map((d, k) => <span key={k}>{d}</span>)}
              </div>
            )}
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
              WhatsApp do cliente
            </a>
          )}
          {pedido.modo === "entrega" && (
            <p>
              {pedido.endereco}
              {pedido.referencia ? ` (ref.: ${pedido.referencia})` : ""}
            </p>
          )}
          <p>
            Paga na {pedido.modo === "entrega" ? "entrega" : "retirada"}: <strong>{pedido.pagamento}</strong>
            {pedido.troco ? ` · troco para R$ ${formatarMoeda(pedido.troco)}` : ""}
          </p>
          {pedido.obs && <p>Obs.: {pedido.obs}</p>}
          {pedido.taxaEntrega > 0 && (
            <p>
              Itens R$ {formatarMoeda(Number.isFinite(Number(pedido.subtotal)) && pedido.subtotal !== undefined ? pedido.subtotal : Number(pedido.total || 0) - Number(pedido.taxaEntrega || 0))} + entrega R$ {formatarMoeda(pedido.taxaEntrega)}
            </p>
          )}
        </div>
      )}

      <div className="pc2-total">
        <span>Total</span>
        <strong>R$ {formatarMoeda(pedido.total)}</strong>
      </div>

      <div className="pc2-acoes">
        {prox ? (
          <button type="button" className="pc2-prox" onClick={() => alterarStatus(pedido.id, prox[0])}>{prox[1]}</button>
        ) : (
          <span className="pc2-entregue">Entregue</span>
        )}
        <button type="button" className="pc2-fin" onClick={() => finalizar(pedido)}>Finalizar</button>
      </div>
      <div className="pc2-mais">
        {pedido.tipo === "entrega" ? <button type="button" onClick={() => void imprimirEntrega(pedido)}>Imprimir</button> : <span />}
        {passo > 0 && <button type="button" onClick={() => alterarStatus(pedido.id, PASSOS[passo - 1] === "aberto" ? "aberto" : PASSOS[passo - 1])}>Voltar um passo</button>}
      </div>
    </div>
    );
  };

  const modalPagamento = pagarPedido && (
    <div className="modal-overlay" onClick={() => setPagarPedido(null)}>
      <div className="modal-card pagar-card" role="dialog" aria-label="Como foi pago?" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">💳</div>
        <h2>Como foi pago?</h2>
        <p className="modal-total-encerrar">
          {tituloPedido(pagarPedido)} · Total: <strong>R$ {formatarMoeda(pagarPedido.total)}</strong>
        </p>
        {pagarPedido.pagamento && (
          <p className="modal-total-encerrar">
            Cliente escolheu: <strong>{pagarPedido.pagamento}</strong>
            {pagarPedido.troco ? ` (troco para R$ ${formatarMoeda(pagarPedido.troco)})` : ""}
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
      ) : pc ? (
        // Computador: todos os pedidos numa grade só, usando a largura da tela (o tipo está no cartão).
        <div className="pedidos-grade">{pedidosFiltrados.map(cartao)}</div>
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