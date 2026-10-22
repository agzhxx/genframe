// A stand-in registry item for tests/sizes.test.ts: it uses everything the size check has to
// sort out. Its own files and class-variance-authority (an npm package it brings) count; React,
// shadcn's button, `cn` and another Genframe item don't.
import { cva } from 'class-variance-authority';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/registry/hooks/use-reduced-motion';
import { pressedLabel } from './label';

const widgetVariants = cva('rounded-md', { variants: { motion: { full: 'transition', reduced: '' } } });

export function Widget() {
  const [count, setCount] = useState(0);
  const reduced = useReducedMotion();

  return (
    <Button
      className={cn(widgetVariants({ motion: reduced ? 'reduced' : 'full' }))}
      onClick={() => {
        setCount(count + 1);
      }}
    >
      {pressedLabel(count)}
    </Button>
  );
}
