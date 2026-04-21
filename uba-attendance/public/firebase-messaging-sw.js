// firebase-messaging-sw.js
// NOTE: Service workers cannot access environment variables or ES Modules.
// Firebase config must be hardcoded here. These values are safe to expose publicly.
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBpdeLuRXxPs8rk11HN1VpSDKTS3BYH10g",
  authDomain: "uba-attendance-3101.firebaseapp.com",
  projectId: "uba-attendance-3101",
  storageBucket: "uba-attendance-3101.firebasestorage.app",
  messagingSenderId: "414761819857",
  appId: "1:414761819857:web:be3a4fd9e1e8975b15eff0"
});

const messaging = firebase.messaging();

// Handle background messages (app is closed or in background)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notificationTitle = payload.notification?.title || 'UBA Attendance';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/uba-logo.png',
    badge: '/uba-logo.png',
    tag: 'uba-notification',
    renotify: true,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
