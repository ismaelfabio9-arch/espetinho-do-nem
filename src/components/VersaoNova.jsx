// O app instalado no celular fica aberto na memória: ao voltar para ele, o celular mostra a versão
// que já estava carregada. Aqui o app confere se saiu versão nova (ao voltar para a tela e a cada
// 5 minutos). No painel, onde não há pedido sendo lançado, atualiza sozinho; nas outras telas
// mostra um aviso para atualizar com um toque, sem perder o pedido que está sendo lançado.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const BASE = process.env.PUBLIC_URL || "";
const PADRAO = /static\/js\/main\.[0-9a-f]+\.js/;

function versaoAtual() {
  const s = [...document.scripts].map((x) => x.src || "").find((src) => PADRAO.test(src));
  return s ? s.match(PADRAO)[0] : null;
}

async function versaoNoServidor() {
  const r = await fetch(`${BASE}/?versao=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) return null;
  const m = (await r.text()).match(PADRAO);
  return m ? m[0] : null;
}

// Telas sem nada sendo digitado: pode recarregar sem perguntar.
const SEGURAS = /^\/(|mesas|pedidos|historico|historico-mesas|relatorio|notificacoes|config)\/?$/;

export default function VersaoNova() {
  const { pathname } = useLocation();
  const [nova, setNova] = useState(false);

  useEffect(() => {
    const atual = versaoAtual();
    if (!atual) return undefined; // demonstração e modo de desenvolvimento: sem conferência
    let parado = false;
    async function conferir() {
      if (document.visibilityState !== "visible") return;
      try {
        const servidor = await versaoNoServidor();
        if (!parado && servidor && servidor !== atual) setNova(true);
      } catch {
        /* sem internet: confere de novo depois */
      }
    }
    conferir();
    const timer = setInterval(conferir, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", conferir);
    window.addEventListener("focus", conferir);
    return () => {
      parado = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", conferir);
      window.removeEventListener("focus", conferir);
    };
  }, []);

  useEffect(() => {
    if (nova && SEGURAS.test(pathname)) window.location.reload();
  }, [nova, pathname]);

  if (!nova || SEGURAS.test(pathname)) return null;
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", top: "calc(10px + env(safe-area-inset-top, 0px))", zIndex: 99999, background: "#16a34a", color: "#fff", border: 0, borderRadius: 999, padding: "10px 18px", font: "700 14px system-ui, sans-serif", boxShadow: "0 8px 24px rgba(0,0,0,.35)", cursor: "pointer", whiteSpace: "nowrap" }}
    >
      ✨ Versão nova do sistema · Atualizar
    </button>
  );
}
