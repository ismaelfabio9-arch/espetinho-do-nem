// Tela enquanto o sistema abre (login e dados da loja): a cara da IFTech em vez da tela branca.
import "./Abrindo.css";

const escuro = () => {
  try {
    return localStorage.getItem("tema") === "dark";
  } catch {
    return false;
  }
};

export default function Abrindo({ texto = "Abrindo o sistema…" }) {
  return (
    <div className={`abrindo ${escuro() ? "escuro" : ""}`} role="status" aria-live="polite">
      <img src={`${process.env.PUBLIC_URL || ""}/logo192.png`} alt="" className="abrindo-logo" width="96" height="96" />
      <strong>Sistema de Mesas</strong>
      <span className="abrindo-marca">IFTech</span>
      <span className="abrindo-roda" aria-hidden="true" />
      <small>{texto}</small>
    </div>
  );
}
