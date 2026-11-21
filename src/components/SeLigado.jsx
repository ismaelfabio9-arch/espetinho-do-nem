// Tela de uma função que o plano não tem ou que a IFTech desligou só nesta loja.
import { usePlanoQueLibera, useRecurso } from "../recursos";

export default function SeLigado({ recurso, children, embutido = false }) {
  const ligado = useRecurso(recurso);
  const plano = usePlanoQueLibera(recurso);
  if (ligado) return children;
  return (
    <div className="container" style={{ padding: 24 }}>
      {!embutido && <a href="./" className="voltar">← Voltar</a>}
      {plano ? (
        <>
          <h1 style={{ marginTop: 16 }}>Função do plano {plano}</h1>
          <p>Esta função não faz parte do seu plano. Para usar, mude para o plano {plano}: fale com a IFTech pelo WhatsApp (81) 99245-8934.</p>
        </>
      ) : (
        <>
          <h1 style={{ marginTop: 16 }}>Função desligada</h1>
          <p>Esta função está desligada na sua loja. Para ligar de novo, fale com a IFTech.</p>
        </>
      )}
    </div>
  );
}
