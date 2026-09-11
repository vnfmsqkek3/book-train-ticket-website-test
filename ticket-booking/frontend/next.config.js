/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // shared/types를 트랜스파일 대상에 포함
  transpilePackages: [],
};
module.exports = nextConfig;
