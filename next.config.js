/** @type {import('next').NextConfig} */
const fs = require("node:fs");
const path = require("node:path");
const { version: appVersion } = require("./package.json");
const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;

if (process.env.NODE_ENV === "production") {
  if (!serverUrl) {
    throw new Error("NEXT_PUBLIC_SERVER_URL is required for production builds");
  }

  const parsedServerUrl = new URL(serverUrl);
  if (
    parsedServerUrl.username ||
    parsedServerUrl.password ||
    parsedServerUrl.hash ||
    parsedServerUrl.search ||
    serverUrl.replace(/\/$/, "") !== parsedServerUrl.origin
  ) {
    throw new Error(
      "NEXT_PUBLIC_SERVER_URL must contain only an HTTP(S) origin",
    );
  }
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(
    parsedServerUrl.hostname,
  );
  if (!["http:", "https:"].includes(parsedServerUrl.protocol)) {
    throw new Error("NEXT_PUBLIC_SERVER_URL must use HTTP or HTTPS");
  }
  if (parsedServerUrl.protocol !== "https:" && !isLocalhost) {
    throw new Error("NEXT_PUBLIC_SERVER_URL must use HTTPS in production");
  }
  if (!isLocalhost) {
    const headers = fs.readFileSync(
      path.join(__dirname, "public", "_headers"),
      "utf8",
    );
    const websocketOrigin = parsedServerUrl.origin.replace(/^http/, "ws");
    if (
      !headers.includes(parsedServerUrl.origin) ||
      !headers.includes(websocketOrigin)
    ) {
      throw new Error(
        "public/_headers connect-src must include the configured API HTTP and WebSocket origins",
      );
    }
  }
}

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  images: { unoptimized: true },
  output: "export",
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: true,
  webpack: (config) => {
    // Keep collaboration on the application's single Yjs peer instance.
    config.resolve.alias.yjs = require.resolve("yjs");
    return config;
  },
};

module.exports = nextConfig;
