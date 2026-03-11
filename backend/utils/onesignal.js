// backend/utils/onesignal.js
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

exports.sendNotification = async (targetTopic, title, body, additionalData = {}) => {
  try {
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.warn("⚠️ OneSignal keys missing in Render. Notification skipped.");
      return;
    }

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: body },
      data: additionalData,
    };

    // 🎯 SMART TARGETING
    if (targetTopic === 'all_students') {
      payload.included_segments = ['Total Subscriptions'];
    } 
    else if (targetTopic.startsWith('student_')) {
      const vtu = targetTopic.replace('student_', '');
      payload.filters = [{ field: 'tag', key: 'vtu', relation: '=', value: vtu }];
    } 
    else if (targetTopic.startsWith('year_')) {
      const year = targetTopic.replace('year_', '');
      payload.filters = [{ field: 'tag', key: 'year', relation: '=', value: year }];
    } 
    else if (targetTopic === 'admin') {
      payload.filters = [{ field: 'tag', key: 'role', relation: '=', value: 'admin' }];
    } 
    else if (targetTopic === 'coordinators') {
      payload.filters = [
        { field: 'tag', key: 'role', relation: '=', value: 'coordinator' },
        { operator: 'OR' },
        { field: 'tag', key: 'role', relation: '=', value: 'student_coordinator' }
      ];
    }
    else {
      payload.included_segments = ['Total Subscriptions'];
    }

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log(`[OneSignal] Broadcast to ${targetTopic}:`, data);
    return data;

  } catch (error) {
    console.error('[OneSignal] Critical Error sending push:', error);
  }
};