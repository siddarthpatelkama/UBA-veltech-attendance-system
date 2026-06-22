const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// 🚨 KILLSWITCH: True = Simulation. False = Live Database Write.
const DRY_RUN = false;

async function reconcileUsers() {
  console.log(`Starting Identity Reconciliation. DRY_RUN: ${DRY_RUN}`);
  const snapshot = await db.collection('users').get();

  let batch = db.batch();
  let operationCount = 0;
  let mergeCount = 0;

  // Step 1: Map all email-based profiles
  const emailProfiles = new Map();
  snapshot.forEach(doc => {
    if (doc.id.includes('@')) {
      // Extract the VTU from the email (e.g., vtu31709@veltech.edu.in -> 31709)
      const extractedVtu = doc.id.split('@')[0].replace(/[^0-9]/g, '');
      if (extractedVtu) {
        emailProfiles.set(extractedVtu, doc.id);
      }
    }
  });

  // Step 2: Find VTU-based profiles and merge them into the email profiles
  for (const doc of snapshot.docs) {
    if (!doc.id.includes('@')) {
      const vtuDocId = doc.id; // e.g., '31709'
      const data = doc.data();

      const targetEmailDocId = emailProfiles.get(vtuDocId) || `vtu${vtuDocId}@veltech.edu.in`.toLowerCase();
      const targetRef = db.collection('users').doc(targetEmailDocId);

      const updatePayload = {
        department: data.department || null,
        year: data.year || null,
        name: data.name || null, // Overwrite messy auth name with clean roster name
        vtuNumber: vtuDocId,
        reconciledAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Remove nulls
      Object.keys(updatePayload).forEach(key => {
        if (updatePayload[key] === null) delete updatePayload[key];
      });

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would merge data from ${vtuDocId} INTO ${targetEmailDocId}`);
        console.log(`[DRY RUN] Would DELETE ${vtuDocId}`);
      } else {
        batch.set(targetRef, updatePayload, { merge: true });
        batch.delete(doc.ref);
        operationCount += 2;
        mergeCount++;

        if (operationCount >= 490) {
          await batch.commit();
          batch = db.batch();
          operationCount = 0;
        }
      }
    }
  }

  if (!DRY_RUN && operationCount > 0) {
    await batch.commit();
  }

  console.log(`\nReconciliation Complete. Total profiles merged: ${mergeCount}`);
}

reconcileUsers().catch(console.error);
