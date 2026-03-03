import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.veltech.uba.attendance',
  appName: 'UBA Attendance Management System',
  webDir: 'out',
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      // UPDATED TO MATCH YOUR JSON FILE
      serverClientId: '414761819857-lvb617pu2mc69r7rao6tns4emii3oeh0.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;