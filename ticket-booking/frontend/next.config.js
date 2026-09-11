/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // CloudFront+S3 정적 호스팅용 static export
  output: 'export',
  // 정적 export는 next/image 최적화 서버가 없으므로 비활성
  images: { unoptimized: true },
  // S3 정적 호스팅에서 /queue → /queue/index.html 매핑
  trailingSlash: true,
};
module.exports = nextConfig;
