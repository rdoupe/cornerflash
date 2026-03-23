import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cornerflash.app',
  appName: 'CornerFlash',
  webDir: 'dist',
  server: {
    androidScheme: 'https', // prevents mixed-content issues with R2 CDN
  },
};

export default config;
