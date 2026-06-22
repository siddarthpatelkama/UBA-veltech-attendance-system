require("./instrument.js");
const Sentry = require("@sentry/node");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

console.log("[SERVER] Initializing UBA Backend...");

const attendanceRoutes = require("./routes/attendanceRoutes");
const adminRoutes = require("./routes/adminRoutes");
const googlebotBypass = require("./middleware/googlebotBypass");
const telemetryMiddleware = require("./middleware/telemetryMiddleware");

const app = express();

// FIX: Explicitly allow network traffic
app.use(cors({ origin: "*" })); 

// CRITICAL FIX FOR MASTER ROSTER: 
// Increased the JSON limit to 50mb so you can upload large CSVs 
// and sync offline data without throwing a "Payload Too Large" error.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(telemetryMiddleware);

// Console Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

// --- GOOGLEBOT BYPASS ROUTES (SEO INDEXABLE) ---
// These public read-only endpoints allow Googlebot to crawl data
// without triggering standard security middleware.
app.get('/api/whoami', googlebotBypass, (req, res) => {
  res.json({ message: "Public whoami endpoint", isGooglebot: !!req.isGooglebot });
});

app.get('/api/meetings', googlebotBypass, (req, res) => {
  res.json({ meetings: [], isGooglebot: !!req.isGooglebot });
});

app.get('/api/public-events', googlebotBypass, (req, res) => {
  res.json({ events: [], isGooglebot: !!req.isGooglebot });
});
// ----------------------------------------------

// MOUNTING ROUTES TO ROOT
app.use("/", attendanceRoutes);
app.use("/admin", adminRoutes);

const db = require('./config/firebase');

// --- THE 24/7 KEEP-ALIVE & MORNING BOOT SYSTEM ---
app.get('/keep-alive', async (req, res) => {
  const now = Date.now();

  if (!global.ubaCache) {
    global.ubaCache = { meetings: [], attendance: [], suspiciousLogs: [], users: [], lastUpdated: 0 };
  }

  // 🌅 MORNING BOOT DETECTION (Last Updated is 0 when Render wakes up)
  if (global.ubaCache.lastUpdated === 0) {
    console.log("🌅 Morning Boot Sequence: Warming up RAM Cache...");
    try {
      const [meetingsSnap, masterSnap, attSnap] = await Promise.all([
        db.collection("meetings").orderBy("createdAt", "desc").limit(50).get(),
        db.collection("master_roster").get(),
        db.collection("attendance").orderBy("timestamp", "desc").limit(5000).get() // RAM Shield: Max 5000 scans
      ]);

      global.ubaCache.meetings = meetingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      global.ubaCache.users = masterSnap.docs.map(doc => ({ ...doc.data(), vtuNumber: doc.id }));
      global.ubaCache.attendance = attSnap.docs.map(doc => doc.data());
      global.ubaCache.lastUpdated = now;

      console.log(`✅ Cache loaded! (${global.ubaCache.users.length} Users in RAM)`);
    } catch (error) {
      console.error("❌ Morning Boot failed:", error);
    }
  } else {
    console.log("⚡ Daytime Heartbeat: Server is warm.");
  }

  res.status(200).send("UBA Server is Online & Warmed Up.");
});

// 🧪 SENTRY TEST ROUTE
app.get("/debug-sentry", function mainHandler(req, res) {
  const startTime = Date.now();

  // Send a log before throwing the error
  Sentry.logger.info('User triggered test error', {
    action: 'test_error_endpoint',
  });
  // Send a test metric before throwing the error
  Sentry.metrics.count('test_counter', 1);
  Sentry.metrics.gauge('debug_sentry_inflight', 1);
  Sentry.metrics.distribution('debug_sentry_latency_ms', Date.now() - startTime);
  throw new Error("Backend Sentry is working, Siddarth!");
});

// 🛡️ SENTRY ERROR HANDLER (must be after all routes)
Sentry.setupExpressErrorHandler(app);

const http = require('http');
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// CRITICAL FIX: "0.0.0.0" opens the backend to your network IP
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[SERVER] ✓ UBA Backend Live on 0.0.0.0:${PORT}`);
});

server.on('error', (error) => {
  console.error('[SERVER] Critical Port Error:', error);
});

setInterval(() => {}, 1000 * 60 * 60);