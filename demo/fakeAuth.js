// A demonstração não tem login: as telas de várias lojas (LojaGate) não são usadas.
const nada = () => {};
export class GoogleAuthProvider { static credential() { return null; } }
export const getAuth = () => ({});
export const connectAuthEmulator = nada;
export const getRedirectResult = async () => null;
export const onAuthStateChanged = (_a, cb) => { cb(null); return nada; };
export const signInWithCredential = async () => null;
export const signInWithPopup = async () => null;
export const signInWithRedirect = async () => null;
export const signOut = async () => {};
// Painel do Dono (só nas lojas da IFTech; na demonstração fica fora do menu).
export const initializeAuth = () => ({});
export const inMemoryPersistence = {};
export const browserPopupRedirectResolver = {};
export async function signInWithEmailAndPassword() { throw new Error("Na demonstração não precisa entrar."); }
