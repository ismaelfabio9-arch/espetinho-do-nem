// Sistema de Mesas da IFTech: o dono cadastra o e-mail Google de cada garçom.
import { useEffect, useState } from "react";
import { getTenant, mesasApi, sair, subscribeTenant } from "../tenant";

export default function Equipe() {
  const [t, setT] = useState(getTenant());
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeTenant(setT), []);
  const loja = t.loja;
  if (!loja) return null;
  const eu = (t.user?.email || "").toLowerCase();
  const dono = String(loja.ownerEmail || "").toLowerCase();
  const souDono = eu === dono;

  async function mudar(corpo) {
    setBusy(true);
    setMsg("");
    try {
      await mesasApi("_membros", corpo);
      setEmail("");
      setMsg("Pronto!");
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="config-card" style={{ display: "block", textAlign: "left" }}>
      <h3 style={{ margin: "0 0 6px" }}>👥 Equipe</h3>
      <p style={{ margin: "0 0 10px", fontSize: 14, opacity: 0.8 }}>
        Quem entra no sistema da loja {loja.name ? `“${loja.name}”` : ""} com a conta Google.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {(loja.memberEmails || []).map((m) => (
          <li key={m} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid rgba(0,0,0,.08)", fontSize: 14 }}>
            <span style={{ wordBreak: "break-all" }}>
              {m} {m === dono ? "(dono)" : ""}
            </span>
            {souDono && m !== dono && (
              <button disabled={busy} onClick={() => mudar({ remove: m })} style={{ border: "none", background: "none", color: "#b91c1c" }}>
                Remover
              </button>
            )}
          </li>
        ))}
      </ul>
      {souDono && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) mudar({ add: email.trim() });
          }}
          style={{ display: "flex", gap: 8, marginTop: 10 }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e-mail Google do garçom"
            style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 8, border: "1px solid #ccc", padding: "0 10px" }}
          />
          <button disabled={busy} style={{ height: 40, padding: "0 14px", borderRadius: 8, border: "none", background: "#e11d48", color: "#fff", fontWeight: 600 }}>
            Adicionar
          </button>
        </form>
      )}
      {msg && <p style={{ fontSize: 13, marginTop: 8 }}>{msg}</p>}
      <p style={{ fontSize: 13, marginTop: 12, opacity: 0.8 }}>
        Conectado como {eu}.{" "}
        <button onClick={() => sair()} style={{ border: "none", background: "none", color: "#e11d48", padding: 0, textDecoration: "underline" }}>
          Sair
        </button>
      </p>
    </div>
  );
}
