/* Service worker: recebe notificações push (FCM) com o app fechado. */
importScripts("https://www.gstatic.com/firebasejs/13.2.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.2.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBOP7wE7WTlJXTQ9QoAGYWA0ox4Dgk3nys",
  authDomain: "notara-monitor.firebaseapp.com",
  projectId: "notara-monitor",
  storageBucket: "notara-monitor.firebasestorage.app",
  messagingSenderId: "702444104447",
  appId: "1:702444104447:web:fa8012d411885978b8faca",
});

// Mensagens com "notification" são exibidas automaticamente pelo SDK;
// o clique abre o link enviado em webpush.fcmOptions.link.
firebase.messaging();

// Clique em notificações mostradas pelo app aberto (primeiro plano).
self.addEventListener("notificationclick", (e) => {
  const link = e.notification.data && e.notification.data.link;
  if (!link) return;
  e.notification.close();
  e.waitUntil(self.clients.openWindow(link));
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
