import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.relay.app',
  appName: 'relay',
  webDir: 'dist',
  plugins: {
    SocialLogin: {
      google: {
        webClientId: process.env.VITE_GOOGLE_WEB_CLIENT_ID ?? '',
        iOSClientId: process.env.VITE_GOOGLE_IOS_CLIENT_ID ?? '',
      },
    },
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
