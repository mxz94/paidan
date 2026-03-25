import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.malanxi.paidan",
  appName: "派单管理系统",
  webDir: "out",
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "https://pd.malanxi.top",
    cleartext: false,
    androidScheme: "https",
  },
};

export default config;
