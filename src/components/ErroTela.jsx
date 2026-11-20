import { Component } from "react";

/**
 * Se uma tela do cliente der erro, mostra um aviso com "Tentar de novo" em vez de deixar a página
 * em branco (ou preta, no tema escuro). O erro vai para o console para a IFTech ver.
 */
export default class ErroTela extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error("Erro na tela:", erro, info?.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="container" style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 44, marginTop: 40 }}>😕</div>
        <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>Não deu para abrir o cardápio</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 20px" }}>Confira a internet e tente de novo. Se continuar, avise a loja.</p>
        <button type="button" className="btn-verde" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
      </div>
    );
  }
}
