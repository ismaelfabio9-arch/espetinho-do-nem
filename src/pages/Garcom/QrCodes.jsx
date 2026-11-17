// Sistema de Mesas da IFTech: QR Code de cada mesa, para imprimir e colar na mesa.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import QRCode from "qrcode";
import { db } from "../../firebase";
import { L, mesaUrl } from "../../loja";

export default function QrCodes() {
  const [numeros, setNumeros] = useState([]);
  const [imagens, setImagens] = useState({});

  useEffect(
    () =>
      onSnapshot(collection(db, ...L(), "mesas"), (snap) => {
        const lista = snap.docs.map((d) => Number(d.data().numero || d.id)).filter((n) => Number.isInteger(n) && n > 0);
        setNumeros([...new Set(lista)].sort((a, b) => a - b));
      }),
    []
  );

  useEffect(() => {
    let vivo = true;
    Promise.all(numeros.map(async (n) => [n, await QRCode.toDataURL(mesaUrl(n), { margin: 1, width: 360 })])).then(
      (pares) => vivo && setImagens(Object.fromEntries(pares))
    );
    return () => {
      vivo = false;
    };
  }, [numeros]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", color: "#111", background: "#fff", minHeight: "100dvh" }}>
      <div className="no-print" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <Link to="/mesas">← Voltar</Link>
        <h1 style={{ fontSize: 20, margin: 0, flex: 1 }}>QR Codes das mesas</h1>
        <button onClick={() => window.print()} style={{ height: 40, padding: "0 16px", borderRadius: 8, border: "none", background: "#e11d48", color: "#fff", fontWeight: 600 }}>
          Imprimir
        </button>
      </div>
      <p className="no-print" style={{ color: "#555", fontSize: 14 }}>
        Cole cada QR Code na sua mesa. O cliente aponta a câmera do celular, vê o cardápio, faz o pedido, chama o garçom e pede a conta.
        Para ter mais mesas, crie em Mesas.
      </p>
      {numeros.length === 0 && <p>Nenhuma mesa ainda. Crie as mesas em Mesas.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
        {numeros.map((n) => (
          <div key={n} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, textAlign: "center", breakInside: "avoid" }}>
            <strong style={{ fontSize: 22 }}>Mesa {n}</strong>
            {imagens[n] ? <img src={imagens[n]} alt={`QR Code da mesa ${n}`} style={{ width: "100%", marginTop: 8 }} /> : <p>Gerando…</p>}
            <p style={{ fontSize: 12, color: "#555", margin: "6px 0 0" }}>Aponte a câmera para pedir</p>
            <button
              className="no-print"
              onClick={() => navigator.clipboard?.writeText(mesaUrl(n))}
              style={{ marginTop: 8, height: 32, padding: "0 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
            >
              Copiar link
            </button>
          </div>
        ))}
      </div>
      <style>{"@media print { .no-print { display: none !important } }"}</style>
    </div>
  );
}
