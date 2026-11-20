// Configurações → Taxas da maquininha: o dono põe a taxa do débito e do crédito à vista e escolhe
// se passa para o cliente. No fechamento da mesa o sistema já mostra o valor certo no cartão.
import { useEffect, useState } from "react";
import { salvarTaxas, useTaxas } from "../utils/taxas";

export default function TaxasMaquininha() {
  const taxas = useTaxas();
  const [form, setForm] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!aberto) setForm({ debito: taxas.debito ? String(taxas.debito).replace(".", ",") : "", credito: taxas.credito ? String(taxas.credito).replace(".", ",") : "", passarDebito: taxas.passarDebito, passarCredito: taxas.passarCredito });
  }, [taxas, aberto]);
  if (!form) return null;
  const resumo =
    taxas.debito || taxas.credito
      ? `Débito ${String(taxas.debito).replace(".", ",")}%${taxas.passarDebito ? " (cliente paga)" : ""} · Crédito ${String(taxas.credito).replace(".", ",")}%${taxas.passarCredito ? " (cliente paga)" : ""}`
      : "Nenhuma taxa cadastrada.";
  async function salvar() {
    try {
      await salvarTaxas(form);
      setMsg("Taxas salvas!");
      setAberto(false);
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
    setTimeout(() => setMsg(""), 2500);
  }
  return (
    <div className="config-card taxas-card">
      <div className="config-icon">💳</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2>Taxas da maquininha</h2>
        <p>{resumo}</p>
        {!aberto ? (
          <button type="button" className="taxas-editar" onClick={() => setAberto(true)}>
            Configurar taxas
          </button>
        ) : (
          <div className="taxas-form">
            {[
              ["debito", "passarDebito", "Débito"],
              ["credito", "passarCredito", "Crédito à vista"],
            ].map(([campo, passar, rotulo]) => (
              <div key={campo} className="taxas-linha">
                <label>
                  {rotulo} (%)
                  <input inputMode="decimal" placeholder="Ex.: 1,99" value={form[campo]} onChange={(e) => setForm({ ...form, [campo]: e.target.value })} />
                </label>
                <label className="taxas-passar">
                  <input type="checkbox" checked={form[passar]} onChange={(e) => setForm({ ...form, [passar]: e.target.checked })} />
                  Passar para o cliente
                </label>
              </div>
            ))}
            <p className="taxas-ajuda">
              Marcado: no fechamento da mesa o total no cartão já sobe o necessário para você receber o valor da conta inteiro. Desmarcado: a loja paga a taxa. O cliente vê o aviso no cardápio do QR Code e a taxa separada no comprovante.
            </p>
            <div className="taxas-botoes">
              <button type="button" onClick={() => setAberto(false)}>Cancelar</button>
              <button type="button" className="btn-verde" onClick={salvar}>Salvar</button>
            </div>
          </div>
        )}
        {msg && <strong className="taxas-msg">{msg}</strong>}
      </div>
    </div>
  );
}
