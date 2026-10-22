import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { rgbaToThumbHash, thumbHashToDataURL } from 'thumbhash';
import { describe, expect, it, vi } from 'vitest';
import { thumbHashColor, useThumbHash } from '@/registry/hooks/use-thumbhash';

// The decoder, still decoding, with its calls counted.
vi.mock('thumbhash', async (importOriginal) => {
  const original = await importOriginal<typeof import('thumbhash')>();
  return { ...original, thumbHashToDataURL: vi.fn(original.thumbHashToDataURL) };
});
const decodes = () => vi.mocked(thumbHashToDataURL).mock.calls.length;

/** A ThumbHash of a 4 × 4 image in one color, different for each n. */
function hashOf(n: number) {
  const rgba = new Uint8Array(4 * 4 * 4).map((_, index) => (index % 4 === 3 ? 255 : (n * (index % 4 + 3)) % 256));
  return btoa(String.fromCharCode(...rgbaToThumbHash(4, 4, rgba)));
}

// Two of Generation Feed's ThumbHashes: a portrait (1152 × 2048) and a landscape (1280 × 720).
const portrait = 'CwgGBAB3+HhYeIeYqJh1jFDHBw==';
const landscape = 'jwcKFII5Z2iIiXZweHdKgMAUCA==';

// A PNG's size, from its header (the IHDR chunk).
function pngSize(dataUrl: string) {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('useThumbHash', () => {
  it('decodes a ThumbHash to a tiny PNG in the image’s shape', () => {
    const { result, rerender } = renderHook(({ hash }) => useThumbHash(hash), { initialProps: { hash: portrait } });
    expect(result.current).toMatch(/^data:image\/png;base64,/);
    const tall = pngSize(result.current ?? '');
    expect(tall.height).toBeLessThanOrEqual(32);
    expect(tall.width / tall.height).toBeCloseTo(1152 / 2048, 1);
    rerender({ hash: landscape });
    const wide = pngSize(result.current ?? '');
    expect(wide.width / wide.height).toBeCloseTo(1280 / 720, 0);
  });

  it('decodes again only when the hash changes', () => {
    const { result, rerender } = renderHook(({ hash }) => useThumbHash(hash), { initialProps: { hash: portrait } });
    const first = result.current;
    rerender({ hash: portrait });
    expect(result.current).toBe(first);
    rerender({ hash: landscape });
    expect(result.current).not.toBe(first);
  });

  it('has nothing for no hash, or one that doesn’t decode', () => {
    const { result, rerender } = renderHook(({ hash }: { hash?: string }) => useThumbHash(hash), {
      initialProps: {},
    });
    expect(result.current).toBeUndefined();
    rerender({ hash: '' });
    expect(result.current).toBeUndefined();
    rerender({ hash: 'not base64!' });
    expect(result.current).toBeUndefined();
  });

  it('decodes a hash once while it’s among the last 200: a grid mounts cards again as they scroll back', () => {
    const first = hashOf(1);
    renderHook(() => useThumbHash(first));
    const before = decodes();
    renderHook(() => useThumbHash(first));
    expect(decodes()).toBe(before);

    // 200 other hashes later, it has to be decoded again.
    for (let n = 2; n <= 201; n++) renderHook(() => useThumbHash(hashOf(n)));
    const after = decodes();
    renderHook(() => useThumbHash(first));
    expect(decodes()).toBe(after + 1);
  });

  it('decodes on the server too, so the placeholder is in the first HTML', () => {
    function Placeholder() {
      return <img src={useThumbHash(portrait)} alt="" />;
    }
    expect(renderToString(<Placeholder />)).toContain('src="data:image/png;base64,');
  });
});

describe('thumbHashColor', () => {
  it('is the average color, as CSS', () => {
    expect(thumbHashColor(landscape)).toMatch(/^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/);
    expect(thumbHashColor(portrait)).not.toBe(thumbHashColor(landscape));
  });

  it('is undefined for a hash that doesn’t decode', () => {
    expect(thumbHashColor('not base64!')).toBeUndefined();
  });
});
