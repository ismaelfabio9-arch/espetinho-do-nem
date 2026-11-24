// Toca o som de cada aviso novo (pedido do cardápio digital, pedido pelo QR, acrescentou, alterou, conta,
// garçom) em qualquer tela da equipe — não só no Painel. Não toca o que já estava lá ao abrir o sistema,
// nem o pedido feito pela equipe (mesa, balcão, entrega): só o que o cliente faz.
import { useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";
import { liberarSomNoPrimeiroToque, meuAparelho, somDoAviso, tocarSom } from "../utils/sons";

export default function AvisosSom() {
  useEffect(() => {
    liberarSomNoPrimeiroToque();
    const eu = meuAparelho();
    let primeira = true;
    const sair = onSnapshot(
      collection(db, ...L(), "notificacoes"),
      (snap) => {
        if (primeira) {
          primeira = false;
          return;
        }
        snap.docChanges().forEach((ch) => {
          if (ch.type !== "added") return;
          const n = ch.doc.data();
          if (n.de && n.de === eu) return;
          // Aviso velho (o aparelho ficou sem internet e recebeu tudo de uma vez): não toca.
          const quando = Date.parse(n.horario || "");
          if (quando && Date.now() - quando > 2 * 60 * 1000) return;
          const som = somDoAviso(n);
          if (som) tocarSom(som);
        });
      },
      () => {}
    );
    return sair;
  }, []);
  return null;
}
