import { useEffect, useState } from "react";

// Controles da demonstração no mesmo modelo do Delivery: não ocupa espaço na tela.
// Um botão pequeno no canto abre uma janelinha com o aviso, os atalhos, a contratação,
// "Recomeçar" e "Sair da demonstração". O sistema por baixo é o mesmo da loja de verdade.
const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const BLUE = "#1d4ed8";

export function DemoPill({ titulo, intro, atalhos = [], contratar, sair, onRecomecar, distanciaDoFundo = 16 }) {
  const [aberto, setAberto] = useState(false);
  const [recomecando, setRecomecando] = useState(false);

  useEffect(() => {
    if (!aberto) return undefined;
    const esc = (e) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);

  async function recomecar() {
    setRecomecando(true);
    const ok = await onRecomecar();
    if (ok === false) setRecomecando(false);
  }

  const rotulo = { margin: "18px 0 8px", fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#9ca3af" };
  const atalho = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "13px 14px", border: "1px solid #e5e7eb", borderRadius: 12, color: "#111827", textDecoration: "none", font: `600 14.5px ${FONT}`, background: "#fafafa" };
  const discreto = { border: 0, background: "transparent", color: "#6b7280", font: `600 13px ${FONT}`, textDecoration: "underline", cursor: "pointer", padding: 4 };

  return (
    <>
      {aberto && (
        <div data-demo="" role="dialog" aria-label="Opções da demonstração" style={{ position: "fixed", inset: 0, zIndex: 2147483000, fontFamily: FONT }}>
          <div onClick={() => setAberto(false)} style={{ position: "absolute", inset: 0, background: "rgba(10,12,20,.55)", backdropFilter: "blur(2px)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, margin: "0 auto", width: "100%", maxWidth: 520, maxHeight: "88vh", overflow: "auto", background: "#fff", color: "#111827", borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 40px rgba(0,0,0,.3)", padding: "18px 18px calc(18px + env(safe-area-inset-bottom,0px))", boxSizing: "border-box", textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.01em", color: "#111827" }}>{titulo}</div>
                <div style={{ marginTop: 3, fontSize: 13, lineHeight: 1.45, color: "#6b7280" }}>{intro}</div>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setAberto(false)} style={{ flex: "none", width: 34, height: 34, borderRadius: "50%", border: 0, background: "#f3f4f6", color: "#374151", fontSize: 18, lineHeight: 1, cursor: "pointer" }}>
                ✕
              </button>
            </div>

            {atalhos.length > 0 && (
              <>
                <div style={rotulo}>Ir para</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {atalhos.map((a) => (
                    <a key={a.texto} href={a.href} target={a.novaAba ? "_blank" : undefined} rel={a.novaAba ? "noopener" : undefined} onClick={() => setAberto(false)} style={atalho}>
                      {a.texto}
                      <span style={{ color: "#9ca3af", fontSize: 18, lineHeight: 1 }}>›</span>
                    </a>
                  ))}
                </div>
              </>
            )}

            <a href={contratar.href} style={{ display: "block", marginTop: 20, textAlign: "center", padding: 14, borderRadius: 12, background: BLUE, color: "#fff", textDecoration: "none", font: `700 15px ${FONT}` }}>
              {contratar.texto}
            </a>
            <div style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 14 }}>
              <button type="button" onClick={recomecar} disabled={recomecando} style={discreto}>
                {recomecando ? "Recomeçando…" : "Recomeçar"}
              </button>
              <a href={sair} style={discreto}>
                Sair da demonstração
              </a>
            </div>
            <div style={{ marginTop: 12, textAlign: "center", fontSize: 11.5, color: "#9ca3af" }}>Dados de exemplo · tudo fica só neste aparelho</div>
          </div>
        </div>
      )}
      {!aberto && (
        <button
          type="button"
          data-demo=""
          aria-haspopup="dialog"
          onClick={() => setAberto(true)}
          style={{ position: "fixed", left: 12, bottom: `calc(${distanciaDoFundo}px + env(safe-area-inset-bottom,0px))`, zIndex: 2147482999, display: "flex", alignItems: "center", gap: 8, background: "rgba(17,24,39,.92)", color: "#fff", border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, padding: "9px 14px 9px 12px", font: `600 13px ${FONT}`, boxShadow: "0 6px 20px rgba(0,0,0,.3)", cursor: "pointer" }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa", boxShadow: "0 0 0 3px rgba(96,165,250,.3)" }} />
          <span>Demonstração</span>
        </button>
      )}
    </>
  );
}
