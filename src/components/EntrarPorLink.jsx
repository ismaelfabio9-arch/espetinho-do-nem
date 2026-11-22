// /mesas/entrar#<código>: o cliente que não tem acesso ao e-mail entra pelo link que a IFTech mandou no
// WhatsApp. O link vale uma vez; depois, este celular fica entrado na loja.
import { useEffect, useState } from "react";
import { entrarComLink } from "../tenant";
import Abrindo from "./Abrindo";

export default function EntrarPorLink() {
  const [erro, setErro] = useState("");
  useEffect(() => {
    const token = window.location.hash.replace(/^#/, "").trim();
    // Tira o código do endereço (não fica no histórico nem é compartilhado sem querer).
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setErro("Este link está incompleto. Peça um novo para a IFTech.");
      return;
    }
    entrarComLink(token).then(
      () => window.location.replace(`${process.env.PUBLIC_URL || ""}/`),
      (e) => setErro(e?.message || "Não foi possível entrar. Peça um novo link para a IFTech.")
    );
  }, []);
  if (!erro) return <Abrindo texto="Entrando na sua loja…" />;
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 360, textAlign: "center" }}>
        <h1 style={{ fontSize: 22 }}>Não deu para entrar</h1>
        <p style={{ color: "#555" }}>{erro}</p>
        <a href={`${process.env.PUBLIC_URL || ""}/`} style={{ color: "#16a34a", fontWeight: 700 }}>Ir para o início</a>
      </div>
    </div>
  );
}
