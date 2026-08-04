import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core reads browsers.json and other files at runtime via
  // dynamic requires, which Next's file tracer can't see statically — left
  // out, the deployed function is missing them and crashes on first use.
  outputFileTracingIncludes: {
    "/api/espn-login": ["./node_modules/playwright-core/**/*", "./node_modules/@sparticuz/chromium/**/*"],
  },
};

export default nextConfig;
