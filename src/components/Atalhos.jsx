// Atalhos de teclado para quem usa o sistema no computador.
// Os botões marcam o próprio atalho com data-atalho="F8" (por exemplo); aqui só se procura o botão
// visível com aquela tecla e se clica nele. Se houver uma janela aberta, vale o botão da janela.
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";
import { useRecurso } from "../recursos";

export const LISTA_ATALHOS = [
  ["Esc", "Fecha a janela aberta; sem janela, volta para o início"],
  ["F1", "Imprimir (comanda da mesa ou pedido na cozinha)"],
  ["F2", "Novo pedido (mesa, balcão ou entrega)"],
  ["F3", "Buscar produto ou pedido"],
  ["F4", "Ver os pedidos"],
  ["F8", "Salvar o pedido"],
  ["F9", "Fechar a conta da mesa"],
  ["M", "Abre a primeira mesa livre"],
  ["B", "Pedido no balcão"],
  ["E", "Pedido de entrega"],
  ["1 · 2 · 3", "No novo pedido: Mesa, Balcão ou Entrega"],
  ["?", "Mostrar esta lista"],
];

const JANELAS = ".modal-overlay, .modal-fechar-dia, .montar-fundo, .estoque-modal-fundo, .menu-overlay, .atalhos-fundo";
const FECHAR = ".modal-btn-cancelar, .modal-btn.cancelar, .estoque-modal-cancelar, .prod-ficha-x, [data-fechar]";

const visivel = (el) => !!el && el.getClientRects().length > 0 && !el.disabled;
const digitando = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function janelaDeCima() {
  const todas = [...document.querySelectorAll(JANELAS)].filter(visivel);
  return todas[todas.length - 1] || null;
}

function alvo(tecla) {
  const janela = janelaDeCima();
  const lista = [...document.querySelectorAll(`[data-atalho="${tecla}"]`)].filter(visivel);
  if (janela) {
    // A gaveta do menu fica ao lado do fundo escuro, não dentro dele.
    const area = janela.classList.contains("menu-overlay") ? janela.parentElement : janela;
    return lista.find((b) => area.contains(b)) || null;
  }
  return lista.find((b) => !b.closest(JANELAS)) || null;
}

/** Menor número de mesa sem pedido. */
async function primeiraMesaLivre() {
  const [mesas, pedidos] = await Promise.all([getDocs(collection(db, ...L(), "mesas")), getDocs(collection(db, ...L(), "pedidos"))]);
  const ocupadas = new Set();
  pedidos.docs.forEach((d) => {
    const p = d.data();
    if (p.tipo === "mesa" && p.mesa != null) ocupadas.add(Number(p.mesa));
  });
  let numeros = mesas.docs.map((d) => Number(d.data().numero ?? d.id)).filter((n) => Number.isFinite(n) && n > 0);
  if (!numeros.length) numeros = Array.from({ length: 15 }, (_, i) => i + 1);
  return numeros.sort((a, b) => a - b).find((n) => !ocupadas.has(n)) ?? null;
}

export default function Atalhos() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [ajuda, setAjuda] = useState(false);
  const [aviso, setAviso] = useState("");
  const viagemLigado = useRecurso("viagem");

  useEffect(() => {
    const abrir = () => setAjuda(true);
    window.addEventListener("abrir-atalhos", abrir);
    return () => window.removeEventListener("abrir-atalhos", abrir);
  }, []);

  useEffect(() => {
    let t;
    const avisar = (texto) => {
      setAviso(texto);
      clearTimeout(t);
      t = setTimeout(() => setAviso(""), 2200);
    };

    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const k = e.key;
      const ehF = /^F\d{1,2}$/.test(k);
      const escrevendo = digitando(document.activeElement);
      if (escrevendo && !ehF && k !== "Escape") return;

      if (k === "Escape") {
        if (ajuda) return setAjuda(false);
        const janela = janelaDeCima();
        if (janela) {
          e.preventDefault();
          const area = janela.classList.contains("menu-overlay") ? janela.parentElement : janela;
          const fechar = [...area.querySelectorAll(FECHAR)].find(visivel);
          (fechar || janela).click();
          return;
        }
        if (escrevendo) return document.activeElement.blur();
        if (pathname !== "/") navigate("/");
        return;
      }

      if (k === "?") {
        e.preventDefault();
        return setAjuda((v) => !v);
      }
      if (k === "F2") {
        e.preventDefault();
        if (pathname !== "/novo") navigate("/novo");
        return;
      }
      if (k === "F3") {
        e.preventDefault();
        const busca = [...document.querySelectorAll('.rapido-busca, .prod-busca, .campo-busca, input[type="search"]')].find(visivel);
        if (busca) {
          busca.focus();
          busca.select?.();
        } else avisar("Esta tela não tem busca.");
        return;
      }
      const letra = k.length === 1 ? k.toLowerCase() : "";
      if (!escrevendo && !janelaDeCima() && (letra === "b" || letra === "e")) {
        e.preventDefault();
        if (!viagemLigado) return avisar("Balcão e entrega não estão no plano desta loja.");
        navigate(`/novo?aba=${letra === "b" ? "balcao" : "entrega"}`);
        return;
      }
      if (!escrevendo && !janelaDeCima() && letra === "m") {
        e.preventDefault();
        primeiraMesaLivre()
          .then((n) => (n ? navigate(`/mesa/${n}`) : avisar("Todas as mesas estão ocupadas.")))
          .catch(() => avisar("Sem conexão para ver as mesas."));
        return;
      }
      if (k === "F4") {
        e.preventDefault();
        if (pathname !== "/pedidos") navigate("/pedidos");
        return;
      }

      const botao = alvo(k);
      if (botao) {
        e.preventDefault();
        botao.click();
      } else if (["F1", "F8", "F9"].includes(k)) {
        e.preventDefault();
        avisar({ F1: "Nada para imprimir nesta tela.", F8: "Nada para salvar nesta tela.", F9: "Abra uma mesa para fechar a conta." }[k]);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [ajuda, navigate, pathname, viagemLigado]);

  return (
    <>
      {aviso && <div className="atalho-aviso" role="status">{aviso}</div>}
      {ajuda && (
        <div className="atalhos-fundo" onClick={() => setAjuda(false)}>
          <div className="atalhos-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Atalhos do teclado">
            <div className="atalhos-topo">
              <h2>⌨️ Atalhos do teclado</h2>
              <button type="button" data-fechar onClick={() => setAjuda(false)} aria-label="Fechar">✕</button>
            </div>
            <ul>
              {LISTA_ATALHOS.map(([tecla, texto]) => (
                <li key={tecla}>
                  <kbd>{tecla}</kbd>
                  <span>{texto}</span>
                </li>
              ))}
            </ul>
            <p>Os botões que têm atalho mostram a tecla ao lado do nome.</p>
          </div>
        </div>
      )}
    </>
  );
}
