import { L } from "../../loja";

// Lojas da IFTech (e a demonstração do site): categorias prontas, cardápios de exemplo e tipo nas categorias.
// A loja original do espetinho continua com o cardápio dela.
const LOJA_IFTECH = process.env.REACT_APP_MULTI === "1";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../../firebase";
import { produtos as produtosEspetinho, CATEGORIAS_PRONTAS, CARDAPIOS_EXEMPLO } from "../../data/produtos";
import {
  SEM_CATEGORIA,
  migrarCategoriasSeNecessario,
  criarCategoria,
  renomearCategoria,
  excluirCategoria,
  moverProdutoParaCategoria,
  salvarOrdemCategorias,
  trocarPosicao,
} from "../../utils/categorias";
import { ordenarItensCategoria } from "../../utils/produtosOrdem";
import { slugify, formatarMoeda } from "../../utils/texto";
import "../../styles/Garcom/Produtos.css";
import { MODELOS, TIPOS, lerMontagem, temMontagem, textoMontagem, tipoDe, tipoInfo, tipoPelaCategoria } from "../../utils/montagem";

function Produtos() {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [editando, setEditando] = useState(null);
  const [novoPreco, setNovoPreco] = useState("");
  const [editandoNome, setEditandoNome] = useState(null);
  // Montagem do prato (almoço): o que vem, as escolhas e o que vai a mais.
  const [montagemAberta, setMontagemAberta] = useState(null);
  const [novoNomeProduto, setNovoNomeProduto] = useState("");
  const [erroNomeProduto, setErroNomeProduto] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [precoNovoProduto, setPrecoNovoProduto] = useState("");
  const [tipoNovo, setTipoNovo] = useState("");
  const [prontasAbertas, setProntasAbertas] = useState(false);
  const [pondoPronta, setPondoPronta] = useState(false);
  const [segurandoProduto, setSegurandoProduto] = useState(null);
  const [produtoParaExcluir, setProdutoParaExcluir] = useState(null);
  const [erroProduto, setErroProduto] = useState("");

  // ── Estado da gestão de categorias ──
  const [gerenciandoCategorias, setGerenciandoCategorias] = useState(false);
  const [criandoCategoria, setCriandoCategoria] = useState(false);
  const [nomeNovaCategoria, setNomeNovaCategoria] = useState("");
  const [erroCategoria, setErroCategoria] = useState("");
  const [categoriaEditando, setCategoriaEditando] = useState(null);
  const [nomeEditadoCategoria, setNomeEditadoCategoria] = useState("");
  const [categoriaParaExcluir, setCategoriaParaExcluir] = useState(null);
  const [acaoExclusao, setAcaoExclusao] = useState("sem-categoria");
  const [categoriaDestinoExclusao, setCategoriaDestinoExclusao] = useState("");
  const [mensagemCategoria, setMensagemCategoria] = useState("");

  const arrastandoIndex = useRef(null);
  const [indexSobre, setIndexSobre] = useState(null);

  function criarIdProduto(texto) {
    return slugify(texto);
  }

  useEffect(() => {
    migrarCategoriasSeNecessario().catch((erro) =>
      console.error("Erro ao migrar categorias:", erro)
    );

    const cancelarProdutos = onSnapshot(collection(db, ...L(), "produtos"), (snapshot) => {
      const lista = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      setProdutos(lista);
    });

    const cancelarCategorias = onSnapshot(collection(db, ...L(), "categorias"), (snapshot) => {
      const lista = snapshot.docs
        .map((documento) => ({ id: documento.id, ...documento.data() }))
        .sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999));

      setCategorias(lista);
    });

    return () => {
      cancelarProdutos();
      cancelarCategorias();
    };
  }, []);

  function mostrarMensagemCategoria(texto) {
    setMensagemCategoria(texto);
    setTimeout(() => setMensagemCategoria(""), 2500);
  }

  /** Tipo da categoria: o que o dono marcou nela ou, sem marcar, o sugerido pelo nome. */
  function tipoDaCategoria(nome) {
    const c = categorias.find((x) => x.nome.toLowerCase() === String(nome || "").trim().toLowerCase());
    return c?.tipo || tipoPelaCategoria(nome);
  }

  /** Grava categorias com seus produtos (cardápio de exemplo ou categoria pronta). Não repete produto com o mesmo nome. */
  async function gravarCategorias(lista) {
    let ordemBase = categorias.reduce((max, c) => Math.max(max, typeof c.ordem === "number" ? c.ordem : 0), -1) + 1;
    const nomesAtuais = new Set(produtos.map((p) => `${p.categoria}|${p.nome}`.toLowerCase()));
    let novos = 0;
    for (const categoria of lista) {
      for (const item of categoria.itens) {
        if (nomesAtuais.has(`${categoria.categoria}|${item.nome}`.toLowerCase())) continue;
        const produtoId = item.id || criarIdProduto(`${categoria.categoria}-${item.nome}`);
        const tipo = item.tipo || categoria.tipo;
        await setDoc(
          doc(db, ...L(), "produtos", produtoId),
          {
            categoria: categoria.categoria,
            nome: item.nome,
            preco: Number(item.preco),
            ativo: true,
            ...(tipo ? { tipo } : {}),
            ...(item.montagem ? { montagem: item.montagem } : {}),
            criadoEm: serverTimestamp(),
          },
          { merge: true }
        );
        await setDoc(
          doc(db, ...L(), "estoque", produtoId),
          { nome: item.nome, categoria: categoria.categoria, quantidade: 0, atualizadoEm: new Date().toISOString() },
          { merge: true }
        );
        novos++;
      }
      // Loja da IFTech: a categoria entra no fim da lista, já com o tipo dos produtos novos.
      if (LOJA_IFTECH) {
        const existente = categorias.find((c) => c.nome.toLowerCase() === categoria.categoria.toLowerCase());
        if (existente) {
          if (categoria.tipo && !existente.tipo) await setDoc(doc(db, ...L(), "categorias", existente.id), { tipo: categoria.tipo }, { merge: true });
        } else {
          await setDoc(
            doc(db, ...L(), "categorias", slugify(categoria.categoria) || `categoria-${ordemBase}`),
            { nome: categoria.categoria, ordem: ordemBase++, ativo: true, ...(categoria.tipo ? { tipo: categoria.tipo } : {}), criadoEm: serverTimestamp(), atualizadoEm: new Date().toISOString() },
            { merge: true }
          );
        }
      }
    }
    return novos;
  }

  async function importarProdutosPadrao(exemploId) {
    // Lojas da IFTech escolhem um cardápio de exemplo pelo tipo de negócio; a loja original mantém o dela.
    if (LOJA_IFTECH) {
      const ex = CARDAPIOS_EXEMPLO.find((c) => c.id === exemploId) || CARDAPIOS_EXEMPLO[0];
      await gravarCategorias(ex.categorias.map((id) => CATEGORIAS_PRONTAS.find((c) => c.id === id)).filter(Boolean));
    } else {
      await gravarCategorias(produtosEspetinho);
    }
    await migrarCategoriasSeNecessario();
  }

  async function porCategoriaPronta(pronta) {
    setPondoPronta(true);
    try {
      const n = await gravarCategorias([pronta]);
      mostrarMensagemCategoria(n ? `${pronta.categoria}: ${n} produto(s) de exemplo. Mude nomes e preços à vontade.` : `${pronta.categoria} já estava no cardápio.`);
      setProntasAbertas(false);
    } catch {
      mostrarMensagemCategoria("Não foi possível pôr a categoria agora.");
    }
    setPondoPronta(false);
  }

  async function adicionarProduto() {
    if (!novoNome || !novaCategoria || !precoNovoProduto) {
      setErroProduto("Preencha nome, categoria e preço.");
      return;
    }

    const nomeTratado = novoNome.trim();
    const categoriaTratada = novaCategoria.trim();
    const produtoId = criarIdProduto(`${categoriaTratada}-${nomeTratado}`);
    const tipoEscolhido = tipoNovo || tipoDaCategoria(categoriaTratada);

    await setDoc(
      doc(db, ...L(), "produtos", produtoId),
      {
        nome: nomeTratado,
        categoria: categoriaTratada,
        preco: Number(precoNovoProduto),
        ativo: true,
        tipo: tipoEscolhido,
        criadoEm: serverTimestamp(),
      },
      { merge: true }
    );

    await setDoc(
      doc(db, ...L(), "estoque", produtoId),
      {
        nome: nomeTratado,
        categoria: categoriaTratada,
        quantidade: 0,
        atualizadoEm: new Date().toISOString(),
      },
      { merge: true }
    );

    // Se o cliente digitou uma categoria nova que ainda não existe na
    // coleção "categorias", cria automaticamente ao final da lista.
    const existeCategoria = categorias.some(
      (c) => c.nome.toLowerCase() === categoriaTratada.toLowerCase()
    );
    if (!existeCategoria) {
      try {
        const idCategoria = await criarCategoria(categoriaTratada, categorias);
        await setDoc(doc(db, ...L(), "categorias", idCategoria), { tipo: tipoEscolhido }, { merge: true });
      } catch {
        // categoria pode já existir por corrida entre abas — ignora
      }
    }

    // Sabor, recheio ou prato: já abre as opções com o modelo do tipo para o dono ajustar.
    if (tipoEscolhido !== "simples") {
      setMontagemAberta({ id: produtoId, nome: nomeTratado, tipo: tipoEscolhido, novo: true, ...textoMontagem(MODELOS[tipoEscolhido]) });
    }
    setTipoNovo("");
    setNovoNome("");
    setNovaCategoria("");
    setPrecoNovoProduto("");
    setErroProduto("");
    setAdicionando(false);
  }

  async function salvarPreco(produto) {
    await updateDoc(doc(db, ...L(), "produtos", produto.id), {
      preco: Number(novoPreco),
      atualizadoEm: new Date().toISOString(),
    });

    setEditando(null);
    setNovoPreco("");
  }

  async function salvarNomeProduto(produto) {
    const nomeTratado = novoNomeProduto.trim();

    if (!nomeTratado) {
      setErroNomeProduto("O nome não pode ficar em branco.");
      return;
    }

    const nomeJaExiste = produtos.some(
      (item) =>
        item.id !== produto.id &&
        item.categoria === produto.categoria &&
        item.nome.trim().toLowerCase() === nomeTratado.toLowerCase()
    );

    if (nomeJaExiste) {
      setErroNomeProduto("Já existe um produto com esse nome nessa categoria.");
      return;
    }

    try {
      const batch = writeBatch(db);

      batch.update(doc(db, ...L(), "produtos", produto.id), {
        nome: nomeTratado,
        atualizadoEm: new Date().toISOString(),
      });

      batch.set(
        doc(db, ...L(), "estoque", produto.id),
        { nome: nomeTratado, atualizadoEm: new Date().toISOString() },
        { merge: true }
      );

      await batch.commit();

      setEditandoNome(null);
      setNovoNomeProduto("");
      setErroNomeProduto("");
    } catch (erro) {
      console.error("Erro ao renomear produto:", erro);
      setErroNomeProduto("Erro ao renomear. Tente novamente.");
    }
  }

  async function confirmarExcluirProduto() {
    if (!produtoParaExcluir) return;

    await deleteDoc(doc(db, ...L(), "produtos", produtoParaExcluir.id));
    await deleteDoc(doc(db, ...L(), "estoque", produtoParaExcluir.id));

    setProdutoParaExcluir(null);
  }

  function iniciarPressionar(produto) {
    const timer = setTimeout(() => {
      setProdutoParaExcluir(produto);
    }, 900);

    setSegurandoProduto(timer);
  }

  function cancelarPressionar() {
    if (segurandoProduto) {
      clearTimeout(segurandoProduto);
      setSegurandoProduto(null);
    }
  }

  async function trocarCategoriaProduto(produtoId, novaCategoriaNome) {
    await moverProdutoParaCategoria(produtoId, novaCategoriaNome);
  }

  // ── Ordenação das categorias exibidas ──
  const categoriasExibidas = useMemo(() => {
    const nomesComProdutos = new Set(produtos.map((p) => p.categoria));
    const nomesCadastrados = new Set(categorias.map((c) => c.nome));

    const extras = Array.from(nomesComProdutos)
      .filter((nome) => nome && !nomesCadastrados.has(nome))
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((nome, i) => ({
        id: `nao-cadastrada-${slugify(nome)}`,
        nome,
        ordem: 9000 + i,
        virtual: true,
      }));

    return [...categorias, ...extras];
  }, [categorias, produtos]);

  const produtosPorCategoria = produtos.reduce((grupos, produto) => {
    const chave = produto.categoria || SEM_CATEGORIA;
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(produto);
    return grupos;
  }, {});

  // ── CRUD de categorias ──
  async function confirmarCriarCategoria() {
    try {
      await criarCategoria(nomeNovaCategoria, categorias);
      setNomeNovaCategoria("");
      setCriandoCategoria(false);
      setErroCategoria("");
      mostrarMensagemCategoria("Categoria criada!");
    } catch (erro) {
      setErroCategoria(erro.message);
    }
  }

  function iniciarEdicaoCategoria(categoria) {
    setCategoriaEditando(categoria);
    setNomeEditadoCategoria(categoria.nome);
  }

  async function confirmarRenomearCategoria() {
    if (!categoriaEditando) return;
    try {
      await renomearCategoria(categoriaEditando, nomeEditadoCategoria);
      setCategoriaEditando(null);
      mostrarMensagemCategoria("Categoria renomeada!");
    } catch (erro) {
      setErroCategoria(erro.message);
    }
  }

  function abrirExclusaoCategoria(categoria) {
    setCategoriaParaExcluir(categoria);
    setAcaoExclusao("sem-categoria");
    setCategoriaDestinoExclusao("");
  }

  async function confirmarExclusaoCategoria() {
    if (!categoriaParaExcluir) return;

    const destino =
      acaoExclusao === "mover" && categoriaDestinoExclusao
        ? { tipo: "mover", categoriaDestino: categoriaDestinoExclusao }
        : { tipo: "sem-categoria" };

    await excluirCategoria(categoriaParaExcluir, destino);
    setCategoriaParaExcluir(null);
    mostrarMensagemCategoria("Categoria excluída!");
  }

  async function moverCategoriaBotao(index, direcao) {
    const novaOrdem = trocarPosicao(categorias, index, index + direcao);
    if (novaOrdem === categorias) return;
    setCategorias(novaOrdem);
    await salvarOrdemCategorias(novaOrdem);
  }

  // ── Drag & drop de categorias (mouse + touch via HTML5 draggable) ──
  function aoIniciarArrasto(index) {
    arrastandoIndex.current = index;
  }

  function aoPassarPorCima(e, index) {
    e.preventDefault();
    setIndexSobre(index);
  }

  async function aoSoltar(index) {
    const origem = arrastandoIndex.current;
    arrastandoIndex.current = null;
    setIndexSobre(null);

    if (origem === null || origem === index) return;

    // Ao arrastar uma categoria sobre outra, as duas trocam de lugar.
    // Assim, a categoria que estava no destino ocupa exatamente o lugar
    // que a categoria arrastada deixou.
    const nova = trocarPosicao(categorias, origem, index);

    setCategorias(nova);
    await salvarOrdemCategorias(nova);
  }

  async function salvarMontagem() {
    const tipo = montagemAberta.tipo || "simples";
    const m = tipo === "simples" ? null : lerMontagem(tipo === "prato" ? montagemAberta : { ...montagemAberta, vem: "" });
    if ((tipo === "sabor" || tipo === "recheio") && !(m?.escolhas || []).length) {
      setMontagemAberta({ ...montagemAberta, erro: tipo === "sabor" ? "Escreva os sabores. Ex.: Sabor: Coco, Morango" : "Escreva as opções. Ex.: Recheio: Queijo, Frango = 2" });
      return;
    }
    await setDoc(doc(db, ...L(), "produtos", montagemAberta.id), { tipo, montagem: m }, { merge: true });
    setMontagemAberta(null);
    mostrarMensagemCategoria(tipo === "simples" ? "Produto simples: entra direto, sem opções." : `${tipoInfo(tipo).nome}: opções salvas!`);
  }

  async function mudarTipoCategoria(categoria, tipo) {
    await setDoc(doc(db, ...L(), "categorias", categoria.id), { tipo }, { merge: true });
    mostrarMensagemCategoria(`Produtos novos em "${categoria.nome}": ${tipoInfo(tipo).nome}.`);
  }

  const produtosDisponiveisComoDestino = (categoriaAtual) =>
    categorias.filter((c) => c.nome !== categoriaAtual);

  return (
    <div className="container">
      <Link to="/" className="voltar">
        ← Voltar
      </Link>

      <div className="pedidos-header">
        <div>
          <span>Cardápio</span>
          <h1>Produtos</h1>
          <p>Altere preços e organize as categorias do cardápio.</p>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <Link to="/cardapio-hoje" className="produto-mini-btn" title="Cardápio de hoje" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            📅
          </Link>
          {LOJA_IFTECH && (
            <button className="produto-mini-btn" onClick={() => setProntasAbertas(true)} title="Categoria pronta (picolés, tapiocas, açaí…)">
              🧩
            </button>
          )}
          <button
            className="produto-mini-btn"
            onClick={() => setGerenciandoCategorias((v) => !v)}
            title="Gerenciar categorias"
          >
            {gerenciandoCategorias ? "✕" : "🗂️"}
          </button>

          <button
            className="produto-mini-btn"
            onClick={() => {
              setAdicionando(true);
              setErroProduto("");
            }}
            title="Adicionar produto"
          >
            +
          </button>
        </div>
      </div>

      {mensagemCategoria && <div className="toast">{mensagemCategoria}</div>}

      {montagemAberta && (() => {
        const tipo = montagemAberta.tipo || "simples";
        const info = tipoInfo(tipo);
        const muda = (campos) => setMontagemAberta({ ...montagemAberta, erro: "", ...campos });
        return (
          <div className="modal-overlay" onClick={() => setMontagemAberta(null)}>
            <div className="modal-card montagem-card" onClick={(e) => e.stopPropagation()}>
              <h2>{info.emoji} {montagemAberta.nome}</h2>
              <label>
                Tipo do produto
                <div className="tipo-opcoes">
                  {TIPOS.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      className={t.id === tipo ? "tipo-op ativo" : "tipo-op"}
                      onClick={() => muda({ tipo: t.id, ...(t.id !== "simples" && !montagemAberta.escolhas && !montagemAberta.vem && !montagemAberta.extras ? textoMontagem(MODELOS[t.id]) : {}) })}
                    >
                      <strong>{t.emoji} {t.nome}</strong>
                      <small>{t.exemplo}</small>
                    </button>
                  ))}
                </div>
              </label>
              {tipo === "simples" && <p>Entra direto no pedido com um toque, sem perguntar nada. Bom para bebida, sobremesa, doce e salgado.</p>}
              {tipo === "prato" && (
                <>
                  <p>Na hora de lançar, o garçom (e o cliente no QR Code) monta o prato com isto. Deixe em branco o que não usar.</p>
                  <label>
                    Vem no prato <small>(separe por vírgula)</small>
                    <input value={montagemAberta.vem} onChange={(e) => muda({ vem: e.target.value })} placeholder="Arroz, Feijão, Salada, Farofa" />
                  </label>
                </>
              )}
              {tipo === "sabor" && <p>Um produto só, e na hora do pedido escolhe o sabor. Se um sabor custar mais, ponha "= preço" depois dele.</p>}
              {tipo === "recheio" && <p>Na hora do pedido escolhe o recheio ou o tamanho. Ponha "= preço" no que custar mais que o preço do produto.</p>}
              {tipo !== "simples" && (
                <>
                  <label>
                    {tipo === "sabor" ? "Sabores" : tipo === "recheio" ? "Recheios e tamanhos" : "Escolhas"} <small>(uma por linha: Grupo: opção, opção = preço)</small>
                    <textarea
                      rows={3}
                      value={montagemAberta.escolhas}
                      onChange={(e) => muda({ escolhas: e.target.value })}
                      placeholder={tipo === "sabor" ? "Sabor: Coco, Morango, Chocolate" : tipo === "recheio" ? "Recheio: Queijo, Frango = 2, Carne de sol = 4\nTamanho: Pequeno, Grande = 3" : "Feijão: Carioca, Preto, Macassar\nSalada: Verdura, Vinagrete"}
                    />
                  </label>
                  <label>
                    {tipo === "prato" ? "A mais, com preço" : "Adicionais, com preço"} <small>(uma por linha: nome = preço)</small>
                    <textarea rows={2} value={montagemAberta.extras} onChange={(e) => muda({ extras: e.target.value })} placeholder={tipo === "prato" ? "Ovo = 2\nBatata frita = 6" : tipo === "sabor" ? "Cobertura = 2" : "Ovo = 2\nQueijo a mais = 3"} />
                  </label>
                  <button type="button" className="montagem-modelo" onClick={() => muda(textoMontagem(MODELOS[tipo]))}>
                    Usar o exemplo de {info.nome.toLowerCase()}
                  </button>
                </>
              )}
              {montagemAberta.erro && <p className="montagem-erro">{montagemAberta.erro}</p>}
              <div className="modal-acoes">
                <button type="button" className="modal-btn cancelar" onClick={() => setMontagemAberta(null)}>{montagemAberta.novo ? "Depois" : "Cancelar"}</button>
                <button type="button" className="modal-btn confirmar" onClick={salvarMontagem}>Salvar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {prontasAbertas && (
        <div className="modal-overlay" onClick={() => !pondoPronta && setProntasAbertas(false)}>
          <div className="modal-card montagem-card" onClick={(e) => e.stopPropagation()}>
            <h2>➕ Categoria pronta</h2>
            <p>A categoria entra no fim do cardápio com produtos de exemplo, já com sabores, recheios ou montagem. Depois é só mudar nomes e preços.</p>
            <div className="prontas-grade">
              {CATEGORIAS_PRONTAS.map((c) => (
                <button type="button" key={c.id} className="tipo-op" disabled={pondoPronta} onClick={() => porCategoriaPronta(c)}>
                  <strong>{c.emoji} {c.categoria}</strong>
                  <small>{tipoInfo(c.tipo).nome} · {c.itens.map((i) => i.nome).slice(0, 3).join(", ")}</small>
                </button>
              ))}
            </div>
            <div className="modal-acoes">
              <button type="button" className="modal-btn cancelar" disabled={pondoPronta} onClick={() => setProntasAbertas(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {gerenciandoCategorias && (
        <div className="pedido-card categorias-painel">
          <div className="categorias-painel-header">
            <h3>Categorias</h3>
            <button
              className="produto-mini-btn"
              onClick={() => {
                setCriandoCategoria(true);
                setErroCategoria("");
              }}
              title="Nova categoria"
            >
              +
            </button>
          </div>

          <p className="categorias-dica">
            Arraste (ou use as setas) para reordenar. A ordem aparece no
            cardápio do cliente e na tela de pedidos.
          </p>

          {categorias.length === 0 && (
            <p className="categorias-vazio">Nenhuma categoria cadastrada ainda.</p>
          )}

          <ul className="categorias-lista">
            {categorias.map((categoria, index) => (
              <li
                key={categoria.id}
                className={`categoria-linha ${indexSobre === index ? "sobre" : ""}`}
                draggable
                onDragStart={() => aoIniciarArrasto(index)}
                onDragOver={(e) => aoPassarPorCima(e, index)}
                onDrop={() => aoSoltar(index)}
                onDragEnd={() => setIndexSobre(null)}
              >
                <span className="categoria-alca" title="Arraste para reordenar">
                  ⠿
                </span>

                <span className="categoria-nome">{categoria.nome}</span>

                <span className="categoria-contagem">
                  {(produtosPorCategoria[categoria.nome] || []).length} itens
                </span>

                <select
                  className="categoria-tipo"
                  value={categoria.tipo || tipoPelaCategoria(categoria.nome)}
                  onChange={(e) => mudarTipoCategoria(categoria, e.target.value)}
                  title="Tipo dos produtos novos desta categoria"
                  aria-label={`Tipo dos produtos de ${categoria.nome}`}
                >
                  {TIPOS.map((t) => (
                    <option key={t.id} value={t.id}>{t.emoji} {t.nome}</option>
                  ))}
                </select>

                <div className="categoria-acoes">
                  <button
                    onClick={() => moverCategoriaBotao(index, -1)}
                    disabled={index === 0}
                    title="Mover para cima"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moverCategoriaBotao(index, 1)}
                    disabled={index === categorias.length - 1}
                    title="Mover para baixo"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => iniciarEdicaoCategoria(categoria)}
                    title="Renomear"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => abrirExclusaoCategoria(categoria)}
                    title="Excluir"
                    className="categoria-btn-excluir"
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {criandoCategoria && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card produto-modal-card">
            <div className="modal-fechar-dia-icone">🗂️</div>
            <h2>Nova categoria</h2>
            <p>Ela aparecerá ao final da lista, você pode reordenar depois.</p>

            {erroCategoria && <strong>{erroCategoria}</strong>}

            <div className="produto-modal-form">
              <input
                placeholder="Nome da categoria"
                value={nomeNovaCategoria}
                onChange={(e) => setNomeNovaCategoria(e.target.value)}
                autoFocus
              />
            </div>

            <div className="modal-fechar-dia-botoes">
              <button
                className="modal-btn-cancelar"
                onClick={() => {
                  setCriandoCategoria(false);
                  setErroCategoria("");
                }}
              >
                Cancelar
              </button>
              <button className="modal-btn-confirmar" onClick={confirmarCriarCategoria}>
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {categoriaEditando && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card produto-modal-card">
            <div className="modal-fechar-dia-icone">✏️</div>
            <h2>Renomear categoria</h2>
            <p>Os produtos dessa categoria são atualizados automaticamente.</p>

            {erroCategoria && <strong>{erroCategoria}</strong>}

            <div className="produto-modal-form">
              <input
                value={nomeEditadoCategoria}
                onChange={(e) => setNomeEditadoCategoria(e.target.value)}
                autoFocus
              />
            </div>

            <div className="modal-fechar-dia-botoes">
              <button
                className="modal-btn-cancelar"
                onClick={() => {
                  setCategoriaEditando(null);
                  setErroCategoria("");
                }}
              >
                Cancelar
              </button>
              <button className="modal-btn-confirmar" onClick={confirmarRenomearCategoria}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {categoriaParaExcluir && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card produto-modal-card">
            <div className="modal-fechar-dia-icone">🗑️</div>
            <h2>Excluir "{categoriaParaExcluir.nome}"?</h2>

            {(produtosPorCategoria[categoriaParaExcluir.nome] || []).length > 0 ? (
              <>
                <p>
                  Essa categoria tem{" "}
                  <strong>
                    {(produtosPorCategoria[categoriaParaExcluir.nome] || []).length}
                  </strong>{" "}
                  produto(s). Eles não serão apagados — escolha o que fazer com
                  eles:
                </p>

                <div className="produto-modal-form">
                  <label className="opcao-radio">
                    <input
                      type="radio"
                      checked={acaoExclusao === "sem-categoria"}
                      onChange={() => setAcaoExclusao("sem-categoria")}
                    />
                    Deixar sem categoria
                  </label>

                  <label className="opcao-radio">
                    <input
                      type="radio"
                      checked={acaoExclusao === "mover"}
                      onChange={() => setAcaoExclusao("mover")}
                    />
                    Mover para outra categoria
                  </label>

                  {acaoExclusao === "mover" && (
                    <select
                      value={categoriaDestinoExclusao}
                      onChange={(e) => setCategoriaDestinoExclusao(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {produtosDisponiveisComoDestino(categoriaParaExcluir.nome).map(
                        (c) => (
                          <option key={c.id} value={c.nome}>
                            {c.nome}
                          </option>
                        )
                      )}
                    </select>
                  )}
                </div>
              </>
            ) : (
              <p>Essa categoria não tem produtos.</p>
            )}

            <div className="modal-fechar-dia-botoes">
              <button
                className="modal-btn-cancelar"
                onClick={() => setCategoriaParaExcluir(null)}
              >
                Cancelar
              </button>
              <button
                className="modal-btn-confirmar"
                onClick={confirmarExclusaoCategoria}
                disabled={
                  acaoExclusao === "mover" && !categoriaDestinoExclusao
                }
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {adicionando && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card produto-modal-card">
            <div className="modal-fechar-dia-icone">➕</div>

            <h2>Adicionar produto</h2>

            <p>Cadastre um novo item no cardápio.</p>

            {erroProduto && <strong>{erroProduto}</strong>}

            <div className="produto-modal-form">
              <input
                placeholder="Nome do produto"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
              />

              <input
                placeholder="Categoria"
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
                list="lista-categorias-existentes"
              />
              <datalist id="lista-categorias-existentes">
                {categorias.map((c) => (
                  <option key={c.id} value={c.nome} />
                ))}
              </datalist>

              <input
                type="number"
                placeholder={(tipoNovo || tipoDaCategoria(novaCategoria)) === "simples" ? "Preço" : "Preço (o menor; o que custar mais vai nas opções)"}
                value={precoNovoProduto}
                onChange={(e) => setPrecoNovoProduto(e.target.value)}
              />
              <div className="tipo-opcoes">
                {TIPOS.map((t) => (
                  <button type="button" key={t.id} className={t.id === (tipoNovo || tipoDaCategoria(novaCategoria)) ? "tipo-op ativo" : "tipo-op"} onClick={() => setTipoNovo(t.id)}>
                    <strong>{t.emoji} {t.nome}</strong>
                    <small>{t.exemplo}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-fechar-dia-botoes">
              <button
                className="modal-btn-cancelar"
                onClick={() => {
                  setAdicionando(false);
                  setErroProduto("");
                  setTipoNovo("");
                }}
              >
                Cancelar
              </button>

              <button className="modal-btn-confirmar" onClick={adicionarProduto}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {produtoParaExcluir && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card">
            <div className="modal-fechar-dia-icone">🗑️</div>

            <h2>Excluir produto?</h2>

            <p>
              Você está prestes a excluir{" "}
              <strong>{produtoParaExcluir.nome}</strong> do cardápio.
            </p>

            <strong>Essa ação não pode ser desfeita.</strong>

            <div className="modal-fechar-dia-botoes">
              <button
                className="modal-btn-cancelar"
                onClick={() => setProdutoParaExcluir(null)}
              >
                Cancelar
              </button>

              <button
                className="modal-btn-confirmar"
                onClick={confirmarExcluirProduto}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {produtos.length === 0 && (
        <div style={{ marginBottom: "16px" }}>
          {LOJA_IFTECH ? (
            <>
              <p style={{ margin: "0 2px 8px", fontWeight: 700 }}>Começar com um cardápio de exemplo. O que a loja vende?</p>
              <div className="prontas-grade">
                {CARDAPIOS_EXEMPLO.map((c) => (
                  <button type="button" key={c.id} className="tipo-op" onClick={() => importarProdutosPadrao(c.id)}>
                    <strong>{c.emoji} {c.nome}</strong>
                    <small>{c.descricao}</small>
                  </button>
                ))}
              </div>
              <p style={{ margin: "8px 2px 0", fontSize: 13, opacity: 0.75 }}>
                Depois é só mudar nomes e preços. Vende mais coisas? Toque em 🧩 para pôr outra categoria pronta.
              </p>
            </>
          ) : (
            <button className="btn-verde" style={{ width: "100%" }} onClick={() => importarProdutosPadrao()}>
              Importar cardápio padrão
            </button>
          )}
        </div>
      )}
      {categoriasExibidas.map((categoria) => (
        <div key={categoria.id} className="pedido-card">
          <div className="produtos-categoria-header">
            <h3>{categoria.nome}</h3>
          </div>

          {ordenarItensCategoria(produtosPorCategoria[categoria.nome] || []).map(
            (produto) => (
              <div
                key={produto.id}
                className="pedido-total produto-linha-editavel"
                onMouseDown={() => iniciarPressionar(produto)}
                onMouseUp={cancelarPressionar}
                onMouseLeave={cancelarPressionar}
                onTouchStart={() => iniciarPressionar(produto)}
                onTouchEnd={cancelarPressionar}
              >
                <div className="produto-linha-info">
                  {editandoNome === produto.id ? (
                    <div
                      className="produto-nome-editando"
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={novoNomeProduto}
                        onChange={(e) => setNovoNomeProduto(e.target.value)}
                        autoFocus
                      />

                      <button
                        className="btn-verde"
                        onClick={() => salvarNomeProduto(produto)}
                      >
                        OK
                      </button>

                      <button
                        className="produto-nome-cancelar"
                        onClick={() => {
                          setEditandoNome(null);
                          setNovoNomeProduto("");
                          setErroNomeProduto("");
                        }}
                      >
                        ✕
                      </button>

                      {erroNomeProduto && (
                        <small className="produto-nome-erro">
                          {erroNomeProduto}
                        </small>
                      )}
                    </div>
                  ) : (
                    <span
                      className="produto-nome-clicavel"
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={() => {
                        setEditandoNome(produto.id);
                        setNovoNomeProduto(produto.nome);
                        setErroNomeProduto("");
                      }}
                      title="Toque para renomear"
                    >
                      {produto.nome} ✏️
                    </span>
                  )}

                  <select
                    className="produto-select-categoria"
                    value={produto.categoria || ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      trocarCategoriaProduto(produto.id, e.target.value)
                    }
                  >
                    {categoriasExibidas.map((c) => (
                      <option key={c.id} value={c.nome}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="produto-montagem-btn"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={() => setMontagemAberta({ id: produto.id, nome: produto.nome, tipo: tipoDe(produto), ...textoMontagem(produto.montagem) })}
                  >
                    {tipoInfo(tipoDe(produto)).botao}
                    {tipoDe(produto) !== "simples" ? (temMontagem(produto) ? " ✓" : " · cadastrar") : ""}
                  </button>
                </div>

                {editando === produto.id ? (
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="number"
                      value={novoPreco}
                      onChange={(e) => setNovoPreco(e.target.value)}
                      style={{
                        width: "80px",
                        padding: "8px",
                      }}
                    />

                    <button
                      className="btn-verde"
                      onClick={() => salvarPreco(produto)}
                    >
                      OK
                    </button>
                  </div>
                ) : (
                  <strong
                    onClick={() => {
                      setEditando(produto.id);
                      setNovoPreco(produto.preco);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    R$ {formatarMoeda(produto.preco)}
                  </strong>
                )}
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}

export default Produtos;
