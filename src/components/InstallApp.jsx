import React, { useEffect, useState } from "react";
import "./InstallApp.css";

import { canPromptInstall, detectDevice, isInAppBrowser, onInstallAvailabilityChange, promptInstall } from "../utils/installPrompt";

const TABS = [
  { id: "iphone", label: "iPhone" },
  { id: "android", label: "Android" },
  { id: "computador", label: "Computador" },
];

function Steps({ device }) {
  if (device === "iphone")
    return (
      <ol className="install-steps">
        <li>Abra o sistema no <strong>Safari</strong> (se abriu por outro app, toque em ⋯ e em “Abrir no navegador”).</li>
        <li>Toque no botão <strong>Compartilhar</strong> (o quadrado com a seta pra cima), embaixo da tela. No iOS mais novo, toque antes nos <strong>três pontinhos ⋯</strong> e depois em Compartilhar.</li>
        <li>Role a lista e toque em <strong>“Adicionar à Tela de Início”</strong>.</li>
        <li>Toque em <strong>“Adicionar”</strong>. O ícone aparece junto dos seus apps.</li>
      </ol>
    );
  if (device === "android")
    return (
      <ol className="install-steps">
        <li>Abra o sistema no <strong>Google Chrome</strong>.</li>
        <li>Toque nos <strong>três pontinhos ⋮</strong>, no canto de cima.</li>
        <li>Toque em <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong> e confirme.</li>
      </ol>
    );
  return (
    <ol className="install-steps">
      <li>Abra o sistema no <strong>Google Chrome</strong> ou no <strong>Microsoft Edge</strong>.</li>
      <li>Clique no ícone de <strong>instalar</strong> no fim da barra de endereço (um monitor com uma seta), ou no menu <strong>⋮</strong> → <strong>“Transmitir, salvar e compartilhar”</strong> → <strong>“Instalar página como app”</strong> (no Edge: <strong>“Aplicativos” → “Instalar este site como aplicativo”</strong>).</li>
      <li>O sistema abre numa janela própria e ganha um atalho na área de trabalho.</li>
    </ol>
  );
}

/** Janela "Instalar o app": botão do próprio navegador (quando dá) e o passo a passo por aparelho. */
export default function InstallModal({ onClose }) {
  const [device, setDevice] = useState(() => detectDevice());
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  useEffect(() => onInstallAvailabilityChange(() => setCanPrompt(canPromptInstall())), []);
  const inApp = isInAppBrowser();

  return (
    <div className="instalar-fundo" onClick={onClose}>
      <div className="instalar-janela" onClick={e => e.stopPropagation()}>
        <div className="install-head">
          <div>
            <h2>Instalar o app</h2>
            <p className="instalar-sub">Coloque o sistema na tela de início: abre como um app, num toque, sem procurar o link.</p>
          </div>
          <button type="button" className="instalar-fechar" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        {canPrompt && (
          <button type="button" className="config-btn" onClick={() => void promptInstall().then(ok => ok && onClose())}>
            Instalar agora
          </button>
        )}
        {inApp && (
          <p className="install-warning">Você abriu por dentro de outro app (Instagram, WhatsApp…). Toque em ⋯ e em “Abrir no navegador” primeiro: por aqui não dá pra instalar.</p>
        )}
        <div className="install-tabs" role="tablist">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={device === t.id} className={device === t.id ? "active" : ""} onClick={() => setDevice(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <Steps device={device} />
      </div>
    </div>
  );
}
