import { L, MULTI } from "../../loja";
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { ordenarGruposPorCategoria, trocarOrdemCategorias } from "../../utils/categorias";
import { ordenarItensCategoria, moverItemCategoria } from "../../utils/produtosOrdem";
import { useConfigImpressora } from "../../hooks/useConfigImpressora";
import {
  gerarComandaHTML,
  gerarComprovanteHTML,
  imprimir,
  jaImprimiu,
  marcarComoImpresso,
} from "../../utils/print";
import { numeroDoPedido } from "../../utils/numeroPedido";
import "../../styles/Garcom/MesaDetalhe.css";
import PedidoRapido from "../../components/PedidoRapido";
import MontarPrato from "../../components/MontarPrato";
import PratoNoPedido from "../../components/PratoNoPedido";
import { totalNoCartao, useTaxas } from "../../utils/taxas";
import { useRecurso } from "../../recursos";
import ContaParcial from "../../components/ContaParcial";
import FormasPagamento, { resolverPartes } from "../../components/FormasPagamento";
import { ajustarPartes, falta as faltaDaConta, textoPagamentos, totalPago as totalPagoMesa } from "../../utils/conta";
import { MONTAGEM_ALMOCO, detalhesMontagem, textoDoItem, emojiCategoria, pratosSemMontagem, sugestoesBebida, abreEscolha } from "../../utils/montagem";
import { baixarInsumos } from "../../utils/insumos";
import { meuAparelho } from "../../utils/sons";
import { MOTIVOS_PEDIDO, registrar } from "../../utils/registro";
import { useFotos } from "../../utils/fotos";



/** Quem pediu o item pelo QR Code ("" = lançado pelo garçom, sem nome). */
const donoDoItem = (item) => {
  const nome = String(item?.cliente || "").trim();
  return nome && nome.toLowerCase() !== "cliente" ? nome : "";
};

function MesaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const alterouTimer = useRef(null);
  // Tirar algo já salvo na comanda pede o motivo (vai para o registro da dona).
  const [pedirMotivo, setPedirMotivo] = useState(null); // { nome, preco, detalhes, fazer(motivo) }
  const [motivoOutro, setMotivoOutro] = useState("");
  const [motivoEscolhido, setMotivoEscolhido] = useState("");
  const fotos = useFotos(useRecurso("fotos"));
  // Função por loja (pedido do Chef Baguette): depois de salvar o pedido, volta para o Painel.
  const voltarAoSalvar = useRecurso("voltar-ao-salvar");
  const voltarAoPainel = () => setTimeout(() => navigate("/"), 700);

  const [produtos, setProdutos] = useState([]);
  const [categoriaAberta, setCategoriaAberta] = useState("");
  const [categoriaOrganizando, setCategoriaOrganizando] = useState("");
  const [organizandoCategorias, setOrganizandoCategorias] = useState(false);
  const [pedido, setPedido] = useState({});
  const [pedidoMesa, setPedidoMesa] = useState(null);
  const [pedidoMesaId, setPedidoMesaId] = useState(null);
  const [todosPedidosIds, setTodosPedidosIds] = useState([]); // ✅ CORREÇÃO BUG 4
  const [mostrarPedidoMesa, setMostrarPedidoMesa] = useState(false);
  const [nomeCliente, setNomeCliente] = useState("");
  // Partes da conta já pagas (mesas/<n>.pagamentos) e a janela da conta parcial.
  const [pagamentosMesa, setPagamentosMesa] = useState([]);
  const [contaParcial, setContaParcial] = useState(false);
  const [nomeClienteInput, setNomeClienteInput] = useState("");
  const [editandoNomeCliente, setEditandoNomeCliente] = useState(false);
  const [notificacao, setNotificacao] = useState("");
  const [encerrando, setEncerrando] = useState(false);
  const [mostrarModalEncerrarMesa, setMostrarModalEncerrarMesa] = useState(false);
  const [categoriasDocs, setCategoriasDocs] = useState([]);
  const [etapaEncerrar, setEtapaEncerrar] = useState("opcoes"); // opcoes | pagamento
  // Formas de pagamento ao encerrar (pode ser mais de uma): { Pix: "30,00", Dinheiro: "50,00" }
  const [partesEncerrar, setPartesEncerrar] = useState({});
  // Taxas da maquininha (Configurações): o valor no cartão já vem calculado para o garçom.
  const taxas = useTaxas();
  // Pedido rápido (almoço): prato com montagem aberto na janela, e o modo antigo para organizar.
  const [montando, setMontando] = useState(null);
  // Prato que já está no pedido atual: pergunta se edita ou acrescenta mais um.
  const [perguntar, setPerguntar] = useState(null);
  const [editando, setEditando] = useState(null); // nome da linha do pedido que está sendo editada
  // Prato já salvo na comanda sendo editado (pelo "Ver pedido"): o nome da linha na comanda.
  const [editandoSalvo, setEditandoSalvo] = useState(null);
  const [organizarAberto, setOrganizarAberto] = useState(false);
  // Depois de salvar (ou de alterar o pedido em "Ver pedido"): pergunta se imprime na cozinha.
  // A janela de impressão só abre direito quando nasce de um toque, por isso o botão.
  const [paraImprimir, setParaImprimir] = useState(null); // { itens, total, alterado }
  const [alterouPedidoMesa, setAlterouPedidoMesa] = useState(false);
  const configImpressora = useConfigImpressora();
  // Funções que a IFTech pode desligar só nesta loja (Central da Loja).
  const montarLigado = useRecurso("montar-prato");
  const imprimirLigado = useRecurso("imprimir-cozinha");

  useEffect(() => {
    const cancelar = onSnapshot(doc(db, ...L(), "mesas", String(id)), (documento) => {
      if (documento.exists()) {
        const cliente = documento.data().cliente || "";
        setNomeCliente(cliente);
        setNomeClienteInput(cliente);
        setPagamentosMesa(Array.isArray(documento.data().pagamentos) ? documento.data().pagamentos : []);
      } else {
        setPagamentosMesa([]);
        setNomeCliente("");
        setNomeClienteInput("");
      }
    });

    return () => cancelar();
  }, [id]);

  useEffect(() => {
    const cancelarCategorias = onSnapshot(collection(db, ...L(), "categorias"), (snapshot) => {
      setCategoriasDocs(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
    });

    return () => cancelarCategorias();
  }, []);

  useEffect(() => {
    const cancelar = onSnapshot(collection(db, ...L(), "produtos"), (snapshot) => {
      const listaProdutos = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      // Pratos de lojas antigas ainda sem montagem: ganham o modelo de almoço (aqui e no cadastro).
      if (MULTI) {
        pratosSemMontagem(listaProdutos).forEach((p) => {
          p.montagem = MONTAGEM_ALMOCO;
          setDoc(doc(db, ...L(), "produtos", p.id), { montagem: MONTAGEM_ALMOCO }, { merge: true }).catch(() => {});
        });
      }

      // Fora do cardápio de hoje também não aparece para lançar.
      const produtosAtivos = listaProdutos.filter(
        (produto) => produto.ativo !== false && produto.foraHoje !== true
      );

      const grupos = produtosAtivos.reduce((resultado, produto) => {
        if (!resultado[produto.categoria]) {
          resultado[produto.categoria] = {
            categoria: produto.categoria,
            itens: [],
          };
        }

        resultado[produto.categoria].itens.push({
          id: produto.id,
          nome: produto.nome,
          preco: Number(produto.preco || 0),
          ordem: produto.ordem,
          montagem: produto.montagem || null,
          tipo: produto.tipo || null,
        });

        return resultado;
      }, {});

      const listaCategorias = Object.values(grupos);

      listaCategorias.forEach((categoria) => {
        categoria.itens = ordenarItensCategoria(categoria.itens);
      });

      setProdutos(ordenarGruposPorCategoria(listaCategorias, categoriasDocs));
    });

    return () => cancelar();
  }, [categoriasDocs]);

  useEffect(() => {
    const pedidosRef = collection(db, ...L(), "pedidos");

    const consultaMesa = query(
  pedidosRef,
  where("tipo", "==", "mesa")
);

    const cancelar = onSnapshot(consultaMesa, (snapshot) => {
      if (snapshot.empty) {
        setPedidoMesa(null);
        setPedidoMesaId(null);
        setTodosPedidosIds([]); // ✅ CORREÇÃO BUG 4
        return;
      }

      const pedidosDaMesa = snapshot.docs
  .map((documento) => ({
    id: documento.id,
    ...documento.data(),
  }))
  .filter((pedido) => Number(pedido.mesa) === Number(id));

if (pedidosDaMesa.length === 0) {
  setPedidoMesa(null);
  setPedidoMesaId(null);
  setTodosPedidosIds([]);
  return;
}

      // ✅ CORREÇÃO BUG 4: guarda todos os ids, não só o primeiro
      const idsEncontrados = pedidosDaMesa.map((p) => p.id);
      setTodosPedidosIds(idsEncontrados);

      const todosItens = pedidosDaMesa.flatMap((pedido) => pedido.itens || []);

      const itensAgrupados = todosItens.reduce((resultado, item) => {
        const nome = item.nome;

        if (!resultado[nome]) {
          // Guarda o produto, o nome do prato e as escolhas (para editar e para o relatório/estoque).
          // eslint-disable-next-line no-unused-vars
          const { quantidade, ...resto } = item;
          resultado[nome] = {
            ...resto,
            nome: item.nome,
            preco: Number(item.preco || 0),
            qtd: 0,
          };
        }

        resultado[nome].qtd += Number(item.qtd || item.quantidade || 0);

        return resultado;
      }, {});

      const itensOrdenados = Object.values(itensAgrupados).sort((a, b) => {
        const totalA = Number(a.preco || 0) * Number(a.qtd || 0);
        const totalB = Number(b.preco || 0) * Number(b.qtd || 0);

        if (totalA !== totalB) return totalA - totalB;

        return a.nome.localeCompare(b.nome);
      });

      setPedidoMesa({
        id: pedidosDaMesa[0].id,
        pedidosIds: idsEncontrados,
        tipo: "mesa",
        mesa: Number(id),
        itens: itensOrdenados,
        // Os itens como foram pedidos, sem juntar: guardam quem pediu cada um pelo QR Code
        // (para dividir a conta e para não perder o nome ao mexer na comanda).
        itensBrutos: todosItens.map((item) => ({ ...item, qtd: Number(item.qtd ?? item.quantidade ?? 0) })),
        total: itensOrdenados.reduce(
          (soma, item) => soma + Number(item.preco || 0) * Number(item.qtd || 0),
          0
        ),
        totalItens: itensOrdenados.reduce(
          (soma, item) => soma + Number(item.qtd || 0),
          0
        ),
      });

      setPedidoMesaId(pedidosDaMesa[0].id);
    });

    return () => cancelar();
  }, [id]);

  function alternarCategoria(nomeCategoria) {
    setCategoriaAberta(categoriaAberta === nomeCategoria ? "" : nomeCategoria);
  }

  function moverCategoria(indice, direcao) {
    const novoIndice = indice + direcao;
    if (novoIndice < 0 || novoIndice >= produtos.length) return;

    const categoriaAtual = categoriasDocs.find(
      (c) => c.nome === produtos[indice].categoria
    );
    const categoriaAlvo = categoriasDocs.find(
      (c) => c.nome === produtos[novoIndice].categoria
    );

    if (!categoriaAtual || !categoriaAlvo) return;

    trocarOrdemCategorias(categoriaAtual, categoriaAlvo);
  }

  function adicionarItem(item) {
    setPedido((pedidoAtual) => {
      const itemAtual = pedidoAtual[item.nome];

      return {
        ...pedidoAtual,
        [item.nome]: {
          produtoId: item.id,
          nome: item.nome,
          preco: item.preco,
          qtd: itemAtual ? itemAtual.qtd + 1 : 1,
        },
      };
    });
  }

  function removerItem(item) {
    setPedido((pedidoAtual) => {
      const itemAtual = pedidoAtual[item.nome];

      if (!itemAtual) return pedidoAtual;

      if (itemAtual.qtd === 1) {
        const novoPedido = { ...pedidoAtual };
        delete novoPedido[item.nome];
        return novoPedido;
      }

      return {
        ...pedidoAtual,
        [item.nome]: {
          ...itemAtual,
          qtd: itemAtual.qtd - 1,
        },
      };
    });
  }

  const linhasDoProduto = (id) =>
    Object.values(pedido)
      .filter((l) => l.produtoId === id && l.montagem)
      .map((l) => ({ ...l, chave: l.nome, quantidade: l.qtd }));
  const produtoPorId = (id) => produtos.flatMap((g) => g.itens || []).find((i) => i.id === id);

  function editarLinha(l) {
    const item = produtoPorId(l.produtoId);
    if (!item) return;
    setPerguntar(null);
    setEditando(l.nome);
    setMontando(item);
  }

  function tocarItem(item) {
    if (abreEscolha(item, montarLigado)) {
      if (linhasDoProduto(item.id).length) return setPerguntar(item);
      setEditando(null);
      setMontando(item);
    } else adicionarItem(item);
  }

  /** Editar um prato que já está salvo na comanda: troca a linha e avisa a cozinha (comanda alterada). */
  function editarSalvo(item) {
    const produto = produtoPorId(item.produtoId);
    if (!produto) return;
    setMostrarPedidoMesa(false);
    setEditandoSalvo(item.nome);
    setMontando(produto);
  }

  async function salvarEdicaoSalvo(prato) {
    const antigos = itensBrutosMesa.filter((i) => i.nome === editandoSalvo);
    setMontando(null);
    setEditandoSalvo(null);
    if (!antigos.length) return;
    // Cada pessoa que pediu o prato continua com o dela (o nome do QR Code não se perde).
    const novos = itensBrutosMesa.filter((i) => i.nome !== editandoSalvo).map((i) => ({ ...i }));
    antigos.forEach((antigo) => {
      const novo = { ...antigo, ...prato, qtd: Number(antigo.qtd || 0), ...(antigo.cliente ? { cliente: antigo.cliente } : {}) };
      const igual = novos.find((i) => i.nome === novo.nome && donoDoItem(i) === donoDoItem(novo));
      if (igual) igual.qtd = Number(igual.qtd || 0) + novo.qtd;
      else novos.push(novo);
    });
    setAlterouPedidoMesa(true);
    await atualizarPedidoMesa(novos);
    registrar({ area: "pedidos", acao: "Alterou prato da comanda", mesa: id, antes: detalhesMontagem(itensMesa.find((i) => i.nome === editandoSalvo)?.montagem).join(", ") || editandoSalvo, depois: detalhesMontagem(prato.montagem).join(", ") || prato.nome, texto: prato.nomeBase || prato.nome });
    mostrarNotificacao("Prato alterado na comanda.");
    setMostrarPedidoMesa(true);
  }

  /** Prato montado (e as bebidas escolhidas junto) entram no pedido atual. */
  function adicionarMontado({ prato, bebidas, qtd: quantos = 1 }) {
    if (editandoSalvo) return void salvarEdicaoSalvo(prato);
    setPedido((atual) => {
      const novo = { ...atual };
      // Editando: a linha antiga sai e a nova fica com a mesma quantidade.
      const antiga = editando ? atual[editando] : null;
      if (antiga) delete novo[editando];
      const ja = novo[prato.nome];
      const qtd = antiga ? antiga.qtd : quantos;
      novo[prato.nome] = { ...prato, qtd: ja ? ja.qtd + qtd : qtd };
      bebidas.forEach((b) => {
        const jb = novo[b.nome];
        novo[b.nome] = { produtoId: b.id, nome: b.nome, preco: b.preco, qtd: jb ? jb.qtd + 1 : 1 };
      });
      return novo;
    });
    setMontando(null);
    setEditando(null);
  }

  function ajustarItemPedido(nome, delta) {
    setPedido((atual) => {
      const it = atual[nome];
      if (!it) return atual;
      const novo = { ...atual };
      if (it.qtd + delta <= 0) delete novo[nome];
      else novo[nome] = { ...it, qtd: it.qtd + delta };
      return novo;
    });
  }

  function mostrarNotificacao(texto) {
    setNotificacao(texto);
    setTimeout(() => setNotificacao(""), 2500);
  }

  function formatarMoeda(valor) {
    return Number(valor).toFixed(2).replace(".", ",");
  }

  async function salvarNomeCliente() {
    await setDoc(
      doc(db, ...L(), "mesas", String(id)),
      {
        numero: Number(id),
        cliente: nomeClienteInput.trim(),
      },
      { merge: true }
    );

    setEditandoNomeCliente(false);
    mostrarNotificacao("Nome do cliente salvo!");
  }

  const itensPedido = Object.values(pedido).sort(
    (a, b) => Number(a.preco) - Number(b.preco)
  );

  const total = itensPedido.reduce(
    (soma, item) => soma + item.preco * item.qtd,
    0
  );

  const totalItens = itensPedido.reduce((soma, item) => soma + item.qtd, 0);

  const itensMesa = pedidoMesa?.itens || [];
  const itensBrutosMesa = pedidoMesa?.itensBrutos || itensMesa;

  const totalMesa = itensMesa.reduce(
    (soma, item) => soma + Number(item.preco || 0) * Number(item.qtd || 0),
    0
  );

  const totalItensMesa = itensMesa.reduce(
    (soma, item) => soma + Number(item.qtd || 0),
    0
  );

  const totalGeralMesa = totalMesa + total;

  /** Aviso na lista da equipe (sem som: pedido feito pela equipe não toca). */
  function avisarEquipe(som, mensagem) {
    addDoc(collection(db, ...L(), "notificacoes"), {
      mesa: Number(id),
      tipo: "pedido",
      som,
      equipe: true,
      mensagem,
      de: meuAparelho(),
      lida: false,
      horario: new Date().toISOString(),
      criadoEm: serverTimestamp(),
    }).catch(() => {});
  }

  // ✅ CORREÇÃO BUG 4: atualiza sempre o primeiro pedido com os itens agrupados de todos
  async function atualizarPedidoMesa(novosItens) {
    if (!pedidoMesaId) return;
    // Mexeu na comanda já salva (+, −, editou ou tirou prato): 1 aviso "alterou" depois de 5 s sem mexer.
    clearTimeout(alterouTimer.current);
    alterouTimer.current = setTimeout(() => avisarEquipe("alterou", `Mesa ${id}: o pedido foi alterado`), 5000);

    if (novosItens.length === 0) {
      // Se ficou sem itens, apaga todos os pedidos da mesa
      for (const pedidoId of todosPedidosIds) {
        await deleteDoc(doc(db, ...L(), "pedidos", pedidoId));
      }
      setMostrarPedidoMesa(false);
      mostrarNotificacao("Pedido da mesa removido.");
      return;
    }

    const novoTotal = novosItens.reduce(
      (soma, item) => soma + Number(item.preco || 0) * Number(item.qtd || 0),
      0
    );

    const novoTotalItens = novosItens.reduce(
      (soma, item) => soma + Number(item.qtd || 0),
      0
    );

    // Consolida tudo no primeiro pedido
    await updateDoc(doc(db, ...L(), "pedidos", pedidoMesaId), {
      itens: novosItens,
      total: novoTotal,
      totalItens: novoTotalItens,
      atualizadoEm: new Date().toISOString(),
    });

    // ✅ CORREÇÃO BUG 4: apaga pedidos extras se houver mais de um
    for (const pedidoId of todosPedidosIds) {
      if (pedidoId !== pedidoMesaId) {
        await deleteDoc(doc(db, ...L(), "pedidos", pedidoId));
      }
    }
  }

  // Ajustar a quantidade mexe nos itens como foram pedidos (cada um com o nome de quem pediu):
  // o que o garçom põe a mais fica sem nome; o que tira sai primeiro do que não tem nome.
  async function aumentarItemMesa(itemSelecionado) {
    const novosItens = itensBrutosMesa.map((item) => ({ ...item }));
    const semNome = novosItens.find((item) => item.nome === itemSelecionado.nome && !donoDoItem(item));
    if (semNome) semNome.qtd = Number(semNome.qtd || 0) + 1;
    else {
      // eslint-disable-next-line no-unused-vars
      const { cliente, quantidade, ...base } = novosItens.find((item) => item.nome === itemSelecionado.nome) || itemSelecionado;
      novosItens.push({ ...base, qtd: 1 });
    }

    setAlterouPedidoMesa(true);
    await atualizarPedidoMesa(novosItens);
    registrar({ area: "pedidos", acao: "Acrescentou na comanda", mesa: id, texto: `+${textoDoItem({ ...itemSelecionado, qtd: 1 })}`, valor: Number(itemSelecionado.preco || 0) });
  }

  /** Nome do prato e o que vem nele, um por linha ("Marmita P", "Feijão preto", "sem Cebola"). */
  function partesItem(item) {
    const [nomeLido, ...doNome] = String(item?.nome || "").split(" — ");
    const det = detalhesMontagem(item?.montagem);
    const detalhes = (det.length ? det : doNome.join(" — ").split(/,\s*(?![^()]*\))/)).filter(Boolean).map((d) => d.charAt(0).toUpperCase() + d.slice(1));
    return { nome: item?.nomeBase || nomeLido, detalhes };
  }

  /** Tirar 1 de um item já salvo: pergunta o motivo antes. */
  function diminuirItemMesa(itemSelecionado) {
    const ultimo = Number(itemSelecionado.qtd) === 1;
    setMotivoOutro("");
    setMotivoEscolhido("");
    const partes = partesItem(itemSelecionado);
    setPedirMotivo({
      nome: partes.nome,
      preco: Number(itemSelecionado.preco || 0),
      detalhes: partes.detalhes,
      fazer: async (motivo) => {
        await tirarItemMesa(itemSelecionado);
        registrar({ area: "pedidos", acao: ultimo ? "Tirou da comanda" : "Diminuiu na comanda", mesa: id, texto: `−${textoDoItem({ ...itemSelecionado, qtd: 1 })}`, valor: -Number(itemSelecionado.preco || 0), motivo });
      },
    });
  }

  async function tirarItemMesa(itemSelecionado) {
    const novosItens = itensBrutosMesa.map((item) => ({ ...item }));
    const doNome = novosItens.filter((item) => item.nome === itemSelecionado.nome && Number(item.qtd || 0) > 0);
    const tirar = doNome.find((item) => !donoDoItem(item)) || doNome[doNome.length - 1];
    if (tirar) tirar.qtd = Number(tirar.qtd || 0) - 1;

    setAlterouPedidoMesa(true);
    await atualizarPedidoMesa(novosItens.filter((item) => Number(item.qtd || 0) > 0));
  }

  async function salvarPedido() {
    if (itensPedido.length === 0) {
      mostrarNotificacao("Adicione pelo menos 1 item antes de salvar.");
      return;
    }

    try {
      const pedidosRef = collection(db, ...L(), "pedidos");

      const consultaMesaAberta = query(
        pedidosRef,
        where("tipo", "==", "mesa"),
        where("mesa", "==", Number(id))
      );

      const resultado = await getDocs(consultaMesaAberta);

      if (!resultado.empty) {
        const documentoMesa = resultado.docs[0];
        const pedidoAtual = documentoMesa.data();

        const itensAntigos = pedidoAtual.itens || [];
        const itensNovos = [...itensAntigos];

        itensPedido.forEach((novoItem) => {
          // Junta só com o mesmo item da mesma pessoa (o que o garçom lança fica sem nome).
          const itemExistente = itensNovos.find(
            (item) => item.nome === novoItem.nome && donoDoItem(item) === donoDoItem(novoItem)
          );

          if (itemExistente) {
            itemExistente.qtd += novoItem.qtd;
          } else {
            itensNovos.push(novoItem);
          }
        });

        const novoTotal = itensNovos.reduce(
          (soma, item) => soma + Number(item.preco || 0) * Number(item.qtd || 0),
          0
        );

        const novoTotalItens = itensNovos.reduce(
          (soma, item) => soma + Number(item.qtd || 0),
          0
        );

        await updateDoc(doc(db, ...L(), "pedidos", documentoMesa.id), {
          itens: itensNovos,
          total: novoTotal,
          totalItens: novoTotalItens,
          // Quantos pedidos a mesa fez (cada "Salvar pedido" conta 1): vai para o histórico.
          lancamentos: Number(pedidoAtual.lancamentos || 1) + 1,
          atualizadoEm: new Date().toISOString(),
        });
      } else {
        const idPedido = Date.now();

        await addDoc(collection(db, ...L(), "pedidos"), {
          idLocal: idPedido,
          tipo: "mesa",
          mesa: Number(id), // ✅ já estava correto aqui
          titulo: `Mesa ${id}`,
          itens: itensPedido,
          total,
          totalItens,
          lancamentos: 1,
          status: "aberto",
          salvoEm: new Date().toISOString(),
          criadoEm: serverTimestamp(),
        });
      }

      registrar({ area: "pedidos", acao: !resultado.empty ? "Acrescentou pedido" : "Abriu a mesa", mesa: id, texto: itensPedido.map(textoDoItem).join(", "), valor: total });
      // Avisa os outros aparelhos da equipe (cozinha, caixa): som de pedido novo ou de acrescentou.
      avisarEquipe(!resultado.empty ? "acrescentou" : "mesa", !resultado.empty ? `Mesa ${id}: acrescentaram itens no pedido` : `Novo pedido na Mesa ${id}`);

      for (const item of itensPedido) {
        if (!item.produtoId) continue;

        const estoqueRef = doc(db, ...L(), "estoque", item.produtoId);
        const estoqueSnap = await getDoc(estoqueRef);

        if (estoqueSnap.exists()) {
          const quantidadeAtual = Number(estoqueSnap.data().quantidade || 0);
          const novaQuantidade = Math.max(0, quantidadeAtual - Number(item.qtd || 0));

          await setDoc(
            estoqueRef,
            {
              quantidade: novaQuantidade,
              atualizadoEm: new Date().toISOString(),
            },
            { merge: true }
          );

          if (novaQuantidade === 0 && quantidadeAtual > 0) {
            await addDoc(collection(db, ...L(), "notificacoes"), {
              tipo: "estoque",
              mensagem: `${item.nome} acabou no estoque`,
              produtoId: item.produtoId,
              produto: item.nome,
              lida: false,
              horario: new Date().toISOString(),
              criadoEm: serverTimestamp(),
            });
          }
        }
      }

      const itensImpressos = itensPedido;
      const totalImpresso = total;

      setPedido({});
      mostrarNotificacao("Pedido salvo com sucesso!");

      if (configImpressora.habilitada && imprimirLigado) {
        // "Imprimir automaticamente" ligado na configuração: tenta direto; se o celular bloquear, pergunta.
        const impresso = configImpressora.autoImprimirPedido ? await imprimirComandaAgora(itensImpressos, totalImpresso) : false;
        if (!impresso) setParaImprimir({ itens: itensImpressos, total: totalImpresso, alterado: false, voltar: voltarAoSalvar });
        else if (voltarAoSalvar) voltarAoPainel();
      } else if (voltarAoSalvar) voltarAoPainel();
    } catch (erro) {
      console.error("Erro ao salvar pedido da mesa:", erro);
      mostrarNotificacao("Erro ao salvar no Firebase.");
    }
  }

  async function imprimirComandaAgora(itensParaImprimir, totalParaImprimir, observacoes) {
    const html = gerarComandaHTML({
      numeroPedido: await numeroDoPedido(pedidoMesaId),
      mesa: id,
      cliente: nomeCliente,
      itens: itensParaImprimir,
      total: totalParaImprimir,
      observacoes,
      config: configImpressora,
    });

    return imprimir(html, configImpressora.larguraPapel);
  }

  async function confirmarImpressaoCozinha() {
    const p = paraImprimir;
    setParaImprimir(null);
    if (!p) return;
    const abriu = await imprimirComandaAgora(p.itens, p.total, p.alterado ? "PEDIDO ALTERADO: esta é a comanda completa da mesa." : "");
    if (!abriu) mostrarNotificacao("O celular bloqueou a janela de impressão. Libere as janelas (pop-ups) do site e tente de novo.");
    else if (p.voltar) voltarAoPainel();
  }

  function fecharPedidoMesa() {
    setMostrarPedidoMesa(false);
    if (alterouPedidoMesa && configImpressora.habilitada && imprimirLigado && itensMesa.length > 0) {
      setParaImprimir({ itens: itensMesa, total: totalMesa, alterado: true });
    }
    setAlterouPedidoMesa(false);
  }

  async function imprimirComandaManual() {
    if (itensMesa.length === 0) {
      mostrarNotificacao("Não há itens na comanda da mesa para imprimir.");
      return;
    }

    const chave = `comanda-manual-${pedidoMesaId}-${totalItensMesa}`;
    if (jaImprimiu(chave)) {
      mostrarNotificacao("Essa comanda já foi impressa nesta sessão.");
      return;
    }

    await imprimirComandaAgora(itensMesa, totalMesa);
    marcarComoImpresso(chave);
  }

  const [comComprovante, setComComprovante] = useState(true);

  function abrirModalEncerrar() {
    setEtapaEncerrar("opcoes");
    setPartesEncerrar({});
    setMostrarModalEncerrarMesa(true);
  }

  // Com ou sem comprovante, a forma de pagamento é sempre perguntada: o Caixa e as Finanças precisam
  // saber o que entrou em dinheiro, Pix ou cartão.
  function escolherEmitirComprovante() {
    setComComprovante(true);
    setEtapaEncerrar("pagamento");
  }

  function confirmarEncerrarSemComprovante() {
    setComComprovante(false);
    setEtapaEncerrar("pagamento");
  }

  // O que ainda vai ser pago ao encerrar (sem as partes já recebidas na conta parcial).
  const valorAPagarEncerrar = pagamentosMesa.length ? faltaDaConta(totalMesa, pagamentosMesa) : totalGeralMesa;

  async function confirmarEncerrarComComprovante() {
    let partes = [];
    let troco = 0;
    if (valorAPagarEncerrar > 0) {
      const r = resolverPartes(valorAPagarEncerrar, partesEncerrar, taxas);
      if (!r.ok) {
        mostrarNotificacao(r.erro);
        return;
      }
      partes = r.lista;
      troco = r.troco;
    }

    await encerrarMesa({
      emitirComprovante: comComprovante,
      partes,
      troco,
    });
  }

  async function encerrarMesa({ emitirComprovante, partes = [], troco = 0 }) {
    setEncerrando(true);
    setMostrarModalEncerrarMesa(false);

    try {
      const pedidosRef = collection(db, ...L(), "pedidos");

      const consultaMesa = query(
        pedidosRef,
        where("tipo", "==", "mesa"),
        where("mesa", "==", Number(id))
      );

      const resultado = await getDocs(consultaMesa);

      // Taxa da maquininha repassada ao cliente (só débito/crédito com "passar para o cliente").
      const totalTodos = resultado.docs.reduce((s, d) => s + (d.data().itens || []).reduce((t, i) => t + Number(i.preco || 0) * Number(i.qtd || i.quantidade || 0), 0), 0);
      // Partes já pagas (conta parcial): cobra só o que falta, na forma escolhida agora.
      const parciais = pagamentosMesa;
      const restante = faltaDaConta(totalTodos, parciais);
      // O que falta, pago agora em uma ou mais formas (cada forma com a sua taxa de cartão).
      const agora = ajustarPartes(partes, restante).map((p) => {
        const ct = totalNoCartao(p.valor, taxas, p.forma);
        return { valor: p.valor, forma: p.forma, ...(ct.taxa ? { taxaCartao: ct.taxa, taxaCartaoPct: ct.taxaPct } : {}) };
      });
      // Uma forma só e nada pago antes: grava como sempre (formaPagamento); senão, a lista de partes.
      const formaUnica = !parciais.length && agora.length <= 1;
      const formaPagamento = formaUnica ? agora[0]?.forma || "" : "";
      const cartao = formaUnica && agora[0]?.taxaCartao ? { taxa: agora[0].taxaCartao, taxaPct: agora[0].taxaCartaoPct } : { taxa: 0, taxaPct: 0 };
      const pagamentosFinal = formaUnica
        ? null
        : [...parciais.map(({ valor, forma, taxaCartao, taxaCartaoPct, quem }) => ({ valor, forma, ...(taxaCartao ? { taxaCartao, taxaCartaoPct } : {}), ...(quem ? { quem } : {}) })), ...agora];
      const formasUsadas = pagamentosFinal ? [...new Set(pagamentosFinal.map((x) => x.forma))] : [];
      const formaDaVenda = pagamentosFinal ? (formasUsadas.length === 1 ? formasUsadas[0] : "Dividido") : formaPagamento;
      const taxaTotal = pagamentosFinal ? Math.round(pagamentosFinal.reduce((t, x) => t + Number(x.taxaCartao || 0), 0) * 100) / 100 : cartao.taxa;
      let taxaPendente = taxaTotal;
      let primeiro = true;

      // Emite o comprovante do cliente ANTES de apagar os pedidos abertos,
      // já que os documentos de "pedidos" são a fonte dos itens/total.
      if (emitirComprovante) {
        const todosItens = resultado.docs.flatMap(
          (documento) => documento.data().itens || []
        );

        const totalComprovante = todosItens.reduce(
          (soma, item) =>
            soma + Number(item.preco || 0) * Number(item.qtd || item.quantidade || 0),
          0
        );

        const html = gerarComprovanteHTML({
          mesa: id,
          cliente: nomeCliente,
          itens: todosItens,
          total: totalComprovante,
          formaPagamento: (pagamentosFinal ? textoPagamentos(pagamentosFinal) : formaPagamento) + (troco > 0 ? ` · Troco R$ ${formatarMoeda(troco)}` : ""),
          config: configImpressora,
          taxaCartao: taxaTotal,
          taxaPct: pagamentosFinal ? 0 : cartao.taxaPct,
        });

        if (configImpressora.habilitada) {
          await imprimir(html, configImpressora.larguraPapel);
        }
      }

      registrar({
        area: "dinheiro",
        acao: "Encerrou a mesa",
        mesa: id,
        texto: `Mesa ${id}${nomeCliente ? ` (${nomeCliente})` : ""}: R$ ${formatarMoeda(totalTodos)} · ${pagamentosFinal ? textoPagamentos(pagamentosFinal) : formaPagamento || "sem forma"}${troco > 0 ? ` · troco R$ ${formatarMoeda(troco)}` : ""}${taxaTotal ? ` · taxa do cartão R$ ${formatarMoeda(taxaTotal)}` : ""}`,
        valor: totalTodos,
        detalhes: resultado.docs.flatMap((d) => (d.data().itens || []).map((i) => `${textoDoItem(i)} · R$ ${formatarMoeda(Number(i.preco || 0) * Number(i.qtd || i.quantidade || 0))}${i.cliente && i.cliente !== "Cliente" ? ` · ${i.cliente}` : ""}`)),
      });
      // Controle da mesa no histórico: quem estava, quando abriu e fechou, quantos pedidos fez.
      const agoraIso = new Date().toISOString();
      const aberturas = resultado.docs.map((d) => d.data().salvoEm).filter(Boolean).sort();
      const sessaoMesa = {
        sessaoMesa: `${id}-${Date.now()}`,
        // Nome da mesa (garçom) ou, se não tiver, os nomes que os clientes deram no QR Code.
        cliente:
          nomeCliente ||
          [...new Set(resultado.docs.flatMap((d) => (d.data().itens || []).map((i) => String(i.cliente || "").trim())).filter((n) => n && n !== "Cliente"))].join(", "),
        abertaEm: aberturas[0] || agoraIso,
        fechadaEm: agoraIso,
        pedidosNaMesa: resultado.docs.reduce((s, d) => s + Number(d.data().lancamentos || 1), 0),
      };

      for (const documento of resultado.docs) {
        const pedidoDados = documento.data();
        // A taxa do cartão vai inteira no primeiro registro da mesa (fora do total dos itens).
        const taxaDoc = taxaPendente;
        taxaPendente = 0;
        // Conta paga em partes: o 1º registro guarda todas as partes; os outros ficam "Dividido" (não contam de novo).
        const ehPrimeiro = primeiro;
        primeiro = false;
        const pagamentoDoc = pagamentosFinal
          ? { formaPagamento: ehPrimeiro ? formaDaVenda : "Dividido", ...(ehPrimeiro ? { pagamentos: pagamentosFinal } : {}), ...(taxaDoc ? { taxaCartao: taxaDoc } : {}) }
          : { formaPagamento: formaPagamento || "", ...(taxaDoc ? { taxaCartao: taxaDoc, taxaCartaoPct: cartao.taxaPct } : {}) };

        await addDoc(collection(db, ...L(), "vendasDia"), {
          origem: "mesa",
          mesa: Number(id), // ✅ CORREÇÃO BUG 3: sempre Number
          titulo: pedidoDados.titulo || `Mesa ${id}`,
          itens: pedidoDados.itens || [],
          total: pedidoDados.total || 0,
          totalItens: pedidoDados.totalItens || 0,
          ...pagamentoDoc,
          comprovanteEmitido: Boolean(emitirComprovante),
          ...sessaoMesa,
          finalizadoEm: new Date().toISOString(),
          criadoEm: serverTimestamp(),
        });

        await addDoc(collection(db, ...L(), "historicoMesas"), {
          origem: "mesa",
          mesa: Number(id), // ✅ CORREÇÃO BUG 3: sempre Number
          titulo: pedidoDados.titulo || `Mesa ${id}`,
          itens: pedidoDados.itens || [],
          total: pedidoDados.total || 0,
          totalItens: pedidoDados.totalItens || 0,
          ...pagamentoDoc,
          comprovanteEmitido: Boolean(emitirComprovante),
          ...sessaoMesa,
          finalizadoEm: new Date().toISOString(),
          pedidoOriginalId: documento.id,
          status: "finalizada",
          criadoEm: serverTimestamp(),
        });

        await deleteDoc(doc(db, ...L(), "pedidos", documento.id));
      }
      // Matéria-prima: desconta o que a ficha técnica de cada produto usa (não trava o fechamento).
      baixarInsumos(resultado.docs.flatMap((d) => d.data().itens || []));

      await setDoc(
        doc(db, ...L(), "mesas", String(id)),
        {
          numero: Number(id),
          cliente: "",
          pagamentos: [],
        },
        { merge: true }
      );

      navigate("/mesas");
    } catch (erro) {
      console.error("Erro ao encerrar mesa:", erro);
      mostrarNotificacao("Erro ao encerrar a mesa.");
      setEncerrando(false);
    }
  }

  return (
    <div className="mesa-page md-pagina">
      {notificacao && <div className="toast">{notificacao}</div>}

      {editandoNomeCliente && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-icon">✏️</div>

            <h2>Nome do cliente</h2>

            <p>Identifique quem está usando a Mesa {id}.</p>

            <input
              className="input-cliente-mesa"
              type="text"
              placeholder="Ex: Allan"
              value={nomeClienteInput}
              onChange={(e) => setNomeClienteInput(e.target.value)}
              autoFocus
            />

            <div className="modal-acoes">
              <button
                type="button"
                className="modal-btn cancelar"
                onClick={() => {
                  setEditandoNomeCliente(false);
                  setNomeClienteInput(nomeCliente);
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="modal-btn confirmar"
                onClick={salvarNomeCliente}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalEncerrarMesa && etapaEncerrar === "opcoes" && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-icon">🍽️</div>

            <h2>Encerrar Mesa {id}?</h2>

            <p className="modal-total-encerrar">
              Total: <strong>R$ {formatarMoeda(totalGeralMesa)}</strong>
            </p>

            {(totalNoCartao(totalGeralMesa, taxas, "Débito").taxa > 0 || totalNoCartao(totalGeralMesa, taxas, "Crédito").taxa > 0) && (
              <p className="modal-cartao">
                No cartão: débito <strong>R$ {formatarMoeda(totalNoCartao(totalGeralMesa, taxas, "Débito").total)}</strong> · crédito{" "}
                <strong>R$ {formatarMoeda(totalNoCartao(totalGeralMesa, taxas, "Crédito").total)}</strong>
              </p>
            )}

            <p className="modal-aviso">
              O nome do cliente também será removido da mesa.
            </p>

            <div className="modal-acoes coluna">
              <button
                type="button"
                className="modal-btn confirmar"
                onClick={escolherEmitirComprovante}
                disabled={encerrando}
              >
                🖨️ Emitir comprovante
              </button>

              <button
                type="button"
                className="modal-btn secundario"
                onClick={confirmarEncerrarSemComprovante}
                disabled={encerrando}
              >
                Encerrar sem comprovante
              </button>

              <button
                type="button"
                className="modal-btn cancelar"
                onClick={() => setMostrarModalEncerrarMesa(false)}
                disabled={encerrando}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalEncerrarMesa && etapaEncerrar === "pagamento" && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-icon">💳</div>

            <h2>Forma de pagamento</h2>

            <p className="modal-total-encerrar">
              Total: <strong>R$ {formatarMoeda(totalGeralMesa)}</strong>
            </p>
            {pagamentosMesa.length > 0 && (
              <p className="modal-total-encerrar">
                Já pago: <strong>R$ {formatarMoeda(totalPagoMesa(pagamentosMesa))}</strong> ({textoPagamentos(pagamentosMesa)})
                <br />
                {faltaDaConta(totalMesa, pagamentosMesa) > 0 ? (
                  <>Falta: <strong>R$ {formatarMoeda(faltaDaConta(totalMesa, pagamentosMesa))}</strong>: escolha como vai pagar o que falta (pode ser mais de uma forma).</>
                ) : (
                  <strong>Tudo já foi pago.</strong>
                )}
              </p>
            )}

            {valorAPagarEncerrar > 0 && (
              <FormasPagamento valor={valorAPagarEncerrar} partes={partesEncerrar} onChange={setPartesEncerrar} taxas={taxas} />
            )}

            <div className="modal-acoes">
              <button
                type="button"
                className="modal-btn cancelar"
                onClick={() => setEtapaEncerrar("opcoes")}
                disabled={encerrando}
              >
                Voltar
              </button>

              <button
                type="button"
                className="modal-btn confirmar"
                onClick={confirmarEncerrarComComprovante}
                disabled={encerrando}
              >
                {encerrando ? "Encerrando..." : comComprovante ? "Imprimir e encerrar" : "Confirmar e encerrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarPedidoMesa && pedidoMesa && (
        <div className="modal-overlay" onClick={fecharPedidoMesa}>
          <div className="pm-folha" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Pedido da mesa ${id}`}>
            <div className="pm-topo">
              <div>
                <span>Comanda</span>
                <h2>
                  Mesa {id}
                  {nomeCliente ? ` · ${nomeCliente}` : ""}
                </h2>
              </div>
              <button type="button" className="pm-fechar" onClick={fecharPedidoMesa} aria-label="Fechar" data-fechar>✕</button>
            </div>
            <div className="pm-lista">
              {itensMesa.map((item) => (
                <div className="pm-linha" key={item.nome}>
                  <div className="pm-info">
                    <strong>{partesItem(item).nome}</strong>
                    {partesItem(item).detalhes.length > 0 && (
                      <span className="pm-det">
                        {partesItem(item).detalhes.map((d, i) => <span key={i}>{d}</span>)}
                      </span>
                    )}
                    <span className="pm-cada">R$ {formatarMoeda(item.preco)} cada</span>
                    {produtoPorId(item.produtoId) && abreEscolha(produtoPorId(item.produtoId), montarLigado) && (
                      <button type="button" className="pm-editar" onClick={() => editarSalvo(item)}>
                        Editar
                      </button>
                    )}
                  </div>
                  <div className="pm-lado">
                    <b>R$ {formatarMoeda(Number(item.preco || 0) * Number(item.qtd || 0))}</b>
                    <div className="pm-qtd">
                      <button type="button" onClick={() => diminuirItemMesa(item)} aria-label={Number(item.qtd) === 1 ? `Tirar ${item.nome}` : `Menos 1 ${item.nome}`}>
                        {Number(item.qtd) === 1 ? "🗑️" : "−"}
                      </button>
                      <span>{item.qtd}</span>
                      <button type="button" onClick={() => aumentarItemMesa(item)} aria-label={`Mais 1 ${item.nome}`}>+</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pm-total">
              <span>Total da mesa</span>
              <strong>R$ {formatarMoeda(totalMesa)}</strong>
            </div>

            <button type="button" className="pm-ok" onClick={fecharPedidoMesa}>
              Pronto
            </button>
          </div>
        </div>
      )}

      {pedirMotivo && (
        <div className="modal-overlay" onClick={() => setPedirMotivo(null)}>
          <div className="modal-card motivo-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tirar da comanda">
            <div className="motivo-topo">
              <h2>Tirar da comanda</h2>
              <button type="button" className="motivo-x" data-fechar onClick={() => setPedirMotivo(null)} aria-label="Fechar">×</button>
            </div>
            <div className="motivo-item">
              <div className="motivo-item-l1">
                <strong>1x {pedirMotivo.nome}</strong>
                <strong>R$ {formatarMoeda(pedirMotivo.preco)}</strong>
              </div>
              {pedirMotivo.detalhes.length > 0 && (
                <div className="motivo-item-det">
                  {pedirMotivo.detalhes.map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="motivo-lab">Motivo</div>
            <div className="motivo-ops">
              {MOTIVOS_PEDIDO.map((m) => (
                <button type="button" key={m} className={motivoEscolhido === m ? "on" : ""} onClick={() => { setMotivoEscolhido(m); setMotivoOutro(""); }}>
                  {m}
                </button>
              ))}
            </div>
            <input className="motivo-outro-campo" placeholder="Outro motivo" value={motivoOutro} maxLength={100} onChange={(e) => { setMotivoOutro(e.target.value); setMotivoEscolhido(""); }} />
            <div className="motivo-botoes">
              <button type="button" className="modal-btn cancelar" onClick={() => setPedirMotivo(null)}>Cancelar</button>
              <button
                type="button"
                className="motivo-tirar"
                disabled={!(motivoEscolhido || motivoOutro.trim())}
                onClick={async () => {
                  const f = pedirMotivo.fazer;
                  const motivo = motivoEscolhido || motivoOutro.trim();
                  setPedirMotivo(null);
                  await f(motivo);
                }}
              >
                Tirar item
              </button>
            </div>
          </div>
        </div>
      )}

      {paraImprimir && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-icon">🖨️</div>
            <h2>{paraImprimir.alterado ? "Pedido alterado" : "Pedido salvo"}</h2>
            <p>
              {paraImprimir.alterado
                ? "Imprimir a comanda completa da mesa para a cozinha?"
                : `Imprimir ${paraImprimir.itens.reduce((s, i) => s + Number(i.qtd || 0), 0)} item(ns) na cozinha?`}
            </p>
            <div className="modal-acoes">
              <button
                type="button"
                className="modal-btn cancelar"
                onClick={() => {
                  const voltar = paraImprimir?.voltar;
                  setParaImprimir(null);
                  if (voltar) voltarAoPainel();
                }}
              >
                Agora não
              </button>
              <button type="button" className="modal-btn confirmar" onClick={confirmarImpressaoCozinha} data-atalho="F1">
                Imprimir na cozinha
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="md-topo">
        <button type="button" className="md-voltar" onClick={() => navigate("/")} aria-label="Voltar">←</button>
        <div className="md-mesa">
          <small>Comanda</small>
          <h1>
            Mesa {id}
            <button type="button" className="md-nome" onClick={() => setEditandoNomeCliente(true)} aria-label="Nome do cliente">
              {nomeCliente || "Nome"}
            </button>
          </h1>
        </div>
        <div className="md-total">
          <small>Total</small>
          <strong>R$ {formatarMoeda(totalGeralMesa)}</strong>
        </div>
      </div>

      {totalItensMesa > 0 && (
        <button type="button" className="btn-imprimir-comanda" onClick={() => setContaParcial(true)}>
          Conta parcial{pagamentosMesa.length ? ` · falta R$ ${formatarMoeda(faltaDaConta(totalMesa, pagamentosMesa))}` : ""}
        </button>
      )}

      {configImpressora.habilitada && totalItensMesa > 0 && (
        <button className="btn-imprimir-comanda" onClick={imprimirComandaManual} data-atalho="F1">
          Imprimir comanda
        </button>
      )}

      {contaParcial && (
        <ContaParcial
          mesa={id}
          itens={itensMesa}
          itensPorPessoa={itensBrutosMesa}
          total={totalMesa}
          naoSalvo={total}
          pagamentos={pagamentosMesa}
          taxas={taxas}
          podeImprimir={configImpressora.habilitada}
          onFechar={() => setContaParcial(false)}
          onImprimir={async () => {
            const abriu = await imprimirComandaAgora(itensMesa, totalMesa, `CONTA PARCIAL (a mesa continua aberta)${pagamentosMesa.length ? ` · Já pago R$ ${formatarMoeda(totalPagoMesa(pagamentosMesa))} · Falta R$ ${formatarMoeda(faltaDaConta(totalMesa, pagamentosMesa))}` : ""}`);
            if (!abriu) mostrarNotificacao("O celular bloqueou a janela de impressão. Libere as janelas (pop-ups) do site e tente de novo.");
          }}
          onReceber={async (partes, troco) => {
            // Uma pessoa pode pagar em mais de uma forma: cada forma vira um pagamento (todos gravados juntos).
            const agora = new Date().toISOString();
            const novos = partes.map((p, k) => ({ id: `p${Date.now()}${k}`, ...p, em: agora, por: auth.currentUser?.email || "" }));
            await setDoc(doc(db, ...L(), "mesas", String(id)), { numero: Number(id), pagamentos: [...pagamentosMesa, ...novos] }, { merge: true });
            mostrarNotificacao(`Recebido: ${textoPagamentos(partes)}${troco > 0 ? ` · Troco R$ ${formatarMoeda(troco)}` : ""}.`);
            registrar({ area: "dinheiro", acao: "Recebeu parte da conta", mesa: id, texto: `Mesa ${id}: ${textoPagamentos(partes)}${troco > 0 ? ` · troco R$ ${formatarMoeda(troco)}` : ""}`, valor: partes.reduce((t, x) => t + Number(x.valor || 0), 0) });
          }}
          onTirar={async (p) => {
            await setDoc(doc(db, ...L(), "mesas", String(id)), { pagamentos: pagamentosMesa.filter((x) => x.id !== p.id) }, { merge: true });
            mostrarNotificacao("Pagamento desfeito.");
            registrar({ area: "dinheiro", acao: "Desfez pagamento", mesa: id, texto: `Mesa ${id}: ${textoPagamentos([p])}`, valor: -Number(p.valor || 0) });
          }}
        />
      )}

      {pedidoMesa && totalItensMesa > 0 && (
        <button type="button" className="pm-resumo" onClick={() => setMostrarPedidoMesa(true)}>
          <span className="pm-resumo-icone" aria-hidden="true">🧾</span>
          <span className="pm-resumo-texto">
            <small>Já na comanda</small>
            <strong>
              {totalItensMesa} {totalItensMesa === 1 ? "item" : "itens"} · R$ {formatarMoeda(totalMesa)}
            </strong>
          </span>
          <span className="pm-resumo-ver">Ver pedido ›</span>
        </button>
      )}

      {itensPedido.length > 0 && (
        <div className="resumo-pedido">
          <h3>Pedido atual</h3>

          {itensPedido.map((item) => (
            <div className="resumo-linha" key={item.nome}>
              <span className="resumo-ajuste">
                <button type="button" onClick={() => ajustarItemPedido(item.nome, -1)} aria-label={`Tirar 1 ${item.nome}`}>−</button>
                <b>{item.qtd}</b>
                <button type="button" onClick={() => ajustarItemPedido(item.nome, 1)} aria-label={`Mais 1 ${item.nome}`}>+</button>
              </span>
              <span className="resumo-nome">
                {item.nome}
                {item.montagem && produtoPorId(item.produtoId) && (
                  <button type="button" className="resumo-editar" onClick={() => editarLinha(item)}>
                    Editar
                  </button>
                )}
              </span>
              <strong>R$ {formatarMoeda(item.preco * item.qtd)}</strong>
            </div>
          ))}
        </div>
      )}

      {montando && (
        <MontarPrato
          key={editandoSalvo ? `s:${editandoSalvo}` : editando || "novo"}
          produto={montando}
          foto={fotos[montando.id] || null}
          fotos={fotos}
          bebidas={editando || editandoSalvo ? [] : sugestoesBebida(produtos)}
          permitirOutros
          inicial={editandoSalvo ? itensMesa.find((i) => i.nome === editandoSalvo)?.montagem || null : editando ? pedido[editando]?.montagem : null}
          textoBotao={editando || editandoSalvo ? "Salvar alteração" : "Adicionar"}
          onAdicionar={adicionarMontado}
          onFechar={() => { setMontando(null); setEditando(null); if (editandoSalvo) { setEditandoSalvo(null); setMostrarPedidoMesa(true); } }}
        />
      )}

      {perguntar && (
        <PratoNoPedido
          produto={perguntar}
          linhas={linhasDoProduto(perguntar.id)}
          onEditar={editarLinha}
          onMaisUm={() => { setEditando(null); setMontando(perguntar); setPerguntar(null); }}
          onFechar={() => setPerguntar(null)}
          noPedido="neste pedido"
        />
      )}

      {!organizarAberto && (
        <>
          <div className="titulo-secao-linha">
            <h2 className="titulo-secao">Adicionar pedido</h2>
            {produtos.length > 0 && (
              <button type="button" className="btn-organizar-categorias" onClick={() => setOrganizarAberto(true)}>
                ↕ Organizar
              </button>
            )}
          </div>
          {produtos.length === 0 ? (
            <div className="card-principal">
              <h2>Nenhum produto para hoje</h2>
              <p>Cadastre em Produtos ou ligue os pratos em Cardápio de hoje.</p>
            </div>
          ) : (
            <PedidoRapido
              categorias={produtos}
              emoji={emojiCategoria}
              montar={montarLigado}
              contagem={(item) => itensPedido.filter((p) => p.produtoId === item.id).reduce((s, p) => s + p.qtd, 0)}
              onTocar={tocarItem}
              fotos={fotos}
            />
          )}
        </>
      )}

      {organizarAberto && (<>
      <div className="titulo-secao-linha">
        <h2 className="titulo-secao">Organizar o cardápio</h2>
        <button type="button" className="btn-organizar-categorias ativo" onClick={() => { setOrganizarAberto(false); setOrganizandoCategorias(false); setCategoriaOrganizando(""); }}>
          ✓ Voltar ao pedido
        </button>
      </div>
      <div className="titulo-secao-linha">
        <span />

        {produtos.length > 1 && (
          <button
            type="button"
            className={`btn-organizar-categorias ${
              organizandoCategorias ? "ativo" : ""
            }`}
            onClick={() => setOrganizandoCategorias((v) => !v)}
          >
            {organizandoCategorias ? "✓ Concluir" : "↕ Organizar categorias"}
          </button>
        )}
      </div>

      {produtos.length === 0 ? (
        <div className="card-principal">
          <h2>Nenhum produto cadastrado</h2>
          <p>Importe o cardápio na tela Produtos.</p>
        </div>
      ) : (
        produtos.map((categoria, indiceCategoria) => {
          const aberta = categoriaAberta === categoria.categoria;
          const organizando = categoriaOrganizando === categoria.categoria;

          return (
            <section className="categoria-bloco" key={categoria.categoria}>
              <div
                className="categoria-header"
                onClick={() => {
                  if (!organizandoCategorias) {
                    alternarCategoria(categoria.categoria);
                  }
                }}
              >
                {organizandoCategorias && (
                  <div
                    className="categoria-reordenar"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={indiceCategoria === 0}
                      onClick={() => moverCategoria(indiceCategoria, -1)}
                      title="Mover categoria para cima"
                    >
                      ▲
                    </button>

                    <button
                      type="button"
                      disabled={indiceCategoria === produtos.length - 1}
                      onClick={() => moverCategoria(indiceCategoria, 1)}
                      title="Mover categoria para baixo"
                    >
                      ▼
                    </button>
                  </div>
                )}
                <h3>{categoria.categoria}</h3>

                <div className="categoria-header-acoes">
                  {aberta && !organizandoCategorias && (
                    <button
                      type="button"
                      className={`btn-organizar-categoria ${
                        organizando ? "ativo" : ""
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCategoriaOrganizando((atual) =>
                          atual === categoria.categoria ? "" : categoria.categoria
                        );
                      }}
                    >
                      {organizando ? "✓ Concluir" : "↕ Organizar"}
                    </button>
                  )}

                  {!organizandoCategorias && <span>{aberta ? "▲" : "▼"}</span>}
                </div>
              </div>

              {aberta && !organizandoCategorias && (
                <div className="produtos-grid">
                  {categoria.itens.map((item, indice) => {
                    const quantidade = pedido[item.nome]?.qtd || 0;

                    return (
                      <div
                        className={`produto-card ${
                          organizando ? "produto-card-organizando" : ""
                        }`}
                        key={item.id}
                      >
                        <div className="produto-info">
                          <strong>{item.nome}</strong>
                          <span>R$ {formatarMoeda(item.preco)}</span>
                        </div>

                        {organizando ? (
                          <div className="produto-reordenar">
                            <button
                              type="button"
                              disabled={indice === 0}
                              onClick={() =>
                                moverItemCategoria(db, categoria.itens, indice, -1)
                              }
                              title="Mover para cima"
                            >
                              ▲
                            </button>

                            <button
                              type="button"
                              disabled={indice === categoria.itens.length - 1}
                              onClick={() =>
                                moverItemCategoria(db, categoria.itens, indice, 1)
                              }
                              title="Mover para baixo"
                            >
                              ▼
                            </button>
                          </div>
                        ) : (
                          <div className="contador">
                            <button onClick={() => removerItem(item)}>-</button>
                            <span>{quantidade}</span>
                            <button onClick={() => adicionarItem(item)}>+</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })
      )}
      </>)}

      {/* Barra presa embaixo (celular): encerrar e salvar, sempre à mão. No computador fica na comanda ao lado. */}
      <div className="md-barra">
        <button type="button" className="md-btn" onClick={abrirModalEncerrar} disabled={encerrando} data-atalho="F9">
          {encerrando ? "Encerrando…" : "Encerrar"}
        </button>
        <button type="button" className="md-btn verde" onClick={salvarPedido} disabled={!totalItens} data-atalho="F8">
          {totalItens > 0 && <i>{totalItens}</i>}
          <span>Salvar pedido</span>
          {totalItens > 0 && <b>R$ {formatarMoeda(total)}</b>}
        </button>
      </div>

      {/* Computador: a comanda fica aberta ao lado dos produtos. */}
      <aside className="md-comanda" aria-label={`Comanda da mesa ${id}`}>
        <div className="md-com-topo">
          <small>Comanda</small>
          <h2>
            Mesa {id}
            {nomeCliente ? <span className="md-com-nome">{nomeCliente}</span> : null}
          </h2>
        </div>
        <div className="md-com-lista">
          {itensPedido.length > 0 && <p className="md-com-grupo">Agora (falta salvar)</p>}
          {itensPedido.map((item) => (
            <div className="md-com-item" key={`n:${item.nome}`}>
              {fotos[item.produtoId] ? <img src={fotos[item.produtoId]} alt="" /> : <span className="md-com-sem" aria-hidden="true">🍽️</span>}
              <span className="md-com-txt">
                <span className="md-com-nome">{item.qtd}× {partesItem(item).nome}</span>
                {partesItem(item).detalhes.map((d, i) => <span key={i} className="md-com-det">{d}</span>)}
                {item.montagem && produtoPorId(item.produtoId) && (
                  <button type="button" className="md-com-link" onClick={() => editarLinha(item)}>Editar</button>
                )}
              </span>
              <span className="md-com-qtd">
                <button type="button" onClick={() => ajustarItemPedido(item.nome, -1)} aria-label={`Tirar 1 ${item.nome}`}>−</button>
                <button type="button" onClick={() => ajustarItemPedido(item.nome, 1)} aria-label={`Mais 1 ${item.nome}`}>+</button>
              </span>
              <b>{formatarMoeda(item.preco * item.qtd)}</b>
            </div>
          ))}
          {itensMesa.length > 0 && <p className="md-com-grupo">Já na comanda</p>}
          {itensMesa.map((item) => (
            <div className="md-com-item" key={`m:${item.nome}`}>
              {fotos[item.produtoId] ? <img src={fotos[item.produtoId]} alt="" /> : <span className="md-com-sem" aria-hidden="true">🧾</span>}
              <span className="md-com-txt">
                <span className="md-com-nome">{item.qtd}× {partesItem(item).nome}</span>
                {partesItem(item).detalhes.map((d, i) => <span key={i} className="md-com-det">{d}</span>)}
              </span>
              <span className="md-com-qtd">
                <button type="button" onClick={() => diminuirItemMesa(item)} aria-label={Number(item.qtd) === 1 ? `Tirar ${item.nome}` : `Menos 1 ${item.nome}`}>{Number(item.qtd) === 1 ? "🗑" : "−"}</button>
                <button type="button" onClick={() => aumentarItemMesa(item)} aria-label={`Mais 1 ${item.nome}`}>+</button>
              </span>
              <b>{formatarMoeda(Number(item.preco || 0) * Number(item.qtd || 0))}</b>
            </div>
          ))}
          {!itensPedido.length && !itensMesa.length && <p className="md-com-vazio">Sem itens.</p>}
        </div>
        <div className="md-com-pe">
          {itensMesa.length > 0 && <p className="md-com-linha"><span>Já na comanda</span><span>R$ {formatarMoeda(totalMesa)}</span></p>}
          {itensPedido.length > 0 && <p className="md-com-linha"><span>Agora</span><span>R$ {formatarMoeda(total)}</span></p>}
          <p className="md-com-linha md-com-total"><span>Total</span><strong>R$ {formatarMoeda(totalGeralMesa)}</strong></p>
          <div className="md-com-botoes">
            <button type="button" className="md-btn" onClick={abrirModalEncerrar} disabled={encerrando}>{encerrando ? "Encerrando…" : "Encerrar mesa"}</button>
            <button type="button" className="md-btn verde" onClick={salvarPedido} disabled={!totalItens}>
              {totalItens > 0 && <i>{totalItens}</i>}
              <span>Salvar pedido</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default MesaDetalhe;