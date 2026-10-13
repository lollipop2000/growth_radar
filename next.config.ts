import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["playwright", "exceljs"],
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};
export default config;
