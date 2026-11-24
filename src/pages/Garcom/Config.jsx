import { L, MULTI } from "../../loja";
import useNomeLoja from "../../hooks/useNomeLoja";
import Equipe from "../../components/Equipe";
import { useSouDono } from "../../tenant";
import TaxasMaquininha from "../../components/TaxasMaquininha";
import CardapioOnlineConfig from "../../components/CardapioOnlineConfig";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import "../../styles/Garcom/Config.css";
import InstallModal from "../../components/InstallApp";
import { isInstalled } from "../../utils/installPrompt";
import { useRecurso } from "../../recursos";
import { useCaixaAberto } from "../../components/AvisoCaixa";
import "../../styles/Garcom/AvisoCaixa.css";
import WhatsLojaConfig from "../../components/WhatsLojaConfig";
import SonsConfig from "../../components/SonsConfig";
import ResumoDia, { calcularResumoDia } from "../../components/ResumoDia";
import { registrar } from "../../utils/registro";
import { baixarInsumos } from "../../utils/insumos";
import { textoDoItem } from "../../utils/montagem";
import "../../components/QuerMais.css";

// Prato montado ("Peito empanado — feijão preto, …") conta no relatório como o prato.
const nomeProduto = (item) => item.nomeBase || String(item.nome || "").split(" — ")[0];


function Config() {
  // Configurações da loja, Dinheiro e Preço certo: só o dono. A equipe fica com a impressora e o tema.
  const souDono = useSouDono();
  const financasLigado = useRecurso("financas");
  const caixaAberto = useCaixaAberto(financasLigado);
  const nomeLoja = useNomeLoja();
  const [instalarAberto, setInstalarAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [encerrando, setEncerrando] = useState(false);
  const [modalEncerrarDia, setModalEncerrarDia] = useState(false);
  // Loja com "resumo-no-fechamento" (Chef Baguette): o resumo do dia aparece ao encerrar o dia.
  const resumoNoFechamento = useRecurso("resumo-no-fechamento");
  const [resumoDia, setResumoDia] = useState(null);

  function mostrarMensagem(texto) {
    setMensagem(texto);
    setTimeout(() => {
      setMensagem("");
    }, 2500);
  }

  function limparNotificacoes() {
    Object.keys(localStorage).forEach((chave) => {
      if (chave.startsWith("notificacao_")) {
        localStorage.removeItem(chave);
      }
    });

    mostrarMensagem("Notificações limpas com sucesso!");
  }

  /** Fecha as mesas abertas (encerrar o dia). Devolve quantas fechou. */
  async function fecharMesasAbertas() {
    const pedidosSnap = await getDocs(collection(db, ...L(), "pedidos"));
    const porMesa = {};
    pedidosSnap.docs.forEach((d) => {
      const p = d.data();
      if (p.tipo !== "mesa" || !p.mesa) return;
      (porMesa[p.mesa] = porMesa[p.mesa] || []).push({ id: d.id, ...p });
    });
    let n = 0;
    for (const [mesa, docs] of Object.entries(porMesa)) {
      const itens = docs.flatMap((d) => d.itens || []);
      const total = Math.round(itens.reduce((s, i) => s + Number(i.preco || 0) * Number(i.qtd || i.quantidade || 0), 0) * 100) / 100;
      const mesaRef = doc(db, ...L(), "mesas", String(mesa));
      const mesaSnap = await getDoc(mesaRef).catch(() => null);
      const mesaDados = mesaSnap?.exists() ? mesaSnap.data() : {};
      const pagos = (mesaDados.pagamentos || []).map(({ valor, forma }) => ({ valor: Number(valor || 0), forma }));
      const jaPago = Math.round(pagos.reduce((s, p) => s + p.valor, 0) * 100) / 100;
      const falta = Math.max(0, Math.round((total - jaPago) * 100) / 100);
      const pagamentos = [...pagos, ...(falta > 0 ? [{ valor: falta, forma: "Sem forma de pagamento" }] : [])];
      const agora = new Date().toISOString();
      if (itens.length) {
        await addDoc(collection(db, ...L(), "vendasDia"), {
          origem: "mesa",
          mesa: Number(mesa),
          cliente: mesaDados.cliente || "",
          titulo: `Mesa ${mesa}`,
          formaPagamento: pagamentos.length === 1 ? pagamentos[0].forma : "Dividido",
          ...(pagamentos.length > 1 ? { pagamentos } : {}),
          itens,
          total,
          totalItens: itens.reduce((s, i) => s + Number(i.qtd || i.quantidade || 0), 0),
          sessaoMesa: `${mesa}-${Date.now()}`,
          abertaEm: docs.map((d) => d.salvoEm).filter(Boolean).sort()[0] || agora,
          fechadaEm: agora,
          fechadaNoEncerramento: true,
          finalizadoEm: agora,
          criadoEm: serverTimestamp(),
        });
        baixarInsumos(itens);
        registrar({
          area: "dinheiro",
          acao: "Mesa fechada no encerramento",
          mesa,
          texto: `Mesa ${mesa}${mesaDados.cliente ? ` (${mesaDados.cliente})` : ""} estava aberta: R$ ${total.toFixed(2).replace(".", ",")}${falta > 0 ? ` · R$ ${falta.toFixed(2).replace(".", ",")} sem forma de pagamento` : ""}`,
          valor: total,
          motivo: "O dia foi encerrado com a mesa aberta",
          detalhes: itens.map(textoDoItem),
        });
        n++;
      }
      for (const d of docs) await deleteDoc(doc(db, ...L(), "pedidos", d.id));
      await setDoc(mesaRef, { numero: Number(mesa), cliente: "", pagamentos: [] }, { merge: true });
    }
    return n;
  }

  async function confirmarEncerrarDia() {
    setEncerrando(true);

    try {
      // Mesas que ficaram abertas: fecham agora e entram nas vendas do dia (o que já foi pago com a forma;
      // o resto como "sem forma de pagamento"). Ficam no registro para a dona saber.
      const fechadas = await fecharMesasAbertas();
      const vendasSnapshot = await getDocs(collection(db, ...L(), "vendasDia"));

      const vendasDia = vendasSnapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      const totalVendido = vendasDia.reduce(
        (soma, venda) => soma + Number(venda.total || 0),
        0
      );

      const totalItens = vendasDia.reduce(
        (soma, venda) => soma + Number(venda.totalItens || 0),
        0
      );

      const produtosVendidos = {};

      vendasDia.forEach((venda) => {
        (venda.itens || []).forEach((item) => {
          if (!produtosVendidos[nomeProduto(item)]) {
            produtosVendidos[nomeProduto(item)] = {
              nome: nomeProduto(item),
              qtd: 0,
              total: 0,
            };
          }

          produtosVendidos[nomeProduto(item)].qtd += Number(item.qtd || 0);
          produtosVendidos[nomeProduto(item)].total +=
            Number(item.preco || 0) * Number(item.qtd || 0);
        });
      });

      const fechamentoDoDia = {
  data: new Date().toLocaleDateString("pt-BR"),
  horario: new Date().toLocaleTimeString("pt-BR"),
  totalVendido,
  totalPedidos: vendasDia.length,
  totalItens,
  produtos: Object.values(produtosVendidos),
  vendasDia,
  criadoEm: serverTimestamp(),
};

await addDoc(collection(db, ...L(), "historicoDias"), fechamentoDoDia);

await addDoc(collection(db, ...L(), "relatorioGerencial"), fechamentoDoDia);

      for (const venda of vendasSnapshot.docs) {
        await deleteDoc(doc(db, ...L(), "vendasDia", venda.id));
      }

      const estoqueSnapshot = await getDocs(collection(db, ...L(), "estoque"));

      for (const item of estoqueSnapshot.docs) {
        await setDoc(
          doc(db, ...L(), "estoque", item.id),
          {
            quantidade: 0,
            atualizadoEm: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      const historicoMesasSnapshot = await getDocs(collection(db, ...L(), "historicoMesas"));

      for (const mesa of historicoMesasSnapshot.docs) {
        await deleteDoc(doc(db, ...L(), "historicoMesas", mesa.id));
      }

      // Retorna todas as mesas para a posição visual original.
      // Isso NUNCA altera número da mesa, pedidos, histórico ou produtos —
      // só o campo "posicao" usado para desenhar a grade de mesas.
      const mesasSnapshot = await getDocs(collection(db, ...L(), "mesas"));
      const batchPosicoes = writeBatch(db);
      let precisaResetarPosicoes = false;

      mesasSnapshot.docs.forEach((mesaDoc) => {
        const dados = mesaDoc.data();
        const posicaoOriginal =
          typeof dados.posicaoOriginal === "number"
            ? dados.posicaoOriginal
            : Number(mesaDoc.id) - 1;

        if (dados.posicao !== posicaoOriginal) {
          precisaResetarPosicoes = true;
          batchPosicoes.update(doc(db, ...L(), "mesas", mesaDoc.id), {
            posicao: posicaoOriginal,
          });
        }
      });

      if (precisaResetarPosicoes) await batchPosicoes.commit();

      Object.keys(localStorage).forEach((chave) => {
        if (
          chave.startsWith("notificacao_") ||
          chave === "faturamentoDia" ||
          chave === "vendasDia"
        ) {
          localStorage.removeItem(chave);
        }
      });

      const resumo = { ...calcularResumoDia(vendasDia), fechadasNoEncerramento: fechadas };
      registrar({ area: "dinheiro", acao: "Encerrou o dia", texto: `Total do dia R$ ${resumo.total.toFixed(2).replace(".", ",")} em ${resumo.pedidos} pedidos`, valor: resumo.total, detalhes: resumo.formas.map((f) => `${f.forma}: R$ ${f.valor.toFixed(2).replace(".", ",")}`) });
      mostrarMensagem("Dia encerrado.");
      setModalEncerrarDia(false);
      if (resumoNoFechamento) setResumoDia(resumo);
    } catch (erro) {
      console.error("Erro ao encerrar dia:", erro);
      mostrarMensagem("Erro ao encerrar o dia.");
    } finally {
      setEncerrando(false);
    }
  }

  // Recurso ligado pela IFTech só nesta loja (Admin → Contratações).
  const novidadesEmTeste = useRecurso("beta");

  return (
    <div className="container">
      {mensagem && <div className="toast">{mensagem}</div>}

      <Link to="/" className="voltar">
        ← Voltar
      </Link>

      <div className="config-header">
        <div>
          <span>⚙️ Sistema</span>
          <h1>Configurações</h1>
          <p>Ajustes da loja: impressora, equipe, taxas, WhatsApp e fechamento do dia.</p>
        </div>
      </div>

      {novidadesEmTeste && (
        <p className="config-beta" style={{ margin: "0 0 14px", padding: "10px 14px", borderRadius: 12, background: "#dcfce7", color: "#14532d", fontWeight: 700, fontSize: 14 }}>
          Sua loja recebe as novidades em teste antes das outras.
        </p>
      )}

      {/* Caixa, histórico, relatório, produtos, estoque e finanças ficam nas 3 áreas. */}
      <div className="config-areas">
        <span>Procurando caixa, histórico, produtos, estoque ou finanças? Ficam aqui:</span>
        <div>
          <Link to="/vendas">Vendas</Link>
          <Link to="/cardapio">Cardápio e estoque</Link>
          {financasLigado && souDono && <Link to="/dinheiro">Dinheiro</Link>}
        </div>
      </div>

      {!souDono && (
        <p className="config-beta" style={{ margin: "0 0 14px", padding: "10px 14px", borderRadius: 12, background: "#f3f4f6", color: "#374151", fontSize: 14 }}>
          As configurações da loja (equipe, taxas, WhatsApp, cardápio online e fechamento do dia) ficam com o dono da loja.
        </p>
      )}

      {MULTI && souDono && (
        <a href="/sistemas/sistema-de-mesas#planos" style={{ textDecoration: "none" }}>
          <div className="config-card">
            <div className="config-icon">⭐</div>
            <div>
              <h2>Planos e lojas</h2>
              <p>Veja os planos, troque para a licença ou para o combo de mais de uma loja.</p>
              <strong>Ver os planos</strong>
            </div>
          </div>
        </a>
      )}

      {MULTI && souDono && (
        <Link to="/dono" style={{ textDecoration: "none" }}>
          <div className="config-card">
            <div className="config-icon">🏪</div>
            <div>
              <h2>Painel do Dono</h2>
              <p>Tem mais de uma loja? Veja cada uma e o total somado. Só com o login do dono, que não fica salvo.</p>
              <strong>Abrir o Painel do Dono</strong>
            </div>
          </div>
        </Link>
      )}

      {MULTI && souDono && <Equipe />}

      {souDono && <WhatsLojaConfig />}
      {souDono && <TaxasMaquininha />}

      {souDono && <CardapioOnlineConfig />}

      <Link to="/config/impressora" style={{ textDecoration: "none" }}>
        <div className="config-card">
          <div className="config-icon">🖨️</div>
          <div>
            <h2>Impressora</h2>
            <p>Comanda, comprovante e dados do estabelecimento.</p>
            <strong>Configurar impressora</strong>
          </div>
        </div>
      </Link>

      <SonsConfig />

      <div className="config-card">
        <div className="config-icon">🔔</div>
        <div>
          <h2>Notificações</h2>
          <p>Limpar notificações antigas do painel.</p>
          <button className="config-btn" onClick={limparNotificacoes}>
            Limpar notificações
          </button>
        </div>
      </div>

      <div className="config-card">
        <div className="config-icon">📱</div>
        <div>
          {MULTI ? (
            <>
              <h2>Instalar o app</h2>
              <p>Coloque o sistema na tela de início: abre como um app, num toque. Sistema de Mesas da IFTech.</p>
              {isInstalled() ? (
                <strong>Já instalado neste aparelho</strong>
              ) : (
                <button className="config-btn" onClick={() => setInstalarAberto(true)}>
                  Instalar o app
                </button>
              )}
            </>
          ) : (
            <>
              <h2>Aplicativo</h2>
              <p>Aplicativo Oficial da ByteForce.</p>
              <strong>{nomeLoja}</strong>
            </>
          )}
        </div>
      </div>
      {instalarAberto && <InstallModal onClose={() => setInstalarAberto(false)} />}

      <div className="config-card">
        <div className="config-icon">✅</div>
        <div>
          <h2>Status</h2>
          <p>Sistema em funcionamento.</p>
          <strong>Versão 2.0</strong>
        </div>
      </div>

      <div className="config-card">
        <div className="config-icon">🌙</div>
        <div style={{ flex: 1 }}>
          <h2>Tema Escuro</h2>
          <p>Ativar ou desativar o modo escuro.</p>
        </div>

        <label className="switch">
          <input
            type="checkbox"
            defaultChecked={localStorage.getItem("tema") === "dark"}
            onChange={(e) => {
              if (e.target.checked) {
                localStorage.setItem("tema", "dark");
                document.body.classList.add("dark");
              } else {
                localStorage.setItem("tema", "light");
                document.body.classList.remove("dark");
              }
            }}
          />
          <span className="slider"></span>
        </label>
      </div>

      {souDono && (
      <div className="config-card">
        <div className="config-icon">📊</div>
        <div style={{ flex: 1 }}>
          <h2>Fechamento do Dia</h2>
          <p>
            {encerrando
              ? "Encerrando... aguarde."
              : "Gerar relatório, salvar histórico e zerar estoque."}
          </p>
        </div>

        <label className="switch">
          <input
            type="checkbox"
            checked={modalEncerrarDia || encerrando}
            disabled={encerrando}
            onChange={(e) => {
              if (e.target.checked) {
                setModalEncerrarDia(true);
              }
            }}
          />
          <span className="slider"></span>
        </label>
      </div>
      )}

      {resumoDia && <ResumoDia resumo={resumoDia} loja={nomeLoja} onFechar={() => setResumoDia(null)} />}

      {modalEncerrarDia && souDono && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card">
            <div className="modal-fechar-dia-icone">⚠️</div>

            <h2>Encerrar o dia?</h2>

            <p>
              Isso vai fechar as mesas que ainda estão abertas (entram no total;
              o que não foi pago fica como "sem forma de pagamento"), salvar o
              relatório no histórico, zerar as vendas do dia, limpar o histórico
              das mesas, zerar o estoque e devolver as mesas à posição original.
            </p>

            <strong>Essa ação não pode ser desfeita.</strong>

            {caixaAberto && (
              <p className="modal-caixa-aviso">
                O caixa ainda está aberto. O certo é <Link to="/caixa">fechar o caixa</Link> (contar o dinheiro da gaveta) antes de encerrar o dia.
              </p>
            )}

            <div className="modal-fechar-dia-botoes">
              <button
                className="modal-btn-cancelar"
                disabled={encerrando}
                onClick={() => setModalEncerrarDia(false)}
              >
                Cancelar
              </button>

              <button
                className="modal-btn-confirmar"
                disabled={encerrando}
                onClick={confirmarEncerrarDia}
              >
                {encerrando ? "Encerrando..." : caixaAberto ? "Encerrar assim mesmo" : "Encerrar Dia"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="menu-inferior">
        <Link to="/" style={{ textDecoration: "none" }}>
          ▦
          <span>Painel</span>
        </Link>

        <Link to="/pedidos" style={{ textDecoration: "none" }}>
          ▤
          <span>Pedidos</span>
        </Link>

        <Link to="/mesas" style={{ textDecoration: "none" }}>
          ▥
          <span>Mesas</span>
        </Link>

        <Link to="/config" className="ativo" style={{ textDecoration: "none" }}>
          ⚙
          <span>Config.</span>
        </Link>
      </div>
    </div>
  );
}

export default Config;