# 🎓 UBA Attendance Management System

**Vel Tech Rangarajan Dr. Sagunthala R&D Institute of Science and Technology**

A high-performance Progressive Web App (PWA) designed to manage field attendance for the **Unnat Bharat Abhiyan (UBA)** cell. This system features real-time synchronization, offline data vaulting, and administrative audit trails.

## 🚀 Key Features

### 📡 Real-Time Engine
- **onSnapshot Integration:** Live data streaming ensures the Admin and Coordinator dashboards update instantly when a scan occurs.
- **Dynamic QR Rotation:** Secure 11-second QR code refresh cycle to prevent unauthorized attendance sharing.

### 🛡️ Field Resilience
- **Offline Vault:** Captured scans are stored locally on student/coordinator devices in low-network village areas and synced automatically once internet is restored.
- **Service Worker:** Full PWA support allowing the app to load and function without an active data connection.

### 👮 Security & Audit
- **Identity Injection:** All manual overrides are logged with the specific Coordinator ID to ensure data integrity.
- **Banned Jail:** Automatic redirection for flagged users to prevent system exploitation.

### 🏆 Gamification
- **Hall of Fame:** Real-time leaderboard showcasing top student contributors to drive engagement.
- **Achievement Confetti:** Visual celebration for top-ranked performers.

## 🛠️ Tech Stack
- **Frontend:** Next.js (App Router), Tailwind CSS
- **Backend:** Node.js API with Firebase Admin SDK
- **Database:** Firebase Firestore with real-time listeners
- **Auth:** Firebase Authentication
- **PWA:** Workbox Service Workers & Web Manifest

## 📂 Folder Structure

```plaintext
├── app/
│   ├── admin/          # Faculty Head Dashboard
│   ├── coordinator/    # Student Coordinator HQ
│   ├── home/           # Student Dashboard & History
│   ├── banned/         # Security Redirection Page
│   ├── login/          # Auth Portal
│   └── page.tsx        # Netflix-Style Splash Entry
├── lib/
│   └── firebase.js     # Singleton Firebase/Firestore Config
├── public/
│   ├── sw.js           # PWA Service Worker
│   └── manifest.json   # Web App Manifest
└── components/         # Reusable UI Architecture
```

## 🏁 Installation & Deployment

### 1) Clone the repository
```bash
git clone https://github.com/siddarthpatelkama/UBA-veltech-attendance.git
```

### 2) Install dependencies
```bash
npm install
```

### 3) Configure environment variables
Create a `.env.local` file with your Firebase API keys.

### 4) Deploy to Vercel
Push your changes to the `main` branch for automatic deployment via the Vercel CI/CD pipeline.

## 👨‍💻 Architected and Engineered By
**Siddarth Patel Kama (VTU28319)**
