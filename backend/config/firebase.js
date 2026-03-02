const admin = require("../firebaseAdmin");

// Use the single, verified admin instance to get the database
const db = admin.firestore();

module.exports = db;