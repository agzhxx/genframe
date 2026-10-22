'use client';

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';

// The controls of the docs' playgrounds: the toolbar's two switches and each demo's own.

export function SwitchControl({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} size="sm" checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="font-normal text-muted-foreground">
        {label}
      </Label>
    </div>
  );
}

export function SelectControl<Value extends string>({
  label,
  value,
  options,
  onValueChange,
  inline = false,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onValueChange: (value: Value) => void;
  /** The label beside the select, for a toolbar, rather than above it. */
  inline?: boolean;
}) {
  const id = useId();
  return (
    <div className={inline ? 'flex items-center gap-2' : 'flex flex-col gap-1.5'}>
      <Label htmlFor={id} className="font-normal text-muted-foreground">
        {label}
      </Label>
      <NativeSelect
        id={id}
        size={inline ? 'sm' : 'default'}
        className={inline ? undefined : 'w-full'}
        value={value}
        onChange={(event) => {
          const chosen = options.find((option) => option.value === event.target.value);
          if (chosen) onValueChange(chosen.value);
        }}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
