/**
 * clean-manifests.js
 * One-shot script: normalizes all VTU numbers inside meeting manifests.
 * Run ONCE from the backend directory: node scripts/clean-manifests.js
 * Safe to re-run — only writes when it finds dirty data.
 */

require("dotenv").config({ path: "../.env" });
const admin = require("../firebaseAdmin");
const db = require("../config/firebase");

const norm = (v) => String(v || "").replace(/\D/g, "");

async function cleanManifests() {
  console.log("[CLEAN] Fetching all meetings with manifests...");
  const snap = await db.collection("meetings").get();

  let fixed = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const manifest = data.manifest;

    if (!manifest || manifest.length === 0) { skipped++; continue; }

    let dirty = false;
    const cleanedManifest = manifest.map((entry) => {
      const cleanVtu = norm(entry.vtu);
      if (cleanVtu !== entry.vtu) {
        dirty = true;
        console.log(`  [FIX] ${doc.id}: "${entry.vtu}" → "${cleanVtu}"`);
      }
      return { ...entry, vtu: cleanVtu };
    });

    if (dirty) {
      await doc.ref.update({ manifest: cleanedManifest });
      fixed++;
    } else {
      skipped++;
    }
  }

  console.log(`\n[DONE] Fixed ${fixed} meetings, skipped ${skipped} clean ones.`);
  process.exit(0);
}

cleanManifests().catch((err) => {
  console.error("[ERROR]", err);
  process.exit(1);
});
