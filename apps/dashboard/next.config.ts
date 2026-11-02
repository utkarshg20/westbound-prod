import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@westbound/platform"],
  experimental: {
    // Middleware gates every non-GET API route (session check), so Next clones each request body for it and, by default,
    // keeps only the first 10 MB. A master (Logic/Resolve export) or reference pack larger than that reached the route
    // truncated. 512 MB covers a master; the upload routes enforce their own limits.
    middlewareClientMaxBodySize: "512mb",
  },
};

export default nextConfig;
