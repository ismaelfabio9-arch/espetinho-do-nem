// Configurações → WhatsApp da loja: o número que aparece para o cliente no cardápio online e no QR da mesa.
import { useEffect, useState } from "react";
import { mostrarFone, numeroWhats, salvarWhatsLoja, useWhatsLoja } from "../utils/contato";

export default function WhatsLojaConfig() {
  const numero = useWhatsLoja();
  const [valor, setValor] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => setValor(numero ? mostrarFone(numero) : ""), [numero]);
  async function salvar() {
    if (valor.trim() && !numeroWhats(valor)) return setMsg("Informe o número com DDD.");
    try {
      await salvarWhatsLoja(valor);
      setMsg(valor.trim() ? "WhatsApp salvo!" : "WhatsApp removido.");
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
    setTimeout(() => setMsg(""), 2500);
  }
  return (
    <div className="config-card taxas-card">
      <div className="config-icon">💬</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2>WhatsApp da loja</h2>
        <p>Aparece para o cliente no cardápio online e no QR Code da mesa, para ele falar com a loja.</p>
        <div className="whats-loja-linha">
          <input aria-label="WhatsApp da loja" inputMode="tel" placeholder="(81) 9 9999-9999" maxLength={20} value={valor} onChange={(e) => setValor(e.target.value)} />
          <button type="button" className="btn-verde" onClick={salvar}>Salvar</button>
        </div>
        {msg && <strong>{msg}</strong>}
      </div>
    </div>
  );
}
