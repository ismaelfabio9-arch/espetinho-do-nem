// Configurações → Sons dos avisos: ouvir cada som e ligar/desligar neste aparelho.
import { useState } from "react";
import { SONS, ligarSons, pararSom, sonsLigados, tocarSom } from "../utils/sons";

export default function SonsConfig() {
  const [ligado, setLigado] = useState(sonsLigados);
  const [tocando, setTocando] = useState("");
  const ouvir = async (som) => {
    pararSom();
    setTocando(som);
    await tocarSom(som, { vezes: 1, forcar: true });
    setTocando((t) => (t === som ? "" : t));
  };
  return (
    <div className="config-card sons-card">
      <div className="config-icon">🔊</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2>Sons dos avisos</h2>
        <p>Um som para cada tipo de aviso.</p>
        <label className="sons-ligar">
          <input
            type="checkbox"
            checked={ligado}
            onChange={(e) => {
              ligarSons(e.target.checked);
              setLigado(e.target.checked);
            }}
          />{" "}
          Tocar som neste aparelho
        </label>
        <ul className="sons-lista">
          {Object.entries(SONS).map(([id, s]) => (
            <li key={id}>
              <span>{s.nome}</span>
              <button type="button" className="config-btn" onClick={() => ouvir(id)} aria-label={`Ouvir: ${s.nome}`}>
                {tocando === id ? "Tocando…" : "Ouvir"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
