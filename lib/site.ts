// Where the site and the registry live. next.config.ts owns the base path.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const siteUrl = `https://agzhxx.github.io${basePath}`;
export const registryUrl = `${siteUrl}/r`;
