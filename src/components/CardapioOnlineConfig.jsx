// Configurações → Cardápio online (plano Premium): o dono liga o recebimento de pedidos de casa,
// põe a taxa de entrega (fixa) e se aceita retirada no balcão. Mostra o link e o QR Code para divulgar.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cardapioOnlineUrl } from "../loja";
import { planoQueLibera, useRecurso } from "../recursos";
import { moeda, salvarEntrega, useEntrega } from "../utils/entrega";

export default function CardapioOnlineConfig() {
  const ligadoNoPlano = useRecurso("pedido-online");
  const entrega = useEntrega();
  const [form, setForm] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState("");
  const [qr, setQr] = useState("");
  const url = cardapioOnlineUrl();
  useEffect(() => {
    if (!aberto) setForm({ ligado: entrega.ligado, taxa: entrega.taxa ? moeda(entrega.taxa) : "", retirada: entrega.retirada });
  }, [entrega, aberto]);
  useEffect(() => {
    if (url && ligadoNoPlano) QRCode.toDataURL(url, { margin: 1, width: 360 }).then(setQr, () => setQr(""));
  }, [url, ligadoNoPlano]);
  if (!url) return null;
  if (!ligadoNoPlano) {
    const plano = planoQueLibera("pedido-online");
    return (
      <div className="config-card">
        <div className="config-icon">🛵</div>
        <div>
          <h2>Cardápio online</h2>
          <p>O cliente pede de casa, para entrega ou retirada, e o pedido cai aqui no sistema.</p>
          <strong>{plano ? `Disponível no plano ${plano}` : "Fale com a IFTech para ligar"}</strong>
        </div>
      </div>
    );
  }
  async function salvar() {
    try {
      await salvarEntrega(form);
      setMsg("Cardápio online salvo!");
      setAberto(false);
    } catch {
      setMsg("Não foi possível salvar. Confira a internet.");
    }
    setTimeout(() => setMsg(""), 2500);
  }
  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Link copiado!");
    } catch {
      setMsg(url);
    }
    setTimeout(() => setMsg(""), 3000);
  }
  return (
    <div className="config-card taxas-card">
      <div className="config-icon">🛵</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2>Cardápio online</h2>
        <p>
          {entrega.ligado
            ? `Recebendo pedidos de casa · entrega R$ ${moeda(entrega.taxa)}${entrega.retirada ? " · retirada no balcão" : ""}`
            : "Desligado: o link mostra que a loja não está recebendo pedidos agora."}
        </p>
        {!aberto ? (
          <button type="button" className="taxas-editar" onClick={() => setAberto(true)}>
            Configurar
          </button>
        ) : (
          <div className="taxas-form">
            <label className="taxas-passar">
              <input type="checkbox" checked={form.ligado} onChange={(e) => setForm({ ...form, ligado: e.target.checked })} />
              Receber pedidos de casa agora
            </label>
            <div className="taxas-linha">
              <label>
                Taxa de entrega (R$)
                <input inputMode="decimal" placeholder="Ex.: 5,00" value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} />
              </label>
            </div>
            <label className="taxas-passar">
              <input type="checkbox" checked={form.retirada} onChange={(e) => setForm({ ...form, retirada: e.target.checked })} />
              Aceitar retirada no balcão (sem taxa)
            </label>
            <p className="taxas-ajuda">O cliente paga na entrega (dinheiro, Pix ou cartão). O pedido aparece em Pedidos, com o aviso de pedido novo.</p>
            <div className="taxas-botoes">
              <button type="button" onClick={() => setAberto(false)}>Cancelar</button>
              <button type="button" className="btn-verde" onClick={salvar}>Salvar</button>
            </div>
          </div>
        )}
        <div className="online-link">
          <p className="online-url">{url}</p>
          <div className="taxas-botoes">
            <button type="button" onClick={copiar}>Copiar link</button>
            <a href={url} target="_blank" rel="noreferrer" className="online-abrir">Abrir</a>
          </div>
          {qr && <img src={qr} alt="QR Code do cardápio online" className="online-qr" />}
        </div>
        {msg && <strong className="taxas-msg">{msg}</strong>}
      </div>
    </div>
  );
}
