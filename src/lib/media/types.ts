export const MEDIA_PURPOSES = ['product', 'service-order', 'logo', 'avatar', 'screensaver'] as const;
export type MediaPurpose = typeof MEDIA_PURPOSES[number];
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export function mediaId(value: string) { return /^\/api\/media\/(c[a-z0-9]{20,40})$/.exec(value)?.[1] ?? null; }
export const isMediaPath = (value: string) => mediaId(value) !== null;
