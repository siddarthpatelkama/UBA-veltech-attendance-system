const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// 🚨 KILLSWITCH: True = Simulation. False = Live Database Write.
const DRY_RUN = true;

async function processCollection(collectionName, batch) {
  console.log(`\n--- Processing ${collectionName} ---`);
  const snapshot = await db.collection(collectionName).get();
  let count = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();

    // Extract VTU. It might be the document ID or a field inside the document.
    let rawVtu = data.vtu || data.VTU || doc.id;

    // Skip if no VTU is found or if the doc ID is clearly not a VTU (e.g., 'settings')
    if (!rawVtu || rawVtu.length < 5) return;

    const cleanVTU = rawVtu.toString().trim().toUpperCase();

    // Standardize the fields for the users collection
    const updateData = {
      name: (data.name || data.Name || "").trim(),
      department: (data.department || data.dept || data.Department || "").trim(),
      year: (data.year || data.Year || "").trim(),
      migratedFrom: collectionName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Remove empty fields so we don't overwrite good data with blanks
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === "") delete updateData[key];
    });

    const userRef = db.collection('users').doc(cleanVTU);

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would upsert ${cleanVTU}:`, updateData);
    } else {
      batch.set(userRef, updateData, { merge: true });
    }
    count++;
  });

  return count;
}

async function executeMerge() {
  console.log(`Starting Database Merge. DRY_RUN: ${DRY_RUN}`);
  const batch = db.batch();

  const masterCount = await processCollection('master_roster', batch);
  const tempCount = await processCollection('temporary_roster', batch);

  console.log(`\nPrepared ${masterCount + tempCount} total profiles for the users collection.`);

  if (!DRY_RUN) {
    console.log("Committing batch write to Firestore...");
    await batch.commit();
    console.log("Merge committed successfully.");
  } else {
    console.log("Dry run complete. No database writes were executed.");
  }
}

executeMerge().catch(console.error);
