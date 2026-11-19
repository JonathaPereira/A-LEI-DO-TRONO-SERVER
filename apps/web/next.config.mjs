/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  transpilePackages: ['@trono/protocol', '@trono/voice-engine'],
  images: { unoptimized: true },
  poweredByHeader: false,
  agentRules: false,
  experimental: {
    agentUpgrade: 'security',
  },
};

export default nextConfig;
