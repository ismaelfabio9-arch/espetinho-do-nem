import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { MULTI } from "./loja";

const configLojaUnica = {
  apiKey: "AIzaSyDdAxTII1FD1FmO-CHZLz6b_HuliKX339Q",
  authDomain: "espetinho-do-nem.firebaseapp.com",
  projectId: "espetinho-do-nem",
  storageBucket: "espetinho-do-nem.firebasestorage.app",
  messagingSenderId: "239831830885",
  appId: "1:239831830885:web:37398b12cd3199947dd18c",
};

// Várias lojas (site da IFTech): Firebase da IFTech. Estes valores identificam o projeto e não
// são senhas; quem protege os dados são as regras do Firestore.
const configIftech = {
  apiKey: "AIzaSyD7bZRDzVEtQx76rILzIYCfRdakZVeYZsI",
  authDomain: "iftech-84f1f.firebaseapp.com",
  projectId: "iftech-84f1f",
  storageBucket: "iftech-84f1f.firebasestorage.app",
  messagingSenderId: "874502345338",
  appId: "1:874502345338:web:1d5485a8c40a7b7aa121c3",
};

// No site da IFTech o login do Google passa pelo próprio endereço (funciona dentro do Instagram/WhatsApp).
if (MULTI && typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
  configIftech.authDomain = window.location.host;
}

const app = initializeApp(MULTI ? configIftech : configLojaUnica);
export const auth = getAuth(app);

export const db = getFirestore(app);