// Senha da dona: a tela de digitar a senha, o bloqueio das partes de dinheiro e o cadastro em Configurações.
import { useState } from "react";
import { useRecurso } from "../recursos";
import { useSouDono } from "../tenant";
import { registrar } from "../utils/registro";
import { bloquear, conferirSenha, liberar, novaSenha, salvarSenhas, useLiberado, useSenhaDona } from "../utils/senhaDona";
import "./SenhaDona.css";

/** Precisa de senha agora? (função ligada, senha criada e ainda não liberou neste aparelho) */
export function usePrecisaSenha() {
  const ligado = useRecurso("dinheiro-completo");
  const cfg = useSenhaDona();
  const lib = useLiberado();
  if (!ligado) return { precisa: false, cfg, lib };
  if (cfg === null) return { precisa: true, carregando: true, cfg, lib };
  return { precisa: !!cfg.dona && !lib, cfg, lib };
}

/** Caixa de digitar a senha. */
export function TelaSenha({ cfg, titulo = "Senha da dona", onCancelar, emJanela = false }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [conferindo, setConferindo] = useState(false);
  async function entrar(e) {
    e.preventDefault();
    if (!senha) return;
    setConferindo(true);
    const quem = await conferirSenha(cfg, senha).catch(() => null);
    setConferindo(false);
    if (!quem) {
      setErro("Senha errada.");
      setSenha("");
      return;
    }
    liberar(quem);
  }
  const caixa = (
    <form className="sd-caixa" onSubmit={entrar} onClick={(e) => e.stopPropagation()}>
      <h2>{titulo}</h2>
      <p>Esta parte mexe com dinheiro.</p>
      <input className="sd-pin sd-bolinha" type="text" inputMode="numeric" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other" autoFocus placeholder="Senha" value={senha} onChange={(e) => { setSenha(e.target.value); setErro(""); }} />
      {erro && <p className="sd-erro">{erro}</p>}
      <div className="sd-bts">
        {onCancelar && <button type="button" className="sd-cancelar" onClick={onCancelar}>Cancelar</button>}
        <button className="sd-entrar" disabled={!senha || conferindo}>{conferindo ? <><span className="girando" aria-hidden="true" />Conferindo…</> : "Entrar"}</button>
      </div>
    </form>
  );
  if (emJanela) return <div className="sd-fundo" role="dialog" aria-modal="true" aria-label="Senha" onClick={onCancelar}>{caixa}</div>;
  return <div className="sd-tela">{caixa}</div>;
}

/** Envolve uma parte de dinheiro: pede a senha antes de mostrar. */
export function PedirSenha({ children, titulo }) {
  const { precisa, carregando, cfg, lib } = usePrecisaSenha();
  if (carregando) return <p style={{ padding: 24 }}><span className="if-carrega" aria-hidden="true"><i /></span>Carregando…</p>;
  if (precisa) return <TelaSenha cfg={cfg} titulo={titulo} />;
  return (
    <>
      {lib && <BarraLiberado quem={lib.quem} />}
      {children}
    </>
  );
}

export function BarraLiberado({ quem }) {
  return (
    <div className="sd-barra">
      <span>Liberado · {quem}</span>
      <button type="button" onClick={bloquear}>Bloquear</button>
    </div>
  );
}

/** Para um botão: pede a senha (se precisar) e só depois faz. Devolve [pedir(fn), janela]. */
export function useComSenha() {
  const { precisa, cfg } = usePrecisaSenha();
  const [depois, setDepois] = useState(null);
  const pedir = (fn) => (precisa ? setDepois(() => fn) : fn());
  const janela = depois && precisa ? <TelaSenha cfg={cfg} emJanela onCancelar={() => setDepois(null)} /> : null;
  // Liberou: faz o que estava esperando.
  if (depois && !precisa) {
    const fn = depois;
    setTimeout(() => {
      setDepois(null);
      fn();
    }, 0);
  }
  return [pedir, janela, precisa];
}

/** Configurações → Senha da dona: criar ou trocar a senha e liberar pessoas (cada uma com a sua senha). */
export function SenhaDonaConfig() {
  const ligado = useRecurso("dinheiro-completo");
  const souDono = useSouDono();
  const cfg = useSenhaDona();
  const lib = useLiberado();
  const [s1, setS1] = useState("");
  const [s2, setS2] = useState("");
  const [nome, setNome] = useState("");
  const [sp, setSp] = useState("");
  const [msg, setMsg] = useState("");
  if (!ligado || !souDono || cfg === null) return null;
  const temSenha = !!cfg.dona;
  // Trocar a senha ou mexer nas pessoas: só quem entrou com a senha da dona.
  if (temSenha && lib?.quem !== "Dona") {
    return (
      <div className="config-card sd-config">
        <div>
          <h2>Senha da dona</h2>
          <p>Dinheiro, caixa, relatório, preços e encerrar o dia pedem a senha.</p>
          <SoDona cfg={cfg} />
        </div>
      </div>
    );
  }
  const aviso = (t) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 2500);
  };
  async function salvarDona(e) {
    e.preventDefault();
    if (s1.length < 4) return aviso("A senha precisa ter pelo menos 4 números.");
    if (s1 !== s2) return aviso("As duas senhas não são iguais.");
    await salvarSenhas({ dona: await novaSenha(s1), pessoas: cfg.pessoas || [] });
    registrar({ area: "dinheiro", acao: temSenha ? "Trocou a senha da dona" : "Criou a senha da dona", texto: "Senha da dona" });
    setS1("");
    setS2("");
    aviso(temSenha ? "Senha trocada." : "Senha criada.");
  }
  async function adicionarPessoa(e) {
    e.preventDefault();
    if (!nome.trim()) return aviso("Escreva o nome.");
    if (sp.length < 4) return aviso("A senha precisa ter pelo menos 4 números.");
    const p = { id: `p${Date.now().toString(36)}`, nome: nome.trim().slice(0, 40), ...(await novaSenha(sp)) };
    await salvarSenhas({ pessoas: [...(cfg.pessoas || []), p] });
    registrar({ area: "dinheiro", acao: "Liberou acesso ao dinheiro", texto: p.nome });
    setNome("");
    setSp("");
    aviso(`${p.nome} liberado.`);
  }
  async function tirarPessoa(p) {
    await salvarSenhas({ pessoas: (cfg.pessoas || []).filter((x) => x.id !== p.id) });
    registrar({ area: "dinheiro", acao: "Tirou o acesso ao dinheiro", texto: p.nome });
  }
  return (
    <div className="config-card sd-config">
      <div>
        <h2>Senha da dona</h2>
        <p>Dinheiro, caixa, relatório, preços e encerrar o dia pedem a senha.</p>
        <form className="sd-form" onSubmit={salvarDona}>
          <div className="sd-lab">{temSenha ? "Trocar a senha" : "Criar a senha"}</div>
          <div className="sd-duo">
            <input type="text" inputMode="numeric" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other" className="sd-bolinha" placeholder="Senha" value={s1} onChange={(e) => setS1(e.target.value)} />
            <input type="text" inputMode="numeric" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other" className="sd-bolinha" placeholder="Repita a senha" value={s2} onChange={(e) => setS2(e.target.value)} />
          </div>
          <button className="config-btn">{temSenha ? "Trocar senha" : "Criar senha"}</button>
        </form>
        {temSenha && (
          <>
            <div className="sd-lab">Pessoas liberadas</div>
            {(cfg.pessoas || []).length === 0 ? (
              <p className="sd-vazio">Só a dona entra.</p>
            ) : (
              <ul className="sd-pessoas">
                {cfg.pessoas.map((p) => (
                  <li key={p.id}>
                    <span>{p.nome}</span>
                    <button type="button" onClick={() => tirarPessoa(p)}>Tirar acesso</button>
                  </li>
                ))}
              </ul>
            )}
            <form className="sd-form" onSubmit={adicionarPessoa}>
              <div className="sd-duo">
                <input placeholder="Nome" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} />
                <input type="text" inputMode="numeric" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other" className="sd-bolinha" placeholder="Senha dela" value={sp} onChange={(e) => setSp(e.target.value)} />
              </div>
              <button className="config-btn">Liberar acesso</button>
            </form>
          </>
        )}
        {msg && <p className="sd-msg">{msg}</p>}
      </div>
    </div>
  );
}

function SoDona({ cfg }) {
  const [abrir, setAbrir] = useState(false);
  return (
    <>
      <button type="button" className="config-btn" onClick={() => setAbrir(true)}>Mudar senha ou pessoas</button>
      {abrir && <TelaSenha cfg={{ dona: cfg.dona }} titulo="Senha da dona" emJanela onCancelar={() => setAbrir(false)} />}
    </>
  );
}
