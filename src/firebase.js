import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDdAxTII1FD1FmO-CHZLz6b_HuliKX339Q",
  authDomain: "espetinho-do-nem.firebaseapp.com",
  projectId: "espetinho-do-nem",
  storageBucket: "espetinho-do-nem.firebasestorage.app",
  messagingSenderId: "239831830885",
  appId: "1:239831830885:web:37398b12cd3199947dd18c",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);