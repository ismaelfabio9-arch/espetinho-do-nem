// Painel do Dono: para quem tem 2 ou mais lojas do Sistema de Mesas (combo). Cada loja continua
// separada; aqui o dono vê cada uma e o total somado, sem calculadora. O login é só desta tela e
// fica na memória: saiu, fechou ou trocou de aba, o painel fecha e pede o login de novo.
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { authDono, dbDono, entrarDono, sairDono } from "../../donoAuth";
import PainelDonoVisao from "./PainelDonoVisao";
import "../../styles/Garcom/PainelDono.css";

export default function PainelDono() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState("");
  const [lojas, setLojas] = useState(null);
  const [periodo, setPeriodo] = useState("hoje");
  const [atualizadoEm, setAtualizadoEm] = useState("");

  // Sai do painel: encerra o login do dono (não fica salvo) e volta.
  const fechar = useCallback(() => {
    sairDono();
    setUser(null);
    setLojas(null);
  }, []);

  useEffect(() => onAuthStateChanged(authDono, (u) => setUser(u)), []);
  // Saiu da tela, trocou de aba ou fechou: o acesso acaba.
  useEffect(() => {
    const some = () => document.visibilityState === "hidden" && fechar();
    document.addEventListener("visibilitychange", some);
    window.addEventListener("pagehide", fechar);
    return () => {
      document.removeEventListener("visibilitychange", some);
      window.removeEventListener("pagehide", fechar);
      sairDono();
    };
  }, [fechar]);

  const carregar = useCallback(async (u) => {
    setErro("");
    setLojas(null);
    try {
      const email = String(u.email || "").toLowerCase();
      const snap = await getDocs(query(collection(dbDono, "mesasLojas"), where("memberEmails", "array-contains", email)));
      const minhas = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((l) => String(l.ownerEmail || "").toLowerCase() === email && l.active === true)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
      const comDados = await Promise.all(
        minhas.map(async (l) => {
          const [dias, hoje, abertos] = await Promise.all([
            getDocs(collection(dbDono, "mesasLojas", l.id, "relatorioGerencial")),
            getDocs(collection(dbDono, "mesasLojas", l.id, "vendasDia")),
            getDocs(collection(dbDono, "mesasLojas", l.id, "pedidos")).catch(() => ({ docs: [] })),
          ]);
          return { id: l.id, nome: l.name || "Loja", dias: dias.docs.map((d) => d.data()), hoje: hoje.docs.map((d) => d.data()), abertos: abertos.docs.map((d) => d.data()) };
        })
      );
      setLojas(comDados);
      setAtualizadoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      console.error("Painel do Dono:", e);
      setErro("Não foi possível carregar as lojas. Confira a internet e tente de novo.");
      setLojas([]);
    }
  }, []);

  useEffect(() => {
    if (user) carregar(user);
  }, [user, carregar]);

  async function entrar() {
    setEntrando(true);
    setErro("");
    try {
      await entrarDono();
    } catch (e) {
      if (e?.code !== "auth/popup-closed-by-user") setErro("Não deu para entrar. Abra no navegador (Chrome) e tente de novo.");
    }
    setEntrando(false);
  }

  return (
    <div className="container dono-pagina">
      <div className="no-print">
        <button type="button" className="voltar" onClick={() => { fechar(); navigate("/config"); }}>← Voltar</button>
      </div>

      {!user ? (
        <div className="dono-entrar">
          <div className="dono-icone" aria-hidden="true">🏪</div>
          <h1>Painel do Dono</h1>
          <p>Cada uma das suas lojas e o total somado, num lugar só. Só o dono entra, com a conta Google dele.</p>
          <p className="dono-aviso">🔒 O acesso não fica salvo neste aparelho: saiu desta tela, ele fecha.</p>
          <button type="button" className="dono-btn" onClick={entrar} disabled={entrando}>
            {entrando ? <><span className="girando" aria-hidden="true" />Entrando…</> : "Entrar com a conta do dono"}
          </button>
          {erro && <p className="dono-erro">{erro}</p>}
        </div>
      ) : !lojas ? (
        <p className="dono-carregando"><span className="if-carrega" aria-hidden="true"><i /></span>Carregando as lojas…</p>
      ) : lojas.length < 2 ? (
        <div className="dono-entrar">
          <div className="dono-icone" aria-hidden="true">🏪</div>
          <h1>Painel do Dono</h1>
          <p>
            {lojas.length === 0
              ? `Não achamos lojas no nome de ${user.email}.`
              : `O Painel do Dono é para quem tem 2 ou mais lojas. ${user.email} tem 1 loja.`}{" "}
            Para abrir outra loja com 20% de desconto, vá em Minha conta no site da IFTech.
          </p>
          {erro && <p className="dono-erro">{erro}</p>}
          <button type="button" className="dono-btn secundario" onClick={fechar}>Sair</button>
        </div>
      ) : (
        <PainelDonoVisao lojas={lojas} periodo={periodo} setPeriodo={setPeriodo} email={user.email} atualizadoEm={atualizadoEm} onAtualizar={() => carregar(user)} onPdf={() => window.print()} onSair={fechar} />
      )}
      {!user && <p className="dono-rodape no-print"><Link to="/config">Voltar para Configurações</Link></p>}
    </div>
  );
}
