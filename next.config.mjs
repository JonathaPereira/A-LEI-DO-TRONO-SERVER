/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  poweredByHeader: false,
  agentRules: false,
  experimental: {
    agentUpgrade: 'security',
  },
};

export default nextConfig;
