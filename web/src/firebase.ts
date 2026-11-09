import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

// Configuração pública do app web Notara (projeto notara-monitor, plano gratuito).
// O site continua em notara.web.app; os dados e o login ficam no projeto notara-monitor.
export const firebaseConfig = {
  apiKey: "AIzaSyBOP7wE7WTlJXTQ9QoAGYWA0ox4Dgk3nys",
  authDomain: "notara-monitor.firebaseapp.com",
  projectId: "notara-monitor",
  storageBucket: "notara-monitor.firebasestorage.app",
  messagingSenderId: "702444104447",
  appId: "1:702444104447:web:fa8012d411885978b8faca",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = "pt";

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Desenvolvimento local: `VITE_EMULADORES=1 npm run dev` usa os emuladores do Firebase.
if (import.meta.env.DEV && import.meta.env.VITE_EMULADORES) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

/** Chave pública VAPID (Firebase Console › Cloud Messaging › Certificados push da Web). */
export const VAPID_KEY = import.meta.env.VITE_VAPID_KEY as string | undefined;
