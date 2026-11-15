// Primeira entrada numa loja criada pelo site da IFTech: o Ifo "termina de montar" a loja, com o
// nome (e a logo, se houver) dela, e some sozinho. Uma vez por aparelho, só nos primeiros 7 dias.
// Sem React de propósito: o mesmo arquivo serve ao Sistema de Mesas e ao Armazém/Automotivo.

const ETAPAS = ["Abrindo o sistema…", "Arrumando tudo…", "Preparando as vendas…", "Pronto para vender!"];
const IFO = "/brand/mascote.webp"; // imagem do site da IFTech (mesmo endereço)

function criadoEm(v) {
  if (!v) return NaN;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return typeof v === "number" ? v : Date.parse(v);
}

export function mostrarBoasVindas(loja) {
  if (!loja || !loja.id) return;
  const key = `iftech-boas-vindas-${loja.id}`;
  const t0 = criadoEm(loja.createdAt);
  if (!Number.isFinite(t0) || Date.now() - t0 > 7 * 86400000) return;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    return;
  }
  if (document.getElementById("iftech-boas-vindas")) return;

  const nome = String(loja.name || loja.nome || "Sua loja");
  const css = document.createElement("style");
  css.textContent = `
    #iftech-boas-vindas{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(7,18,51,.85);backdrop-filter:blur(3px);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;transition:opacity .3s}
    #iftech-boas-vindas .bv-card{width:100%;max-width:360px;background:#fff;color:#0b1530;border-radius:24px;padding:24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.35);animation:bv-pop .5s ease-out both}
    #iftech-boas-vindas .bv-tit{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1d4ed8}
    #iftech-boas-vindas .bv-logo{margin:12px auto 0;width:80px;height:80px;border-radius:18px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:32px;font-weight:700;box-shadow:0 8px 20px rgba(29,78,216,.35);border:4px solid #fff}
    #iftech-boas-vindas .bv-logo img{width:100%;height:100%;object-fit:cover}
    #iftech-boas-vindas .bv-nome{margin-top:12px;font-size:20px;font-weight:700;line-height:1.2;word-break:break-word}
    #iftech-boas-vindas .bv-pista{position:relative;margin-top:78px;height:12px;border-radius:999px;background:#e6ecfa}
    #iftech-boas-vindas .bv-barra{height:100%;width:6%;border-radius:999px;background-image:linear-gradient(90deg,#1d4ed8,#3b82f6,#facc15,#3b82f6,#1d4ed8);background-size:200% 100%;animation:bv-brilho 2.2s linear infinite;transition:width .15s ease-out}
    #iftech-boas-vindas .bv-ifo{position:absolute;bottom:4px;left:0;transition:left .15s ease-out}
    #iftech-boas-vindas .bv-ifo img{height:60px;width:auto;display:block;animation:bv-corre .32s ease-in-out infinite}
    #iftech-boas-vindas .bv-ifo.parado img{animation:none}
    #iftech-boas-vindas .bv-etapa{margin-top:12px;min-height:20px;font-size:14px;font-weight:600;color:#4b587c}
    #iftech-boas-vindas .bv-pular{margin-top:14px;border:0;background:none;color:#8a95b3;font-size:12px;text-decoration:underline;cursor:pointer}
    @keyframes bv-corre{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-7px) rotate(4deg)}}
    @keyframes bv-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
    @keyframes bv-brilho{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @media (prefers-reduced-motion:reduce){#iftech-boas-vindas .bv-ifo img,#iftech-boas-vindas .bv-barra{animation:none}}
  `;
  const root = document.createElement("div");
  root.id = "iftech-boas-vindas";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  const card = document.createElement("div");
  card.className = "bv-card";
  const el = (cls, txt) => {
    const d = document.createElement("div");
    d.className = cls;
    if (txt) d.textContent = txt;
    return d;
  };
  const logo = el("bv-logo");
  if (loja.logoUrl) {
    const im = document.createElement("img");
    im.src = loja.logoUrl;
    im.alt = "";
    logo.append(im);
  } else logo.textContent = nome.trim()[0]?.toUpperCase() || "L";
  const pista = el("bv-pista");
  const barra = el("bv-barra");
  const ifo = el("bv-ifo");
  const ifoImg = document.createElement("img");
  ifoImg.src = IFO;
  ifoImg.alt = "";
  ifo.append(ifoImg);
  pista.append(barra, ifo);
  const etapa = el("bv-etapa", ETAPAS[0]);
  const pular = document.createElement("button");
  pular.type = "button";
  pular.className = "bv-pular";
  pular.textContent = "Pular";
  card.append(el("bv-tit", "Bem-vindo à sua loja"), logo, el("bv-nome", nome), pista, etapa, pular);
  root.append(css, card);
  document.body.append(root);

  let p = 6;
  let i = 0;
  const fechar = () => {
    clearInterval(tb);
    clearInterval(te);
    root.style.opacity = "0";
    setTimeout(() => root.remove(), 300);
  };
  const tb = setInterval(() => {
    p = Math.min(100, p + 3.2);
    barra.style.width = `${p}%`;
    ifo.style.left = `calc((100% - 40px) * ${p / 100})`;
    if (p >= 100) {
      clearInterval(tb);
      clearInterval(te);
      ifo.classList.add("parado");
      etapa.textContent = "🎉 Sua loja está pronta!";
      setTimeout(fechar, 1400);
    }
  }, 100);
  const te = setInterval(() => {
    i = Math.min(i + 1, ETAPAS.length - 1);
    etapa.textContent = ETAPAS[i];
  }, 850);
  pular.onclick = fechar;
  root.onclick = (e) => {
    if (e.target === root) fechar();
  };
}
