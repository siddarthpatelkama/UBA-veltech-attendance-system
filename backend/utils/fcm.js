const admin = require('../firebaseAdmin');

const sendNotification = async (topic, title, body, data = {}) => {
  try {
    const message = {
      notification: { title, body },
      data: {
        click_action: "FLUTTER_NOTIFICATION_CLICK", // Standard for PWA handling
        ...data
      },
      topic: topic
    };
    
    // Safety check: Ensure the messaging module is available
    if (admin.messaging) {
       const response = await admin.messaging().send(message);
       console.log(`[FCM] Successfully sent message to topic ${topic}:`, response);
       return true;
    } else {
       console.log(`[FCM-MOCK] Would send: "${title}" to topic: ${topic}`);
       return false;
    }
  } catch (error) {
    console.error(`[FCM Error] Failed to send to ${topic}:`, error);
    return false;
  }
};

module.exports = { sendNotification };
