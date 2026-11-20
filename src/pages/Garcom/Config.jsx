import { L, MULTI } from "../../loja";
import useNomeLoja from "../../hooks/useNomeLoja";
import Equipe from "../../components/Equipe";
import TaxasMaquininha from "../../components/TaxasMaquininha";
import CardapioOnlineConfig from "../../components/CardapioOnlineConfig";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
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
import { planoQueLibera, useRecurso } from "../../recursos";

// Prato montado ("Peito empanado — feijão preto, …") conta no relatório como o prato.
const nomeProduto = (item) => item.nomeBase || String(item.nome || "").split(" — ")[0];


function Config() {
  const relatoriosLigado = useRecurso("relatorios");
  const nomeLoja = useNomeLoja();
  const [instalarAberto, setInstalarAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [encerrando, setEncerrando] = useState(false);
  const [modalEncerrarDia, setModalEncerrarDia] = useState(false);

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

  async function confirmarEncerrarDia() {
    setEncerrando(true);

    try {
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

      mostrarMensagem("✅ Dia encerrado com sucesso! Estoque zerado.");
      setModalEncerrarDia(false);
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
          <p>Gerencie opções básicas do aplicativo.</p>
        </div>
      </div>

      {novidadesEmTeste && (
        <p className="config-beta" style={{ margin: "0 0 14px", padding: "10px 14px", borderRadius: 12, background: "#dcfce7", color: "#14532d", fontWeight: 700, fontSize: 14 }}>
          ✨ Sua loja recebe as novidades em teste antes das outras.
        </p>
      )}

      <Link to="/historico" style={{ textDecoration: "none" }}>
        <div className="config-card">
          <div className="config-icon">📋</div>
          <div>
            <h2>Histórico dos dias</h2>
            <p>Fechamentos de cada dia, separados em mesas, balcão e entregas.</p>
            <strong>Abrir histórico</strong>
          </div>
        </div>
      </Link>

      <Link to="/historico-mesas" style={{ textDecoration: "none" }}>
        <div className="config-card">
          <div className="config-icon">🍽️</div>
          <div>
            <h2>Histórico de pedidos</h2>
            <p>Pedidos finalizados hoje: mesas, balcão e entregas separados.</p>
            <strong>Abrir histórico de pedidos</strong>
          </div>
        </div>
      </Link>

      <Link to="/relatorio" style={{ textDecoration: "none" }}>
        <div className="config-card">
          <div className="config-icon">📈</div>
          <div>
            <h2>Relatório Gerencial</h2>
            <p>Tudo junto: mesas, balcão e entregas por período, produtos vendidos e PDF.</p>
            <strong>{relatoriosLigado ? "Abrir relatório" : planoQueLibera("relatorios") ? `Disponível no plano ${planoQueLibera("relatorios")}` : "Função desligada"}</strong>
          </div>
        </div>
      </Link>

      {MULTI && <Equipe />}

      <TaxasMaquininha />

      <CardapioOnlineConfig />

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

      {modalEncerrarDia && (
        <div className="modal-fechar-dia">
          <div className="modal-fechar-dia-card">
            <div className="modal-fechar-dia-icone">⚠️</div>

            <h2>Encerrar o dia?</h2>

            <p>
              Isso vai salvar o relatório no histórico, zerar as vendas do dia,
              limpar o histórico das mesas, zerar o estoque e devolver as mesas
              à posição original.
            </p>

            <strong>Essa ação não pode ser desfeita.</strong>

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
                {encerrando ? "Encerrando..." : "Encerrar Dia"}
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