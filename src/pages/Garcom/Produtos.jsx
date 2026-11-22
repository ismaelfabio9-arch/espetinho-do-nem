import { L } from "../../loja";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  collection,
  onSnapshot,
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
import { useRecurso } from "../../recursos";
import { FichaDoProduto } from "../../components/FichaTecnica";
import { MODELOS, TIPOS, lerMontagem, temMontagem, textoMontagem, tipoDe, tipoInfo, tipoPelaCategoria } from "../../utils/montagem";


// Lojas da IFTech (e a demonstração do site): categorias prontas, cardápios de exemplo e tipo nas categorias.
// A loja original do espetinho continua com o cardápio dela.
const LOJA_IFTECH = process.env.REACT_APP_MULTI === "1";

const normalizar = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function Produtos() {
  // Planos Completo e Premium: ingredientes (ficha técnica), custo e preço certo dentro do produto.
  const financasLigado = useRecurso("custos");
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  // Editar produto: toca na linha e abre a ficha (nome, preço, categoria, opções e excluir).
  const [ficha, setFicha] = useState(null);
  const [busca, setBusca] = useState("");
  // Montagem do prato (almoço): o que vem, as escolhas e o que vai a mais.
  const [montagemAberta, setMontagemAberta] = useState(null);
  const [adicionando, setAdicionando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [precoNovoProduto, setPrecoNovoProduto] = useState("");
  const [tipoNovo, setTipoNovo] = useState("");
  const [prontasAbertas, setProntasAbertas] = useState(false);
  const [pondoPronta, setPondoPronta] = useState(false);
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
      // Começa vazio: o exemplo aparece só em cinza (e no botão "Usar o exemplo"), para nenhuma opção
      // inventada (recheio, "Ovo = 2"…) ir parar no pedido sem o dono escrever.
      setMontagemAberta({ id: produtoId, nome: nomeTratado, tipo: tipoEscolhido, novo: true, vem: "", escolhas: "", extras: "" });
    }
    setTipoNovo("");
    setNovoNome("");
    setNovaCategoria("");
    setPrecoNovoProduto("");
    setErroProduto("");
    setAdicionando(false);
  }

  function abrirFicha(produto) {
    setFicha({ id: produto.id, nome: produto.nome || "", preco: String(produto.preco ?? ""), categoria: produto.categoria || "", erro: "", salvando: false });
  }

  async function salvarFicha() {
    const produto = produtos.find((p) => p.id === ficha?.id);
    if (!produto) return setFicha(null);
    const nomeTratado = ficha.nome.trim();
    const preco = Number(String(ficha.preco).replace(",", "."));
    const categoria = ficha.categoria || produto.categoria;
    if (!nomeTratado) return setFicha({ ...ficha, erro: "O nome não pode ficar em branco." });
    if (!Number.isFinite(preco) || preco < 0) return setFicha({ ...ficha, erro: "Confira o preço." });
    const nomeJaExiste = produtos.some(
      (item) =>
        item.id !== produto.id &&
        item.categoria === categoria &&
        (item.nome || "").trim().toLowerCase() === nomeTratado.toLowerCase()
    );
    if (nomeJaExiste) return setFicha({ ...ficha, erro: "Já existe um produto com esse nome nessa categoria." });

    setFicha({ ...ficha, erro: "", salvando: true });
    try {
      const agora = new Date().toISOString();
      const muda = {};
      if (nomeTratado !== produto.nome) muda.nome = nomeTratado;
      if (preco !== Number(produto.preco)) muda.preco = preco;
      if (Object.keys(muda).length) {
        const batch = writeBatch(db);
        batch.update(doc(db, ...L(), "produtos", produto.id), { ...muda, atualizadoEm: agora });
        if (muda.nome) batch.set(doc(db, ...L(), "estoque", produto.id), { nome: nomeTratado, atualizadoEm: agora }, { merge: true });
        await batch.commit();
      }
      if (categoria !== produto.categoria) await moverProdutoParaCategoria(produto.id, categoria);
      setFicha(null);
    } catch (erro) {
      console.error("Erro ao salvar produto:", erro);
      setFicha((f) => f && { ...f, salvando: false, erro: "Não foi possível salvar. Tente novamente." });
    }
  }

  async function confirmarExcluirProduto() {
    if (!produtoParaExcluir) return;

    await deleteDoc(doc(db, ...L(), "produtos", produtoParaExcluir.id));
    await deleteDoc(doc(db, ...L(), "estoque", produtoParaExcluir.id));

    setProdutoParaExcluir(null);
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
    <div className="container prod-pagina">
      <Link to="/" className="voltar">
        ← Voltar
      </Link>

      <div className="prod-topo">
        <div className="prod-titulo">
          <h1>Produtos</h1>
          <p>Toque num produto para mudar nome, preço, categoria ou opções.</p>
        </div>
        <button
          className="prod-acao principal"
          onClick={() => {
            setAdicionando(true);
            setErroProduto("");
          }}
        >
          + Produto
        </button>
      </div>

      <div className="prod-barra">
        <input
          className="prod-busca"
          type="search"
          placeholder="Buscar produto"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar produto"
        />
        <div className="prod-acoes">
          <button className={gerenciandoCategorias ? "prod-acao ativo" : "prod-acao"} onClick={() => setGerenciandoCategorias((v) => !v)}>
            {gerenciandoCategorias ? "✕ Fechar categorias" : "🗂️ Categorias"}
          </button>
          {LOJA_IFTECH && (
            <button className="prod-acao" onClick={() => setProntasAbertas(true)}>
              🧩 Categoria pronta
            </button>
          )}
          <Link to="/cardapio-hoje" className="prod-acao">
            📅 Cardápio de hoje
          </Link>
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
                      onClick={() => muda({ tipo: t.id })}
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
      {(() => {
        const termo = normalizar(busca);
        let algum = false;
        const blocos = categoriasExibidas.map((categoria) => {
          const itens = ordenarItensCategoria(produtosPorCategoria[categoria.nome] || []).filter(
            (p) => !termo || normalizar(p.nome).includes(termo)
          );
          if (termo && !itens.length) return null;
          algum = algum || itens.length > 0;
          return (
            <section key={categoria.id} className="prod-cat">
              <h3>
                {categoria.nome} <small>{itens.length}</small>
              </h3>
              {itens.length === 0 && <p className="prod-vazio">Nenhum produto nesta categoria.</p>}
              <div className="prod-lista">
                {itens.map((produto) => {
                  const tipo = tipoDe(produto);
                  const info = tipoInfo(tipo);
                  const comOpcoes = tipo !== "simples";
                  const ok = comOpcoes && temMontagem(produto);
                  return (
                    <button type="button" key={produto.id} className="prod-item" onClick={() => abrirFicha(produto)}>
                      <span className="prod-item-nome">
                        {produto.nome}
                        {comOpcoes && (
                          <small className={ok ? "prod-tag" : "prod-tag falta"}>
                            {info.emoji} {ok ? info.nome : "cadastrar opções"}
                          </small>
                        )}
                      </span>
                      <strong className="prod-item-preco">R$ {formatarMoeda(produto.preco)}</strong>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        });
        return termo && !algum ? <p className="prod-vazio">Nenhum produto com “{busca}”.</p> : blocos;
      })()}

      {ficha && (() => {
        const produto = produtos.find((p) => p.id === ficha.id);
        if (!produto) return null;
        const tipo = tipoDe(produto);
        const info = tipoInfo(tipo);
        return (
          <div className="modal-overlay prod-ficha-fundo" onClick={() => !ficha.salvando && setFicha(null)}>
            <div className="prod-ficha" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Editar ${produto.nome}`}>
              <div className="prod-ficha-topo">
                <h2>Editar produto</h2>
                <button type="button" className="prod-ficha-x" onClick={() => setFicha(null)} aria-label="Fechar">✕</button>
              </div>
              <label>
                Nome
                <input value={ficha.nome} onChange={(e) => setFicha({ ...ficha, nome: e.target.value, erro: "" })} />
              </label>
              <div className="prod-ficha-dupla">
                <label>
                  Preço (R$)
                  <input type="number" inputMode="decimal" step="0.01" value={ficha.preco} onChange={(e) => setFicha({ ...ficha, preco: e.target.value, erro: "" })} />
                </label>
                <label>
                  Categoria
                  <select value={ficha.categoria} onChange={(e) => setFicha({ ...ficha, categoria: e.target.value, erro: "" })}>
                    {categoriasExibidas.map((c) => (
                      <option key={c.id} value={c.nome}>{c.nome}</option>
                    ))}
                  </select>
                </label>
              </div>
              {financasLigado && (
                <div className="prod-ficha-ingred">
                  <strong>Ingredientes, custo e preço certo</strong>
                  <FichaDoProduto produto={produto} precoAtual={ficha.preco} />
                </div>
              )}
              <button
                type="button"
                className="prod-ficha-opcoes"
                onClick={() => {
                  setFicha(null);
                  setMontagemAberta({ id: produto.id, nome: produto.nome, tipo, ...textoMontagem(produto.montagem) });
                }}
              >
                <span>
                  <strong>{info.emoji} {info.nome}</strong>
                  <small>
                    {tipo === "simples" ? "Entra direto, sem escolhas. Toque para mudar o tipo." : temMontagem(produto) ? "Opções cadastradas. Toque para ver ou mudar." : "Falta cadastrar as opções."}
                  </small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
              {ficha.erro && <p className="prod-ficha-erro">{ficha.erro}</p>}
              <div className="prod-ficha-botoes">
                <button
                  type="button"
                  className="prod-ficha-excluir"
                  onClick={() => {
                    setFicha(null);
                    setProdutoParaExcluir(produto);
                  }}
                >
                  Excluir
                </button>
                <button type="button" className="btn-verde" disabled={ficha.salvando} onClick={salvarFicha}>
                  {ficha.salvando ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default Produtos;
