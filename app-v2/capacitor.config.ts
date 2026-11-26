import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eduagent.tatbiqi',
  appName: 'تطبيقي',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: true,
      iosIsEncryption: true,
    },
  },
};

export default config;
