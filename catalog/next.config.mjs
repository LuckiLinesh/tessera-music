/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The project lives under a home-directory workspace, so tell Turbopack where
  // the root is instead of letting it walk up to C:\Users\lucki.
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    // Artwork comes from many public catalogs; we render it with plain <img>
    // because those hosts already serve appropriately sized variants.
    unoptimized: true,
  },
};

export default nextConfig;
