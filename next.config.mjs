/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable client-side router cache so pages always re-fetch when navigated to.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
  images: {
    remotePatterns: [
      {
        // Supabase storage — project cover images
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
