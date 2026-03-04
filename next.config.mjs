/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable client-side router cache so pages always re-fetch when navigated to.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
