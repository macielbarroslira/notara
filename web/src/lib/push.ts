import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { app, db, VAPID_KEY } from "../firebase";

const SW = "/firebase-messaging-sw.js";

export const pushDisponivel = () => isSupported();

export function ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function instaladoComoApp() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

async function idDoToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pede permissão, registra o service worker e salva o token deste aparelho. */
export async function ativarPush(uid: string) {
  if (!(await isSupported())) {
    throw new Error(
      ehIOS() && !instaladoComoApp()
        ? "No iPhone/iPad, primeiro adicione o app à Tela de Início (Compartilhar › Adicionar à Tela de Início) e abra por lá."
        : "Este navegador não suporta notificações push.",
    );
  }
  if (!VAPID_KEY) throw new Error("A chave de push (VAPID) ainda não foi configurada no app.");
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") throw new Error("Permissão de notificação negada. Libere nas configurações do navegador.");
  const reg = await navigator.serviceWorker.register(SW);
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  await setDoc(doc(db, `users/${uid}/dispositivos/${await idDoToken(token)}`), {
    token,
    plataforma: navigator.userAgent.slice(0, 200),
    atualizadoEm: serverTimestamp(),
  });
}

/** Com o app aberto o FCM não mostra a notificação sozinho — mostramos manualmente. */
export function ouvirPrimeiroPlano(): (() => void) | undefined {
  let cancelar: (() => void) | undefined;
  let ativo = true;
  (async () => {
    if (!(await isSupported()) || Notification.permission !== "granted" || !ativo) return;
    cancelar = onMessage(getMessaging(app), async (msg) => {
      const reg = await navigator.serviceWorker.getRegistration(SW);
      const n = msg.notification;
      if (reg && n?.title) {
        reg.showNotification(n.title, { body: n.body, icon: "/icon-192.png", data: { link: msg.fcmOptions?.link } });
      }
    });
  })();
  return () => {
    ativo = false;
    cancelar?.();
  };
}
