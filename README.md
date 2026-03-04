# 🎓 UBA Attendance Management System v2.0 (Severed-Connection Ready)

**Vel Tech Rangarajan Dr. Sagunthala R&D Institute of Science and Technology**

A high-performance Progressive Web App (PWA) and Native Android APK designed to manage field attendance for the **Unnat Bharat Abhiyan (UBA)** cell. This system features real-time synchronization, a complete offline data vault, and a state-of-the-art "Severed-Connection" emergency architecture for zero-downtime field operations.

## 🚀 Key Features

### 📡 Real-Time Engine
- **Instant Sync:** Live data streaming ensures the Admin and Coordinator dashboards update instantly when a scan occurs over Wi-Fi/4G.
- **Dynamic QR Rotation:** Secure 20-second rolling TOTP (Time-Based One-Time Password) QR code refresh cycle to prevent unauthorized attendance sharing.

### 🛡️ Field Resilience (Severed-Connection Architecture)
- **Offline Vault:** Captured scans are stored locally on Coordinator devices in low-network village areas and synced automatically once internet is restored.
- **Coord Air-Gap Portal:** An untethered, static-password protected login portal (`/emergency-coord`) that allows Coordinators to launch events and scan students even if the Firebase Auth backend completely crashes.
- **Zero-Auth Student QR Generator:** A dedicated `/emergency` portal that allows students to generate mathematically valid, device-locked QR codes without requiring a database login.

### 👮 Security & Audit
- **Strict 1-to-1 Device Locks:** The system writes a permanent hardware signature (`uba_emergency_device_id`) to the student's phone. If a phone is passed to a second student, the scanner instantly triggers a proxy block.
- **Emergency Data Routing:** All offline/emergency scans are synced to isolated `emergency_meetings` and `emergency_attendance` Firestore collections to prevent corruption of the master dataset.
- **Identity Injection:** All manual overrides are logged with the specific Coordinator ID to ensure data integrity.

### 🏆 Gamification
- **Hall of Fame:** Real-time leaderboard showcasing top student contributors to drive engagement.
- **Achievement Confetti:** Visual celebration for top-ranked performers.

## 🛠️ Tech Stack
- **Frontend:** Next.js (App Router), Tailwind CSS
- **Mobile Container:** Capacitor JS (Native Android Build)
- **Backend:** Node.js API with Firebase Admin SDK
- **Database:** Firebase Firestore (with Batch Commits)
- **Auth:** Firebase Authentication & Google Auth Plugin
- **Cryptography:** CryptoJS (SHA-256 for offline QR validation)

## 📂 Folder Structure

```plaintext
├── app/
│   ├── admin/             # Faculty Head Dashboard
│   ├── coordinator/       # Student Coordinator HQ
│   ├── emergency-coord/   # 🚨 Air-Gapped Offline Scanner
│   ├── emergency/         # 🚨 Zero-Auth Student QR Generator
│   ├── home/              # Student Dashboard & History
│   ├── login/             # Auth Portal
│   └── page.tsx           # Netflix-Style Splash Entry
├── lib/
│   └── firebase.js        # Singleton Firebase Config
├── android/               # Capacitor Native Mobile Project
└── public/
    └── uba-logo.png       # Official Assets
🏁 Installation & Deployment
1) Clone the repository
Bash
git clone [https://github.com/siddarthpatelkama/UBA-veltech-attendance.git](https://github.com/siddarthpatelkama/UBA-veltech-attendance.git)
cd UBA-veltech-attendance
2) Install dependencies
Bash
npm install
3) Native Mobile Build (Capacitor)
Bash
npm run build
npx cap sync android
npx cap open android
In Android Studio, select Build > Build Bundle(s) / APK(s) > Build APK(s).

4) Deploy to Vercel (Web)
Push your changes to the main branch for automatic deployment via the Vercel CI/CD pipeline.

👨‍💻 Architected and Engineered By
Siddarth Patel Kama (VTU28319)