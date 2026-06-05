// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const urlParams = new URLSearchParams(self.location.search);
const configParam = urlParams.get('config');

let messaging = null;

if (!configParam) {
  console.error('FATAL: Firebase Service Worker initialized without environment configuration.');
} else {
  try {
    const firebaseConfig = JSON.parse(decodeURIComponent(configParam));
    firebase.initializeApp(firebaseConfig);
    messaging = firebase.messaging();
  } catch (error) {
    console.error('FATAL: Firebase Service Worker failed to parse environment configuration.', error);
  }
}

// Handle background messages (app is closed or in background)
if (messaging) {
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
}
