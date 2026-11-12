// Sistema de Mesas da IFTech: as telas da equipe só abrem com login e com a loja no ar.
import { useEffect, useState } from "react";
import { setLoja } from "../loja";
import { entrarComGoogle, escolherLoja, getTenant, iniciarLogin, sair, subscribeTenant } from "../tenant";

const caixa = { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "#f4f5f7", fontFamily: "system-ui, sans-serif" };
const card = { width: "100%", maxWidth: 380, background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 6px 24px rgba(0,0,0,.08)", textAlign: "center", color: "#111" };
const botao = { display: "block", width: "100%", height: 48, marginTop: 16, borderRadius: 10, border: "none", background: "#e11d48", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer" };
const link = { display: "block", marginTop: 14, color: "#555", fontSize: 14 };

export default function LojaGate({ children }) {
  const [t, setT] = useState(getTenant());
  useEffect(() => {
    iniciarLogin();
    return subscribeTenant(setT);
  }, []);

  if (t.status === "ready") return children;
  if (t.status === "loading") return <div style={caixa}><p>Carregando…</p></div>;

  return (
    <div style={caixa}>
      <div style={card}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Sistema de Mesas</h1>
        {t.status === "signed-out" && (
          <>
            <p style={{ color: "#555" }}>Entre com a conta Google cadastrada na sua loja.</p>
            <button style={botao} onClick={() => entrarComGoogle()}>Entrar com Google</button>
            {t.error && <p style={{ color: "#b91c1c" }}>{t.error}</p>}
            <a style={link} href="/sistemas/espetinho">Ainda não tem? Conheça o Sistema de Mesas</a>
          </>
        )}
        {t.status === "no-store" && (
          <>
            <p style={{ color: "#555" }}>
              A conta {t.user?.email || ""} não está em nenhuma loja do Sistema de Mesas. Peça ao dono da loja para cadastrar o seu e-mail
              em Configurações → Equipe, ou crie a sua loja.
            </p>
            <a style={{ ...botao, lineHeight: "48px", textDecoration: "none" }} href="/ativar/espetinho">Criar minha loja</a>
            <button style={{ ...botao, background: "#eee", color: "#111" }} onClick={() => sair()}>Entrar com outra conta</button>
          </>
        )}
        {t.status === "blocked" && (
          <>
            <p style={{ color: "#555" }}>
              A loja {t.loja?.name ? `“${t.loja.name}” ` : ""}está fora do ar. Se for a primeira mensalidade ou uma fatura em atraso, ela volta
              assim que o pagamento for confirmado.
            </p>
            <a style={{ ...botao, lineHeight: "48px", textDecoration: "none" }} href="/conta">Ver em Minha conta</a>
            <button style={{ ...botao, background: "#eee", color: "#111" }} onClick={() => sair()}>Sair</button>
          </>
        )}
        {t.status === "choose" && (
          <>
            <p style={{ color: "#555" }}>Escolha a loja:</p>
            {t.lojas.map((l) => (
              <button key={l.id} style={{ ...botao, background: "#fff", color: "#111", border: "1px solid #ddd" }} onClick={() => escolherLoja(l.id)}>
                {l.name || "Loja"}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Rota do cliente da mesa: o id da loja vem no endereço (/mesas/c/<loja>/mesa-cliente/<n>). */
export function LojaDoEndereco({ id, children }) {
  setLoja(id);
  return children;
}
