import { useRecurso } from "../../recursos";
import { L } from "../../loja";
import useNomeLoja from "../../hooks/useNomeLoja";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ClipboardList, DollarSign, LayoutGrid, Menu, Settings, ShoppingBag, TrendingUp, X, Pencil, Eye, EyeOff } from "lucide-react";

import "../../styles/Garcom/Dashboard.css";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  where,
  addDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { baixarInsumos } from "../../utils/insumos";
import { AVISO_PARCIAL, temPagamentoParcial } from "../../utils/contaMesa";
import { useSouDono } from "../../tenant";
import AvisoCaixa from "../../components/AvisoCaixa";

function MesaIcon({ size = 24, strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="7" rx="8" ry="2.5" />
      <path d="M12 9.5V20M8 20.5h8" />
    </svg>
  );
}


function Dashboard() {
  // Funções que a IFTech pode desligar só nesta loja (Central da Loja).
  const viagemLigado = useRecurso("viagem");
  // Dinheiro só para o dono.
  const souDono = useSouDono();
  const financasLigado = useRecurso("financas") && souDono;
  const nomeLoja = useNomeLoja();
  const [faturamentoDia, setFaturamentoDia] = useState(0);
  const [mesas, setMesas] = useState([]);
  const [nomesMesas, setNomesMesas] = useState({});
  const [posicoesMesas, setPosicoesMesas] = useState({});
  const [totalNotificacoes, setTotalNotificacoes] = useState(0);
  const [menuAberto, setMenuAberto] = useState(false);
  const [modalCliente, setModalCliente] = useState(null);
  const [nomeCliente, setNomeCliente] = useState("");
  const [toastsPagamento, setToastsPagamento] = useState([]);
  const [toastsEstoque, setToastsEstoque] = useState([]);
  const [pagamentoAberto, setPagamentoAberto] = useState(null);

  // ── Organizar mesas (mesma ordem/posicao usada na tela Mesas) ──
  const [modoOrganizar, setModoOrganizar] = useState(false);
  const [arrastando, setArrastando] = useState(null);
  const [sobreNumero, setSobreNumero] = useState(null);
  const [posicaoArraste, setPosicaoArraste] = useState({ x: 0, y: 0 });
  const origemRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const elementoArrastadoRef = useRef(null);
  const totalMesasRef = useRef(15);

  function formatarMoeda(valor) {
    return Number(valor || 0).toFixed(2).replace(".", ",");
  }

  // Olhinho: esconde os valores do painel (total do dia e de cada mesa). Fica lembrado neste aparelho.
  const [ocultar, setOcultar] = useState(() => {
    try {
      return localStorage.getItem("iftech_ocultar_valores") === "1";
    } catch {
      return false;
    }
  });
  function alternarOcultar() {
    setOcultar((o) => {
      try {
        localStorage.setItem("iftech_ocultar_valores", o ? "0" : "1");
      } catch {
        /* sem armazenamento */
      }
      return !o;
    });
  }
  const valor = (v) => (ocultar ? "R$ ••••" : `R$ ${formatarMoeda(v)}`);
  // Loja com "resumo-no-fechamento": o painel não mostra valores (o resumo aparece ao encerrar o dia).
  const resumoNoFechamento = useRecurso("resumo-no-fechamento");

  useEffect(() => {
    const pedidosRef = query(collection(db, ...L(), "pedidos"), orderBy("salvoEm", "desc"));
    const vendasRef = collection(db, ...L(), "vendasDia");
    const notificacoesRef = collection(db, ...L(), "notificacoes");
    const mesasRef = collection(db, ...L(), "mesas");

    const cancelarMesas = onSnapshot(mesasRef, (snapshot) => {
      const nomes = {};
      const posicoes = {};

      snapshot.docs.forEach((documento) => {
        const info = documento.data();
        nomes[documento.id] = info.cliente || "";
        posicoes[documento.id] =
          typeof info.posicao === "number"
            ? info.posicao
            : Number(documento.id) - 1;
      });

      setNomesMesas(nomes);
      setPosicoesMesas(posicoes);

      totalMesasRef.current = Object.keys(posicoes).reduce(
        (max, numero) => Math.max(max, Number(numero)),
        15
      );
    });

    const cancelarPedidos = onSnapshot(pedidosRef, (snapshot) => {
      const listaPedidos = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      const listaMesas = [];

      for (let i = 1; i <= totalMesasRef.current; i++) {
        const pedidosMesa = listaPedidos.filter(
          (pedido) => pedido.tipo === "mesa" && Number(pedido.mesa) === i
        );

        const total = pedidosMesa.reduce(
          (soma, pedido) => soma + Number(pedido.total || 0),
          0
        );

        const totalItens = pedidosMesa.reduce(
          (soma, pedido) => soma + Number(pedido.totalItens || 0),
          0
        );

        listaMesas.push({
          numero: i,
          status: pedidosMesa.length > 0 ? "aberta" : "livre",
          total,
          totalItens,
        });
      }

      setMesas(listaMesas);
    });

    const cancelarVendas = onSnapshot(vendasRef, (snapshot) => {
      const vendas = snapshot.docs.map((documento) => documento.data());

      const totalDia = vendas.reduce(
        (soma, venda) => soma + Number(venda.total || 0),
        0
      );

      setFaturamentoDia(totalDia);
    });

    const cancelarNotificacoes = onSnapshot(notificacoesRef, (snapshot) => {
      setTotalNotificacoes(snapshot.docs.length);

      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added") return;

        const notificacao = {
          idFirebase: change.doc.id,
          ...change.doc.data(),
        };

        // O som e a vibração de cada aviso ficam em components/AvisosSom (tocam em qualquer tela).

        if (notificacao.tipo === "pedido" || notificacao.tipo === "garcom") {
          setTimeout(async () => {
            await deleteDoc(doc(db, ...L(), "notificacoes", notificacao.idFirebase));
          }, 6000);
        }

        if (notificacao.tipo === "pagamento") {
          const idToast = Date.now();

          setToastsPagamento((anterior) => {
            const novaLista = [
              ...anterior,
              {
                ...notificacao,
                idToast,
              },
            ];

            return novaLista.slice(-3);
          });

          setTimeout(() => {
            setToastsPagamento((anterior) =>
              anterior.filter((item) => item.idToast !== idToast)
            );
          }, 6000);
        }

        if (notificacao.tipo === "estoque") {
          const idToast = Date.now();

          setToastsEstoque((anterior) => {
            const novaLista = [
              ...anterior,
              {
                ...notificacao,
                idToast,
              },
            ];

            return novaLista.slice(-3);
          });

          setTimeout(() => {
            setToastsEstoque((anterior) =>
              anterior.filter((item) => item.idToast !== idToast)
            );
          }, 8000);

          setTimeout(async () => {
            await deleteDoc(doc(db, ...L(), "notificacoes", notificacao.idFirebase));
          }, 8000);
        }
      });
    });

    return () => {
      cancelarPedidos();
      cancelarVendas();
      cancelarNotificacoes();
      cancelarMesas();
    };
  }, []);

  function abrirModalCliente(e, mesa) {
    e.preventDefault();
    e.stopPropagation();

    setModalCliente(mesa.numero);
    setNomeCliente(nomesMesas[String(mesa.numero)] || "");
  }

  async function salvarNomeCliente() {
    if (!modalCliente) return;

    await setDoc(
      doc(db, ...L(), "mesas", String(modalCliente)),
      {
        numero: modalCliente,
        cliente: nomeCliente.trim(),
      },
      { merge: true }
    );

    setModalCliente(null);
    setNomeCliente("");
  }

  async function encerrarMesaPeloPagamento() {
    if (!pagamentoAberto) return;

    const numeroMesa = Number(pagamentoAberto.mesa);
    if (await temPagamentoParcial(numeroMesa)) {
      window.alert(AVISO_PARCIAL(numeroMesa));
      return;
    }

    try {
      const pedidosRef = collection(db, ...L(), "pedidos");

      const consultaMesa = query(
        pedidosRef,
        where("tipo", "==", "mesa"),
        where("mesa", "==", numeroMesa)
      );

      const resultado = await getDocs(consultaMesa);

      for (const documento of resultado.docs) {
        const pedidoDados = documento.data();

        await addDoc(collection(db, ...L(), "vendasDia"), {
          origem: "mesa",
          mesa: numeroMesa,
          titulo: pedidoDados.titulo || `Mesa ${numeroMesa}`,
          itens: pedidoDados.itens || [],
          total: pedidoDados.total || 0,
          totalItens: pedidoDados.totalItens || 0,
          formaPagamento: pagamentoAberto.formaPagamento || "Não informado",
          finalizadoEm: new Date().toISOString(),
          criadoEm: serverTimestamp(),
        });

        await addDoc(collection(db, ...L(), "historicoMesas"), {
          origem: "mesa",
          mesa: numeroMesa,
          titulo: pedidoDados.titulo || `Mesa ${numeroMesa}`,
          itens: pedidoDados.itens || [],
          total: pedidoDados.total || 0,
          totalItens: pedidoDados.totalItens || 0,
          formaPagamento: pagamentoAberto.formaPagamento || "Não informado",
          finalizadoEm: new Date().toISOString(),
          pedidoOriginalId: documento.id,
          status: "finalizada",
          criadoEm: serverTimestamp(),
        });

        await deleteDoc(doc(db, ...L(), "pedidos", documento.id));
      }
      // Matéria-prima: desconta o que a ficha técnica de cada produto usa.
      baixarInsumos(resultado.docs.flatMap((d) => d.data().itens || []));

      await setDoc(
        doc(db, ...L(), "mesas", String(numeroMesa)),
        {
          numero: numeroMesa,
          cliente: "",
        },
        { merge: true }
      );

      setPagamentoAberto(null);
    } catch (erro) {
      console.error("Erro ao encerrar mesa pelo pagamento:", erro);
    }
  }

  const mesasAbertas = mesas.filter((mesa) => mesa.status === "aberta").length;

  const pedidosHoje = mesas
    .filter((m) => m.status === "aberta")
    .reduce((soma, m) => soma + m.totalItens, 0);

  async function trocarPosicoes(numeroA, numeroB) {
    if (numeroA === numeroB) return;

    const posA = posicoesMesas[numeroA] ?? numeroA - 1;
    const posB = posicoesMesas[numeroB] ?? numeroB - 1;

    const batch = writeBatch(db);
    batch.set(doc(db, ...L(), "mesas", String(numeroA)), { posicao: posB }, { merge: true });
    batch.set(doc(db, ...L(), "mesas", String(numeroB)), { posicao: posA }, { merge: true });
    await batch.commit();
  }

  // Drag via Pointer Events — mesmo mecanismo usado na tela Mesas, funciona
  // igual com o dedo (mobile) e com o mouse.
  function aoPressionar(e, mesa) {
    if (!modoOrganizar) return;

    const alvo = e.currentTarget;
    alvo.setPointerCapture(e.pointerId);

    const retangulo = alvo.getBoundingClientRect();
    origemRef.current = {
      x: e.clientX - retangulo.left,
      y: e.clientY - retangulo.top,
      width: retangulo.width,
      height: retangulo.height,
    };

    elementoArrastadoRef.current = alvo;
    setArrastando(mesa.numero);
    setPosicaoArraste({ x: retangulo.left, y: retangulo.top });
  }

  function aoMover(e) {
    if (arrastando === null) return;

    e.preventDefault();

    const novoLeft = e.clientX - origemRef.current.x;
    const novoTop = e.clientY - origemRef.current.y;
    setPosicaoArraste({ x: novoLeft, y: novoTop });

    const elementoAnterior = elementoArrastadoRef.current;
    if (elementoAnterior) elementoAnterior.style.pointerEvents = "none";

    const elementoEmbaixo = document.elementFromPoint(e.clientX, e.clientY);

    if (elementoAnterior) elementoAnterior.style.pointerEvents = "";

    const cartaoAlvo = elementoEmbaixo?.closest("[data-mesa-numero]");
    if (cartaoAlvo) {
      const numeroAlvo = Number(cartaoAlvo.dataset.mesaNumero);
      setSobreNumero(numeroAlvo === arrastando ? null : numeroAlvo);
    } else {
      setSobreNumero(null);
    }
  }

  async function aoSoltar() {
    if (arrastando === null) return;

    const numeroOrigem = arrastando;
    const numeroDestino = sobreNumero;

    setArrastando(null);
    setSobreNumero(null);
    elementoArrastadoRef.current = null;

    if (numeroDestino && numeroDestino !== numeroOrigem) {
      await trocarPosicoes(numeroOrigem, numeroDestino);
    }
  }

  const mesasOrdenadas = [...mesas].sort(
    (a, b) => (posicoesMesas[a.numero] ?? a.numero - 1) - (posicoesMesas[b.numero] ?? b.numero - 1)
  );

  const mesasPainel = mesasOrdenadas.slice(0, 9);

  return (
    <div className="app-ref">
      {modalCliente && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card">
            <div className="modal-fechar-dia-icone">✏️</div>

            <h2>Nome do cliente</h2>

            <p>Identifique quem está usando a Mesa {modalCliente}.</p>

            <div className="produto-modal-form">
              <input
                placeholder="Ex: Allan"
                value={nomeCliente}
                onChange={(e) => setNomeCliente(e.target.value)}
                autoFocus
              />
            </div>

            <div className="modal-fechar-dia-botoes">
              <button
                className="modal-btn-cancelar"
                onClick={() => {
                  setModalCliente(null);
                  setNomeCliente("");
                }}
              >
                Cancelar
              </button>

              <button className="modal-btn-confirmar" onClick={salvarNomeCliente}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts-container">
        {toastsPagamento.map((toast) => (
          <div
            key={toast.idToast}
            className="toast-pagamento-garcom"
            onClick={async () => {
              setPagamentoAberto(toast);

              setToastsPagamento((anterior) =>
                anterior.filter((item) => item.idToast !== toast.idToast)
              );

              if (toast.idFirebase) {
                await deleteDoc(doc(db, ...L(), "notificacoes", toast.idFirebase));
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <strong>💳 Mesa {toast.mesa} pediu pagamento</strong>
            <span>R$ {formatarMoeda(toast.total || 0)}</span>
            <small>Forma: {toast.formaPagamento || "Não informado"}</small>
          </div>
        ))}

        {toastsEstoque.map((toast) => (
          <div key={toast.idToast} className="toast-estoque-garcom">
            <strong>📦 Estoque zerado</strong>
            <span>{toast.mensagem || "Um produto acabou no estoque."}</span>
          </div>
        ))}
      </div>

      {pagamentoAberto && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card">
            <div className="modal-fechar-dia-icone">💳</div>

            <h2>Mesa {pagamentoAberto.mesa}</h2>

            <p>Pedido de pagamento solicitado pelo cliente.</p>

            <div className="pedido-total">
              <span>Forma de pagamento</span>
              <strong>{pagamentoAberto.formaPagamento || "Não informado"}</strong>
            </div>

            <div className="pedido-total">
              <span>Total da mesa</span>
              <strong>R$ {formatarMoeda(pagamentoAberto.total || 0)}</strong>
            </div>

            <div className="modal-fechar-dia-botoes">
              <button
                className="modal-btn-cancelar"
                onClick={() => setPagamentoAberto(null)}
              >
                Fechar
              </button>

              <button
                className="modal-btn-confirmar"
                onClick={encerrarMesaPeloPagamento}
              >
                Encerrar Mesa
              </button>
            </div>
          </div>
        </div>
      )}

      {menuAberto && (
        <>
          <div className="menu-overlay" onClick={() => setMenuAberto(false)} />

          <aside className="menu-lateral">
            <div className="menu-lateral-topo">
              <h2>{nomeLoja}</h2>
              <button onClick={() => setMenuAberto(false)}>
                <X size={24} />
              </button>
            </div>

            <Link to="/" onClick={() => setMenuAberto(false)}>
              <LayoutGrid size={20} />
              Painel
            </Link>

            <Link to="/pedidos" onClick={() => setMenuAberto(false)}>
              <ClipboardList size={20} />
              Pedidos
            </Link>

            <Link to="/mesas" onClick={() => setMenuAberto(false)}>
              <MesaIcon size={20} />
              Mesas
            </Link>

            <Link to="/novo" onClick={() => setMenuAberto(false)}>
              <ShoppingBag size={20} />
              Novo pedido
            </Link>

            <span className="menu-secao">Áreas</span>
            <Link to="/vendas" onClick={() => setMenuAberto(false)}>
              💵
              <span>Vendas <small>caixa, histórico, relatório</small></span>
            </Link>

            <Link to="/cardapio" onClick={() => setMenuAberto(false)}>
              🍔
              <span>Cardápio e estoque <small>produtos, hoje, estoque, preço</small></span>
            </Link>

            {financasLigado && (
              <Link to="/dinheiro" onClick={() => setMenuAberto(false)}>
                💰
                <span>Dinheiro <small>lucro, despesas e compras</small></span>
              </Link>
            )}

            <Link to="/config" onClick={() => setMenuAberto(false)}>
              <Settings size={20} />
              Configurações
            </Link>

            <button type="button" className="menu-atalhos-ref" onClick={() => { setMenuAberto(false); window.dispatchEvent(new Event("abrir-atalhos")); }}>
              ⌨️ Atalhos do teclado
            </button>
          </aside>
        </>
      )}

      <header className="header-ref">
        <button className="icon-btn-ref" onClick={() => setMenuAberto(true)}>
          <Menu size={30} strokeWidth={2.4} />
        </button>

        <h1>Painel</h1>

        <Link to="/notificacoes" className="bell-link-ref">
          <Bell size={30} strokeWidth={2.4} />
          {totalNotificacoes > 0 && (
            <span className="badge-ref">{totalNotificacoes}</span>
          )}
        </Link>
      </header>

      <AvisoCaixa />

      {!resumoNoFechamento && (
      <section className="summary-ref">
        <div className="summary-main-ref">
          <div className="icon-circle-ref green">
            <DollarSign size={27} strokeWidth={3} />
          </div>

          <div className="summary-text-ref">
            <span className="olho-linha">
              Total do dia
              <button type="button" className="olho-btn" onClick={alternarOcultar} aria-label={ocultar ? "Mostrar os valores" : "Esconder os valores"} title={ocultar ? "Mostrar os valores" : "Esconder os valores"}>
                {ocultar ? <EyeOff size={20} strokeWidth={2.4} /> : <Eye size={20} strokeWidth={2.4} />}
              </button>
            </span>
            <h2>{valor(faturamentoDia)}</h2>
          </div>

          <div className="icon-square-ref green">
            <TrendingUp size={30} strokeWidth={2.6} />
          </div>
        </div>

        <div className="summary-bottom-ref">
          <div className="summary-mini-ref">
            <div className="icon-circle-ref purple">
              <MesaIcon size={26} strokeWidth={2.5} />
            </div>
            <div>
              <span>Mesas abertas</span>
              <strong>{mesasAbertas}</strong>
            </div>
          </div>

          <div className="summary-mini-ref">
            <div className="icon-circle-ref orange">
              <ClipboardList size={26} strokeWidth={2.5} />
            </div>
            <div>
              <span>Itens em aberto</span>
              <strong>{pedidosHoje}</strong>
            </div>
          </div>
        </div>
      </section>
      )}

      {viagemLigado && (
        <nav className="novo-rapido-ref" aria-label="Novo pedido">
          <Link to="/novo">🍽️<span>Mesa</span></Link>
          <Link to="/novo?aba=balcao">🛍️<span>Balcão</span></Link>
          <Link to="/novo?aba=entrega">🛵<span>Entrega</span></Link>
        </nav>
      )}

      <div className="section-title-ref">
        <h2>Mesas</h2>
        <div className="section-title-acoes-ref">
          <button
            className={`table-btn-organizar ${modoOrganizar ? "ativo" : ""}`}
            onClick={() => setModoOrganizar((v) => !v)}
          >
            {modoOrganizar ? "✓ Concluir" : "✋ Organizar"}
          </button>
          <Link to="/mesas">Ver todas ›</Link>
        </div>
      </div>

      <section
        className={`tables-grid-ref ${modoOrganizar ? "modo-organizar" : ""}`}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
      >
        {mesasPainel.map((mesa) => {
          const cliente = nomesMesas[String(mesa.numero)];
          const estaArrastando = arrastando === mesa.numero;
          const estaSobre = sobreNumero === mesa.numero;

          const conteudoCard = (
            <article
              data-mesa-numero={mesa.numero}
              className={`table-card-ref ${mesa.status} ${
                estaArrastando ? "arrastando" : ""
              } ${estaSobre ? "alvo-troca" : ""}`}
              style={
                estaArrastando
                  ? {
                      position: "fixed",
                      left: posicaoArraste.x,
                      top: posicaoArraste.y,
                      width: origemRef.current.width,
                      height: origemRef.current.height,
                      zIndex: 999,
                      boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
                      touchAction: "none",
                    }
                  : modoOrganizar
                  ? { touchAction: "none" }
                  : undefined
              }
              onPointerDown={(e) => aoPressionar(e, mesa)}
            >
              <span className={`table-dot-ref ${mesa.status}`}></span>

              <div className="mesa-nome-linha">
                <h3>
                  Mesa {mesa.numero}
                  {cliente ? ` - ${cliente}` : ""}
                </h3>

                {!modoOrganizar && (
                  <button
                    className="mesa-editar-cliente"
                    onClick={(e) => abrirModalCliente(e, mesa)}
                    title="Editar nome do cliente"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>

              <div className={`table-icon-ref ${mesa.status}`}>
                {modoOrganizar ? (
                  <span style={{ fontSize: 18 }}>⠿</span>
                ) : (
                  <MesaIcon size={29} strokeWidth={1.9} />
                )}
              </div>

              <strong className={resumoNoFechamento && mesa.status !== "livre" ? "mesa-aberta-txt" : undefined}>{resumoNoFechamento ? (mesa.status === "livre" ? "Livre" : "Aberta") : valor(mesa.total)}</strong>
              <small>{mesa.totalItens} itens</small>
            </article>
          );

          if (modoOrganizar) {
            return <div key={mesa.numero}>{conteudoCard}</div>;
          }

          return (
            <Link
              key={mesa.numero}
              to={`/mesa/${mesa.numero}`}
              className="table-link-ref"
            >
              {conteudoCard}
            </Link>
          );
        })}
      </section>

      <nav className="bottom-nav-ref">
        <Link to="/" className="active">
          <LayoutGrid size={26} />
          <span>Painel</span>
        </Link>

        <Link to="/pedidos">
          <ClipboardList size={26} />
          <span>Pedidos</span>
        </Link>

        <Link to="/mesas">
          <MesaIcon size={28} />
          <span>Mesas</span>
        </Link>

        <Link to="/config">
          <Settings size={27} />
          <span>Config.</span>
        </Link>
      </nav>
    </div>
  );
}

export default Dashboard;