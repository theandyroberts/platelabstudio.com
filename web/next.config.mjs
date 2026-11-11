// Versioned derivatives and content-hashed bundles never change under the same
// name, so a browser may keep them for good. To change an encode, publish it
// under a new version suffix instead of replacing the file.
const FOREVER = [{key: 'Cache-Control', value: 'public, max-age=31536000, immutable'}];
// Unversioned public files: reuse for a day, refresh in the background after.
const DAILY = [{key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800'}];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{source: '/composite-review/media/:path*', destination: 'https://platelabstudio.com/composite-review/media/:path*'}];
  },
  async headers() {
    return [
      {source: '/media/site/:stream(.*-stream-v\\d+)/:path*', headers: FOREVER},
      {source: '/media/site/:file(.*-v\\d+\\.mp4)', headers: FOREVER},
      {source: '/media/site/:file(.*\\.jpg)', headers: DAILY},
      {source: '/composite-review/media/composite/:clip/:stream(stream-v\\d+)/:path*', headers: FOREVER},
      {source: '/composite-review/media/composite/:clip/:file((?:browser|card)-preview-v\\d+\\.mp4)', headers: FOREVER},
      {source: '/:viewer(stage|imported-stage)/assets/:path*', headers: FOREVER},
      {source: '/:viewer(stage|imported-stage)/:kind(models|draco)/:path*', headers: DAILY},
      {source: '/branding/:path*', headers: DAILY},
    ];
  },
  transpilePackages: ["@platelab/shared"],
};

export default nextConfig;
