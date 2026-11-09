import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Conexão do motor com o Firebase do Notara (projeto notara-monitor, banco padrão).
 * - No GitHub Actions: a chave da conta de serviço vem do Secret FIREBASE_SA (JSON).
 * - Nos emuladores: FIRESTORE_EMULATOR_HOST definido, sem chave.
 */
const PROJETO = process.env.NOTARA_PROJETO ?? "notara-monitor";
const chave = process.env.FIREBASE_SA?.trim();

export const app = initializeApp(chave ? { credential: cert(JSON.parse(chave)), projectId: PROJETO } : { projectId: PROJETO });
export const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

export const URL_APP = process.env.NOTARA_URL ?? "https://notara.web.app";
export const LIMITE_MONITORES = 50;
export const INTERVALO_MINIMO_MIN = 5;
