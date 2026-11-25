// Foto do produto no cadastro (planos Completo e Premium): tirar foto ou escolher da galeria,
// trocar ou tirar. A foto é reduzida no celular antes de salvar (utils/fotos.js).
import { useRef, useState } from "react";
import { apagarFoto, prepararFoto, salvarFoto } from "../utils/fotos";
import "./FotoProduto.css";

export default function FotoProduto({ produto, foto }) {
  const entrada = useRef(null);
  const [estado, setEstado] = useState(""); // "", "salvando", ou a mensagem de erro
  const [tirar, setTirar] = useState(false);

  async function escolher(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEstado("salvando");
    try {
      await salvarFoto(produto.id, await prepararFoto(file));
      setEstado("");
    } catch (err) {
      setEstado(err?.message?.startsWith("Missing or insufficient") ? "Não foi possível salvar a foto." : err?.message || "Não foi possível salvar a foto.");
    }
  }

  return (
    <div className="foto-prod">
      <strong>Foto do produto</strong>
      <div className="foto-prod-linha">
        <div className="foto-prod-quadro">{foto ? <img src={foto} alt={produto.nome} /> : <span aria-hidden="true">📷</span>}</div>
        <div className="foto-prod-acoes">
          <button type="button" className="foto-prod-btn" disabled={estado === "salvando"} onClick={() => entrada.current?.click()}>
            {estado === "salvando" ? <><span className="girando" aria-hidden="true" />Salvando…</> : foto ? "Trocar foto" : "Pôr foto"}
          </button>
          {foto && !tirar && (
            <button type="button" className="foto-prod-tirar" onClick={() => setTirar(true)}>Tirar a foto</button>
          )}
          {foto && tirar && (
            <span className="foto-prod-confirma">
              Tirar? <button type="button" onClick={async () => { setTirar(false); await apagarFoto(produto.id).catch(() => setEstado("Não foi possível tirar a foto.")); }}>Sim</button>
              <button type="button" onClick={() => setTirar(false)}>Não</button>
            </span>
          )}
          <small>Aparece no cardápio do cliente (QR Code da mesa e cardápio online).</small>
        </div>
      </div>
      {estado && estado !== "salvando" && <p className="foto-prod-erro">{estado}</p>}
      <input ref={entrada} type="file" accept="image/*" hidden onChange={escolher} aria-label={`Foto de ${produto.nome}`} />
    </div>
  );
}
