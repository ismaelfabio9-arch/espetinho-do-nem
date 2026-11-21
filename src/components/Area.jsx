// Área do sistema (Vendas, Cardápio e estoque): um título, as abas e a tela da aba escolhida.
// A aba fica no endereço (?aba=…), então os links antigos (/caixa, /historico…) caem na aba certa.
import { Link, useSearchParams } from "react-router-dom";
import SeLigado from "./SeLigado";
import "../styles/Garcom/Area.css";

/**
 * abas: [{ id, nome, recurso?, tela: () => JSX }]. padrao: id da aba quando o endereço não diz.
 */
export default function Area({ titulo, icone, texto, abas, padrao, param = "aba", sub = false }) {
  const [params, setParams] = useSearchParams();
  const atual = abas.find((a) => a.id === params.get(param)) || abas.find((a) => a.id === padrao) || abas[0];
  const escolher = (id) => {
    const p = new URLSearchParams(params);
    p.set(param, id);
    if (!sub) p.delete("sub");
    setParams(p, { replace: true });
  };
  const barra = (
    <div className={sub ? "area-sub" : "area-abas"} role="tablist" aria-label={titulo}>
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={a.id === atual.id} className={a.id === atual.id ? "ativa" : ""} onClick={() => escolher(a.id)}>
          {a.nome}
        </button>
      ))}
    </div>
  );
  const tela = atual.recurso ? (
    <SeLigado recurso={atual.recurso} embutido>
      {atual.tela()}
    </SeLigado>
  ) : (
    atual.tela()
  );
  if (sub)
    return (
      <div className="area-sub-bloco">
        {barra}
        <div className="area-conteudo">{tela}</div>
      </div>
    );
  return (
    <div className="area">
      <header className="area-topo">
        <Link to="/" className="voltar">← Painel</Link>
        <h1>
          <span aria-hidden="true">{icone}</span> {titulo}
        </h1>
        {texto && <p>{texto}</p>}
        {barra}
      </header>
      <div className="area-conteudo" key={atual.id}>{tela}</div>
    </div>
  );
}
