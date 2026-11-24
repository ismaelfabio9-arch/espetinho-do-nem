import { L, MULTI, getLoja } from "../../loja";
import { partesDoItem } from "../../utils/montagem";
import useNomeLoja from "../../hooks/useNomeLoja";
import { mesasApi } from "../../tenant";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../../firebase";
import { ordenarGruposPorCategoria } from "../../utils/categorias";
import { disponivelAgora, useMinuto } from "../../utils/horario";
import "../../styles/Cliente/CardapioMesa.css";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  onSnapshot,
  getDoc,
  setDoc,
} from "firebase/firestore";
import MontarPrato from "../../components/MontarPrato";
import PratoNoPedido from "../../components/PratoNoPedido";
import { sugestoesBebida, abreEscolha } from "../../utils/montagem";
import { BarraSacola, CardapioCliente, ClienteTopo, Folha, ItensSacola } from "../../components/cliente/Cliente";
import { useFotos } from "../../utils/fotos";
import { useRecurso } from "../../recursos";
import { repassaAlguma, useTaxas } from "../../utils/taxas";
import QuerMais, { sugestoesComplemento } from "../../components/QuerMais";
import { linkWhats, useWhatsLoja } from "../../utils/contato";

function CardapioMesa() {
  const nomeLoja = useNomeLoja();
  const { mesa } = useParams();

  const [pedidoMesaAberto, setPedidoMesaAberto] = useState(null);
  const [carrinho, setCarrinho] = useState({});
  // Prato de almoço aberto na janela "Montar o prato".
  const [montando, setMontando] = useState(null);
  // Prato que já está no pedido: pergunta se edita (esqueceu o feijão) ou acrescenta mais um.
  const [perguntar, setPerguntar] = useState(null);
  const [editando, setEditando] = useState(null); // chave da linha do pedido que está sendo editada
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const [nomeCliente, setNomeCliente] = useState("");
  const [nomeDigitado, setNomeDigitado] = useState("");
  const [mostrarModalNome, setMostrarModalNome] = useState(false);

  const [mostrarModalPagamento, setMostrarModalPagamento] = useState(false);
  // Sacola (o que vai ser pedido agora) e a conta da mesa (o que já foi pedido), em janelas que sobem de baixo.
  const [sacolaAberta, setSacolaAberta] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState("");
  const [produtos, setProdutos] = useState([]);
  // Funções que a IFTech pode desligar só nesta loja (Central da Loja).
  const pedidoLigado = useRecurso("qr-pedido");
  const garcomLigado = useRecurso("chamar-garcom");
  const contaLigada = useRecurso("pedir-conta");
  const montarLigado = useRecurso("montar-prato");
  // Fotos dos produtos (planos Completo e Premium).
  const fotos = useFotos(useRecurso("fotos"));
  const whatsLoja = useWhatsLoja();
  // "Vai querer mais alguma coisa?": oferecido uma vez em cada pedido, antes de enviar.
  const [querMais, setQuerMais] = useState(null); // sugestões guardadas ao abrir (o que o cliente toca não some)
  const [ofereceu, setOfereceu] = useState(false);
  // Aviso da taxa da maquininha repassada ao cliente (Configurações → Taxas da maquininha).
  const taxas = useTaxas();
  const estoqueLigado = useRecurso("estoque");
  const [estoque, setEstoque] = useState({});
  const [categoriasDocs, setCategoriasDocs] = useState([]);
  const minuto = useMinuto();

  function formatarMoeda(valor) {
    return Number(valor || 0).toFixed(2).replace(".", ",");
  }

  function emojiCategoria(categoria) {
    if (categoria.includes("Pratos")) return "🍛";
    if (categoria.includes("Prato feito") || categoria.includes("PF")) return "🍽️";
    if (categoria.includes("Acompanhamentos")) return "🍚";
    if (categoria.includes("Sucos")) return "🧃";
    if (categoria.includes("Sobremesas")) return "🍮";
    if (categoria.includes("Espetinhos")) return "🍢";
    if (categoria.includes("Caldinhos")) return "🥣";
    if (categoria.includes("Refrigerantes")) return "🥤";
    if (categoria.includes("Cervejas")) return "🍺";
    if (categoria.includes("Quartinho")) return "🥃";
    if (categoria.includes("Dose")) return "🥃";
    return "🍽️";
  }

  useEffect(() => {
    const cancelarCategorias = onSnapshot(collection(db, ...L(), "categorias"), (snapshot) => {
      setCategoriasDocs(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const cancelarEstoque = onSnapshot(collection(db, ...L(), "estoque"), (snapshot) => {
      const dados = {};

      snapshot.docs.forEach((documento) => {
        dados[documento.id] = documento.data();
      });

      setEstoque(dados);
    });

    return () => {
      cancelarCategorias();
      cancelarEstoque();
    };
  }, []);

  useEffect(() => {
    const cancelarProdutos = onSnapshot(collection(db, ...L(), "produtos"), (snapshot) => {
      const lista = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      // Fora do cardápio de hoje também não aparece para o cliente.
      const produtosAtivos = lista.filter((produto) => disponivelAgora(produto, categoriasDocs));

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
          montagem: produto.montagem || null,
          tipo: produto.tipo || null,
          ordem: produto.ordem,
        });

        return resultado;
      }, {});

      setProdutos(
        ordenarGruposPorCategoria(Object.values(grupos), categoriasDocs)
      );
    });

    return () => cancelarProdutos();
  }, [categoriasDocs, minuto]);

  useEffect(() => {
    const nomeSalvo = localStorage.getItem(`mesa_${mesa}_cliente`);

    if (nomeSalvo) {
      setNomeCliente(nomeSalvo);
      return;
    }

    setMostrarModalNome(true);
  }, [mesa]);

  useEffect(() => {
    const pedidosRef = collection(db, ...L(), "pedidos");

    const consulta = query(
      pedidosRef,
      where("tipo", "==", "mesa"),
      where("mesa", "==", Number(mesa)),
      where("status", "==", "aberto")
    );

    const cancelar = onSnapshot(consulta, (snapshot) => {
      if (snapshot.empty) {
        setPedidoMesaAberto(null);
        return;
      }

      const pedidos = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      const itens = pedidos.flatMap((pedido) => pedido.itens || []);

      const agrupados = itens.reduce((resultado, item) => {
        const clienteItem = item.cliente || "Cliente";
        const chave = `${item.nome}-${clienteItem}`;

        if (!resultado[chave]) {
          resultado[chave] = {
            nome: item.nome,
            cliente: clienteItem,
            preco: Number(item.preco || 0),
            qtd: 0,
          };
        }

        resultado[chave].qtd += Number(item.qtd || item.quantidade || 0);

        return resultado;
      }, {});

      const itensOrdenados = Object.values(agrupados).sort((a, b) => {
        const totalA = Number(a.preco || 0) * Number(a.qtd || 0);
        const totalB = Number(b.preco || 0) * Number(b.qtd || 0);

        if (totalA !== totalB) return totalA - totalB;

        return a.nome.localeCompare(b.nome);
      });

      setPedidoMesaAberto({
        itens: itensOrdenados,
        total: itensOrdenados.reduce(
          (soma, item) => soma + Number(item.preco || 0) * Number(item.qtd || 0),
          0
        ),
        totalItens: itensOrdenados.reduce(
          (soma, item) => soma + Number(item.qtd || 0),
          0
        ),
      });
    });

    return () => cancelar();
  }, [mesa]);

  function confirmarNomeCliente() {
    const nome = nomeDigitado.trim();

    if (!nome) {
      setMostrarModalNome(false);
      return;
    }

    localStorage.setItem(`mesa_${mesa}_cliente`, nome);
    setNomeCliente(nome);
    setMostrarModalNome(false);
  }

  /** Prato montado (e as bebidas escolhidas) entram no carrinho; cada montagem diferente é uma linha. */
  function adicionarMontado({ prato, bebidas, qtd = 1 }) {
    setCarrinho((anterior) => {
      const novo = { ...anterior };
      const chave = `m:${prato.nome}`;
      // Editando: a linha antiga sai e a nova fica com a mesma quantidade.
      const antiga = editando ? anterior[editando] : null;
      if (antiga) delete novo[editando];
      novo[chave] = { chave, produtoId: prato.produtoId, nome: prato.nome, preco: prato.preco, montagem: prato.montagem, quantidade: (novo[chave]?.quantidade || 0) + (antiga ? antiga.quantidade : qtd) };
      bebidas.forEach((b) => {
        novo[b.id] = { chave: b.id, produtoId: b.id, nome: b.nome, preco: b.preco, quantidade: (anterior[b.id]?.quantidade || 0) + 1 };
      });
      return novo;
    });
    setMontando(null);
    setEditando(null);
  }

  const linhasDoProduto = (id) => Object.values(carrinho).filter((l) => l.produtoId === id && l.montagem);
  const produtoPorId = (id) => produtos.flatMap((g) => g.itens || []).find((i) => i.id === id);

  function editarLinha(l) {
    const item = produtoPorId(l.produtoId);
    if (!item) return;
    setPerguntar(null);
    setEditando(l.chave);
    setMontando(item);
  }

  function ajustarLinha(chave, valor) {
    setCarrinho((anterior) => {
      const linha = anterior[chave];
      if (!linha) return anterior;
      const copia = { ...anterior };
      if (linha.quantidade + valor <= 0) delete copia[chave];
      else copia[chave] = { ...linha, quantidade: linha.quantidade + valor };
      return copia;
    });
  }

  function alterarQuantidade(item, valor) {
    // Prato com montagem: o + abre a janela; o − tira a última montagem desse prato.
    if (abreEscolha(item, montarLigado)) {
      if (valor > 0) {
        if (linhasDoProduto(item.id).length) return setPerguntar(item);
        setEditando(null);
        return setMontando(item);
      }
      const linhas = Object.values(carrinho).filter((l) => l.produtoId === item.id && l.montagem);
      if (linhas.length) ajustarLinha(linhas[linhas.length - 1].chave, -1);
      return;
    }
    setCarrinho((anterior) => {
      const quantidadeAtual = anterior[item.id]?.quantidade || 0;
      const novaQuantidade = quantidadeAtual + valor;

      if (novaQuantidade <= 0) {
        const copia = { ...anterior };
        delete copia[item.id];
        return copia;
      }

      return {
        ...anterior,
        [item.id]: {
          chave: item.id,
          produtoId: item.id,
          nome: item.nome,
          preco: item.preco,
          quantidade: novaQuantidade,
        },
      };
    });
  }

  const itensSelecionados = Object.values(carrinho).sort((a, b) => {
    const totalA = Number(a.preco || 0) * Number(a.quantidade || 0);
    const totalB = Number(b.preco || 0) * Number(b.quantidade || 0);

    if (totalA !== totalB) return totalA - totalB;

    return a.nome.localeCompare(b.nome);
  });

  const total = itensSelecionados.reduce(
    (soma, item) => soma + Number(item.preco || 0) * Number(item.quantidade || 0),
    0
  );

  const produtosDisponiveis = produtos;

  // Lojas da IFTech: só conta como esgotado o que tem estoque controlado (mínimo definido em Estoque);
  // prato de almoço sem controle de estoque nunca aparece esgotado.
  function esgotado(item) {
    if (!estoqueLigado) return false;
    const quantidadeEstoque = Number(estoque[item.id]?.quantidade || 0);
    return MULTI ? estoque[item.id]?.minimo !== undefined && quantidadeEstoque <= 0 : quantidadeEstoque <= 0;
  }


  async function baixarEstoque(itens) {
    for (const item of itens) {
      if (!item.produtoId) continue;

      const estoqueRef = doc(db, ...L(), "estoque", item.produtoId);
      const estoqueSnap = await getDoc(estoqueRef);

      if (!estoqueSnap.exists()) continue;

      const quantidadeAtual = Number(estoqueSnap.data().quantidade || 0);
      const quantidadePedida = Number(item.qtd || item.quantidade || 0);
      const novaQuantidade = Math.max(0, quantidadeAtual - quantidadePedida);

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

  const qtdNoPedido = (item) => Object.values(carrinho).filter((l) => l.produtoId === item.id).reduce((t, l) => t + l.quantidade, 0);
  function finalizarPedido() {
    const noPedido = new Set(Object.values(carrinho).map((l) => l.produtoId));
    const sugestoes = sugestoesComplemento(produtos, noPedido, esgotado, montarLigado);
    if (itensSelecionados.length && !ofereceu && sugestoes.length) return setQuerMais(sugestoes);
    fazerPedido();
  }

  async function fazerPedido() {
    if (itensSelecionados.length === 0) {
      setMensagem("Escolha pelo menos um produto.");
      return;
    }

    setEnviando(true);

    // Loja do site da IFTech: o pedido passa pelo servidor, que confere os preços no cardápio.
    if (MULTI) {
      try {
        await mesasApi(
          "pedido",
          {
            loja: getLoja(),
            mesa: Number(mesa),
            cliente: nomeCliente || "Cliente",
            itens: itensSelecionados.map((item) => ({ produtoId: item.produtoId, qtd: Number(item.quantidade || 0), ...(item.montagem ? { montagem: item.montagem } : {}) })),
          },
          false
        );
        setCarrinho({});
        setOfereceu(false);
        setMensagem("Pedido enviado com sucesso!");
        setTimeout(() => setMensagem(""), 3000);
      } catch (erro) {
        setMensagem(erro.message || "Erro ao enviar pedido.");
      }
      setEnviando(false);
      return;
    }

    try {
      const clientePedido = nomeCliente || "Cliente";

      const itensNovos = itensSelecionados.map((item) => ({
        produtoId: item.produtoId,
        nome: item.nome,
        preco: Number(item.preco || 0),
        qtd: Number(item.quantidade || 0),
        quantidade: Number(item.quantidade || 0),
        cliente: clientePedido,
      }));

      const pedidosRef = collection(db, ...L(), "pedidos");

      const consultaMesaAberta = query(
        pedidosRef,
        where("tipo", "==", "mesa"),
        where("mesa", "==", Number(mesa)),
        where("status", "==", "aberto")
      );

      const resultado = await getDocs(consultaMesaAberta);

      const acrescentou = !resultado.empty;
      if (!resultado.empty) {
        const documentoMesa = resultado.docs[0];
        const pedidoAtual = documentoMesa.data();

        const itensAntigos = pedidoAtual.itens || [];
        const itensAtualizados = [...itensAntigos];

        itensNovos.forEach((novoItem) => {
          const itemExistente = itensAtualizados.find(
            (item) =>
              item.produtoId === novoItem.produtoId &&
              (item.cliente || "Cliente") === (novoItem.cliente || "Cliente")
          );

          if (itemExistente) {
            itemExistente.qtd =
              Number(itemExistente.qtd || itemExistente.quantidade || 0) +
              Number(novoItem.qtd || 0);

            itemExistente.quantidade = itemExistente.qtd;
            itemExistente.produtoId = novoItem.produtoId;
          } else {
            itensAtualizados.push(novoItem);
          }
        });

        const novoTotal = itensAtualizados.reduce(
          (soma, item) =>
            soma +
            Number(item.preco || 0) * Number(item.qtd || item.quantidade || 0),
          0
        );

        const novoTotalItens = itensAtualizados.reduce(
          (soma, item) => soma + Number(item.qtd || item.quantidade || 0),
          0
        );

        await updateDoc(doc(db, ...L(), "pedidos", documentoMesa.id), {
          itens: itensAtualizados,
          total: novoTotal,
          totalItens: novoTotalItens,
          atualizadoEm: new Date().toISOString(),
        });
      } else {
        await addDoc(collection(db, ...L(), "pedidos"), {
          mesa: Number(mesa),
          itens: itensNovos,
          total,
          totalItens: itensNovos.reduce(
            (soma, item) => soma + Number(item.qtd || 0),
            0
          ),
          status: "aberto",
          tipo: "mesa",
          salvoEm: new Date().toISOString(),
          criadoEm: serverTimestamp(),
        });
      }

      await baixarEstoque(itensNovos);

      await addDoc(collection(db, ...L(), "notificacoes"), {
        mesa: Number(mesa),
        tipo: "pedido",
        som: acrescentou ? "acrescentou" : "mesa",
        mensagem: acrescentou ? `Mesa ${mesa} acrescentou itens no pedido` : `Novo pedido na Mesa ${mesa}`,
        total,
        totalItens: itensNovos.reduce(
          (soma, item) => soma + Number(item.qtd || 0),
          0
        ),
        itens: itensNovos,
        lida: false,
        horario: new Date().toISOString(),
        criadoEm: serverTimestamp(),
      });

      setCarrinho({});
      setOfereceu(false);
      setMensagem("Pedido enviado com sucesso!");

      setTimeout(() => {
        setMensagem("");
      }, 3000);
    } catch (erro) {
      console.error("Erro ao enviar pedido:", erro);
      setMensagem("Erro ao enviar pedido.");
    }

    setEnviando(false);
  }

  async function chamarGarcom() {
    setEnviando(true);

    if (MULTI) {
      try {
        await mesasApi("chamar", { loja: getLoja(), mesa: Number(mesa), tipo: "garcom" }, false);
        setMensagem("Garcom chamado com sucesso!");
        setTimeout(() => setMensagem(""), 3000);
      } catch (erro) {
        setMensagem(erro.message || "Erro ao chamar garçom.");
      }
      setEnviando(false);
      return;
    }

    try {
      await addDoc(collection(db, ...L(), "notificacoes"), {
        mesa: Number(mesa),
        tipo: "garcom",
        som: "garcom",
        mensagem: `Mesa ${mesa} chamou o garçom`,
        lida: false,
        horario: new Date().toISOString(),
        criadoEm: serverTimestamp(),
      });

      setMensagem("Garcom chamado com sucesso!");

      setTimeout(() => {
        setMensagem("");
      }, 3000);
    } catch (erro) {
      console.error("Erro ao chamar garçom:", erro);
      setMensagem("Erro ao chamar garçom.");
    }

    setEnviando(false);
  }

  async function pedirConta() {
    if (!formaPagamento) {
      setMensagem("Escolha uma forma de pagamento.");
      return;
    }

    setEnviando(true);

    const totalConta = pedidoMesaAberto?.total || total;
    const totalItensConta = pedidoMesaAberto?.totalItens || 0;
    const itensConta = pedidoMesaAberto?.itens || [];

    if (MULTI) {
      try {
        await mesasApi("chamar", { loja: getLoja(), mesa: Number(mesa), tipo: "pagamento", formaPagamento }, false);
        setMensagem(`Total: R$ ${formatarMoeda(totalConta)} • Pagamento: ${formaPagamento} • O garçom já foi notificado.`);
        setMostrarModalPagamento(false);
        setFormaPagamento("");
      } catch (erro) {
        setMensagem(erro.message || "Erro ao pedir a conta.");
      }
      setEnviando(false);
      return;
    }

    try {
      await addDoc(collection(db, ...L(), "notificacoes"), {
        mesa: Number(mesa),
        tipo: "pagamento",
        som: "conta",
        mensagem: `Mesa ${mesa} pediu pagamento`,
        formaPagamento,
        total: totalConta,
        totalItens: totalItensConta,
        itens: itensConta,
        lida: false,
        horario: new Date().toISOString(),
        criadoEm: serverTimestamp(),
      });

      setMensagem(
        `Total: R$ ${formatarMoeda(totalConta)} • Pagamento: ${formaPagamento} • O garçom já foi notificado.`
      );

      setMostrarModalPagamento(false);
      setFormaPagamento("");

      setTimeout(() => {
        setMensagem("");
      }, 5000);
    } catch (erro) {
      console.error("Erro ao pedir pagamento:", erro);
      setMensagem("Erro ao pedir pagamento.");
    }

    setEnviando(false);
  }

  // Avisos (pedido enviado, garçom chamado…) somem sozinhos.
  useEffect(() => {
    if (!mensagem) return undefined;
    const t = setTimeout(() => setMensagem(""), 6000);
    return () => clearTimeout(t);
  }, [mensagem]);

  const qtdSacola = itensSelecionados.reduce((s, l) => s + Number(l.quantidade || 0), 0);
  const contaMesa = pedidoMesaAberto && pedidoMesaAberto.totalItens > 0 ? pedidoMesaAberto : null;
  // Conta da mesa por pessoa (o nome que cada um pôs no QR Code).
  const contaPorPessoa = (contaMesa?.itens || []).reduce((acc, item) => {
    const nome = String(item.cliente || "").trim();
    const quem = nome && nome.toLowerCase() !== "cliente" ? nome : "Mesa";
    (acc[quem] = acc[quem] || []).push(item);
    return acc;
  }, {});

  return (
    <div className="cl-pagina">
      {mostrarModalNome && (
        <div className="modal-nome-cliente">
          <div className="modal-nome-card">
            <h2>Quem está pedindo?</h2>
            <p>Digite seu nome para identificar seus pedidos nesta mesa.</p>

            <input
              type="text"
              placeholder="Ex: Allan"
              value={nomeDigitado}
              onChange={(e) => setNomeDigitado(e.target.value)}
              autoFocus
            />

            <div className="modal-nome-botoes">
              <button onClick={() => setMostrarModalNome(false)}>Cancelar</button>
              <button onClick={confirmarNomeCliente}>OK</button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalPagamento && (
        <div className="modal-nome-cliente">
          <div className="modal-nome-card">
            <h2>Como deseja pagar?</h2>

            <p>
              Total da conta: R$ {formatarMoeda(pedidoMesaAberto?.total || total)}
            </p>

            <div className="formas-pagamento">
              {["Pix", "Dinheiro", "Débito", "Crédito"].map((forma) => (
                <button
                  key={forma}
                  className={formaPagamento === forma ? "ativo" : ""}
                  onClick={() => setFormaPagamento(forma)}
                >
                  {forma}
                </button>
              ))}
            </div>

            <div className="modal-nome-botoes">
              <button onClick={() => setMostrarModalPagamento(false)}>
                Cancelar
              </button>
              <button onClick={pedirConta}>Solicitar</button>
            </div>
          </div>
        </div>
      )}

      <ClienteTopo
        nome={nomeLoja}
        linha={pedidoLigado ? "Escolha, monte do seu jeito e mande o pedido daqui da mesa." : "Veja o cardápio. Para pedir, chame o garçom."}
        selos={[
          { texto: `Mesa ${mesa}`, tom: "verde" },
          nomeCliente ? { texto: nomeCliente, tom: "azul" } : null,
          contaMesa ? { texto: `Conta R$ ${formatarMoeda(contaMesa.total)}` } : null,
        ]}
        aviso={
          repassaAlguma(taxas)
            ? `No cartão tem o acréscimo da taxa da maquininha${[taxas.passarDebito && taxas.debito ? `débito ${String(taxas.debito).replace(".", ",")}%` : "", taxas.passarCredito && taxas.credito ? `crédito ${String(taxas.credito).replace(".", ",")}%` : ""].filter(Boolean).join(", ").replace(/^/, ": ")}. Pix e dinheiro sem acréscimo.`
            : null
        }
        acoes={[
          garcomLigado && { icone: "🛎️", texto: "Chamar garçom", onClick: chamarGarcom, disabled: enviando, destaque: true },
          { icone: "🧾", texto: "Conta da mesa", sub: contaMesa ? `R$ ${formatarMoeda(contaMesa.total)}` : "nada ainda", onClick: () => setContaAberta(true) },
          whatsLoja && { icone: "💬", texto: "WhatsApp", sub: "da loja", href: linkWhats(whatsLoja, `Olá! Estou na Mesa ${mesa}.`) },
        ]}
      >
        {nomeCliente && (
          <button type="button" className="cl-link" onClick={() => { setNomeDigitado(nomeCliente); setMostrarModalNome(true); }}>
            Não é {nomeCliente}? Trocar o nome
          </button>
        )}
      </ClienteTopo>

      {produtosDisponiveis.length === 0 ? (
        <p className="cl-miolo cl-vazio">Nenhum produto disponível no momento.</p>
      ) : (
        <CardapioCliente
          fotos={fotos}
          categorias={produtosDisponiveis}
          emoji={emojiCategoria}
          montar={montarLigado}
          contagem={(item) => Object.values(carrinho).filter((l) => l.produtoId === item.id).reduce((s, l) => s + l.quantidade, 0)}
          indisponivel={esgotado}
          onTocar={(item) => (pedidoLigado ? alterarQuantidade(item, 1) : setMensagem("Para pedir, chame o garçom."))}
        />
      )}

      {mensagem && (
        <p className="cl-msg" role="status" onClick={() => setMensagem("")}>
          {mensagem}
        </p>
      )}

      {querMais && (
        <QuerMais
          sugestoes={querMais}
          fotos={fotos}
          contagem={qtdNoPedido}
          onAdicionar={(i) => alterarQuantidade(i, 1)}
          total={total}
          textoContinuar="Enviar pedido"
          onContinuar={() => { setQuerMais(null); setOfereceu(true); fazerPedido(); }}
          onFechar={() => setQuerMais(null)}
        />
      )}
      {montando && (
        <MontarPrato
          key={editando || "novo"}
          produto={montando}
          foto={fotos[montando.id] || null}
          fotos={fotos}
          claro
          bebidas={editando ? [] : sugestoesBebida(produtos)}
          inicial={editando ? carrinho[editando]?.montagem : null}
          textoBotao={editando ? "Salvar alteração" : "Adicionar"}
          onAdicionar={adicionarMontado}
          onFechar={() => { setMontando(null); setEditando(null); }}
        />
      )}

      {perguntar && (
        <PratoNoPedido
          produto={perguntar}
          linhas={linhasDoProduto(perguntar.id)}
          onEditar={editarLinha}
          onMaisUm={() => { setEditando(null); setMontando(perguntar); setPerguntar(null); }}
          onFechar={() => setPerguntar(null)}
        />
      )}

      <BarraSacola
        qtd={qtdSacola}
        total={total}
        onClick={() => setSacolaAberta(true)}
        secundario={
          qtdSacola === 0 && contaMesa ? (
            <button type="button" className="cl-barra-sec" onClick={() => setContaAberta(true)}>
              <span>Conta da mesa · {contaMesa.totalItens} {contaMesa.totalItens === 1 ? "item" : "itens"}</span>
              <strong>R$ {formatarMoeda(contaMesa.total)}</strong>
            </button>
          ) : null
        }
      />

      {sacolaAberta && (
        <Folha
          titulo="Sua sacola"
          onFechar={() => setSacolaAberta(false)}
          rodape={
            <>
              <div className="cl-total">
                <span>{qtdSacola} {qtdSacola === 1 ? "item" : "itens"}</span>
                <strong>R$ {formatarMoeda(total)}</strong>
              </div>
              {pedidoLigado && (
                <button type="button" className="cl-btn" disabled={enviando || qtdSacola === 0} onClick={() => { setSacolaAberta(false); finalizarPedido(); }}>
                  {enviando ? "Enviando…" : "Enviar pedido para a cozinha"}
                </button>
              )}
              <button type="button" className="cl-btn claro" onClick={() => setSacolaAberta(false)}>Continuar escolhendo</button>
            </>
          }
        >
          <p className="cl-sub">Mesa {mesa}{nomeCliente ? ` · pedido de ${nomeCliente}` : ""}</p>
          <ItensSacola
            linhas={itensSelecionados}
            onMais={(c) => ajustarLinha(c, 1)}
            onMenos={(c) => ajustarLinha(c, -1)}
            onEditar={(l) => { setSacolaAberta(false); editarLinha(l); }}
            fotos={fotos}
            nomeBase={(l) => produtoPorId(l.produtoId)?.nome}
            podeEditar={(l) => !!produtoPorId(l.produtoId)}
          />
        </Folha>
      )}

      {contaAberta && (
        <Folha
          titulo={`Conta da Mesa ${mesa}`}
          onFechar={() => setContaAberta(false)}
          rodape={
            <>
              <div className="cl-total">
                <span>Total consumido</span>
                <strong>R$ {formatarMoeda(contaMesa?.total || 0)}</strong>
              </div>
              {contaLigada && contaMesa && (
                <button type="button" className="cl-btn azul" disabled={enviando} onClick={() => { setContaAberta(false); setMostrarModalPagamento(true); }}>
                  Pedir a conta
                </button>
              )}
              {garcomLigado && (
                <button type="button" className="cl-btn claro" disabled={enviando} onClick={() => { setContaAberta(false); chamarGarcom(); }}>
                  Chamar o garçom
                </button>
              )}
            </>
          }
        >
          {!contaMesa ? (
            <p className="cl-vazio">Nada pedido nesta mesa ainda. O que você pedir aparece aqui.</p>
          ) : (
            Object.entries(contaPorPessoa).map(([quem, itens]) => (
              <div key={quem} className="cl-conta-pessoa">
                <b>{quem === "Mesa" ? "Da mesa" : quem}</b>
                {itens.map((item) => (
                  <div key={`${item.nome}-${quem}`} className="cl-conta-linha">
                    <span className="item-partes">
                      <span className="item-nome">{item.qtd}× {partesDoItem(item).nome}</span>
                      {partesDoItem(item).detalhes.map((d, k) => <span key={k} className="item-det">{d}</span>)}
                    </span>
                    <span>R$ {formatarMoeda(item.preco * item.qtd)}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </Folha>
      )}
    </div>
  );
}

export default CardapioMesa;