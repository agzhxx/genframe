import { posterSrcSet, posterUrl, type FeedImage } from '@/lib/feed-media';
import { cn } from '@/lib/utils';

/**
 * A Feed poster in the size the layout needs: AVIF where the browser takes it, WebP otherwise.
 * The <picture> has no box of its own, so the image sizes against its container.
 */
export function FeedPicture({
  image,
  alt,
  sizes,
  className,
}: {
  image: FeedImage;
  alt: string;
  /** The width it's shown at, as an `<img sizes>` value. */
  sizes: string;
  className?: string;
}) {
  return (
    <picture className="contents">
      <source type="image/avif" srcSet={posterSrcSet(image, 'avif')} sizes={sizes} />
      <img
        src={posterUrl(image, 960, 'webp')}
        srcSet={posterSrcSet(image, 'webp')}
        sizes={sizes}
        width={image.width}
        height={image.height}
        alt={alt}
        decoding="async"
        draggable={false}
        className={cn('object-cover', className)}
      />
    </picture>
  );
}
