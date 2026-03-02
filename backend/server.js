const express = require("express");
const cors = require("cors");
require("dotenv").config();

console.log("[SERVER] Initializing UBA Backend...");

const attendanceRoutes = require("./routes/attendanceRoutes");

const app = express();

// FIX: Explicitly allow network traffic
app.use(cors({ origin: "*" })); 

// CRITICAL FIX FOR MASTER ROSTER: 
// Increased the JSON limit to 50mb so you can upload large CSVs 
// and sync offline data without throwing a "Payload Too Large" error.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Console Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

// MOUNTING ROUTES TO ROOT
app.use("/", attendanceRoutes);

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