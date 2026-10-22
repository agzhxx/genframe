'use client';

import { useState } from 'react';
import { Playground } from '@/components/docs/playground';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/registry/hooks/use-reduced-motion';

/**
 * useReducedMotion's playground: a square that slides along a track with full motion, and with
 * reduced motion appears at its new place with a fade. Both take their timing from the motion
 * tokens, so the toolbar's slow motion slows either down.
 */
export function UseReducedMotionDemo() {
  const [atEnd, setAtEnd] = useState(false);

  return (
    <Playground
      title="useReducedMotion demo"
      controls={
        <Controls
          atEnd={atEnd}
          onMove={() => {
            setAtEnd(!atEnd);
          }}
        />
      }
    >
      <Track atEnd={atEnd} />
    </Playground>
  );
}

function Track({ atEnd }: { atEnd: boolean }) {
  const reduced = useReducedMotion();

  return (
    <div data-motion={reduced ? 'reduce' : undefined} className="@container w-full max-w-md rounded-lg border bg-card p-2">
      <div
        // With reduced motion, each place gets a new square: it fades in there instead of sliding.
        key={reduced ? String(atEnd) : 'square'}
        data-slot="square"
        className={cn(
          'size-10 rounded-md bg-primary',
          'transition-transform duration-(--genframe-duration-base) ease-(--genframe-ease-out)',
          'in-data-[motion=reduce]:transition-opacity in-data-[motion=reduce]:starting:opacity-0',
          atEnd && 'translate-x-[calc(100cqw_-_100%)]',
        )}
      />
    </div>
  );
}

function Controls({ atEnd, onMove }: { atEnd: boolean; onMove: () => void }) {
  const reduced = useReducedMotion();

  return (
    <div className="flex flex-col items-start gap-3 text-sm">
      <Button variant="outline" onClick={onMove}>
        {atEnd ? 'Move back' : 'Move'}
      </Button>
      <p className="text-muted-foreground">
        <code>useReducedMotion()</code> returns <code className="text-foreground">{String(reduced)}</code>
      </p>
    </div>
  );
}
