'use client';

import { useState } from 'react';
import { SelectControl, SwitchControl } from '@/components/docs/controls';
import { Playground } from '@/components/docs/playground';
import { byKind, demoModels, pricesChecked, type PriceLevel } from '@/lib/demo-models';
import { estimateCost, formatEstimate } from '@/registry/lib/estimate-cost';
import { ModelPicker } from '@/registry/ui/model-picker/model-picker';

const priceLevels: { value: PriceLevel; label: string }[] = [
  { value: 'sale', label: 'On sale, as checked' },
  { value: 'list', label: 'List price' },
];

const counts = ['1', '2', '4'].map((value) => ({ value, label: value }));
const referenceCounts = ['0', '1', '2'].map((value) => ({ value, label: value }));

/**
 * ModelPicker's playground: Higgsfield's models at the prices Generation Feed paid, with the
 * run's settings in the controls. Every option's estimate follows them, and so does the line under
 * the picker.
 */
export function ModelPickerDemo() {
  const [prices, setPrices] = useState<PriceLevel>('sale');
  const [count, setCount] = useState('1');
  const [references, setReferences] = useState('0');
  const [grouped, setGrouped] = useState(true);
  const [value, setValue] = useState('kling-2.5');
  const models = demoModels(prices);
  const settings = { count: Number(count), references: Number(references) };
  const chosen = models.find((model) => model.id === value);
  // As the picker does: a video model's first clip length.
  const estimate = chosen ? estimateCost(chosen, { ...settings, duration: chosen.durations?.[0] }) : null;
  const cost = estimate ? formatEstimate(estimate) : null;

  return (
    <Playground
      title="ModelPicker demo"
      controls={
        <div className="flex flex-col gap-4 text-sm">
          <SelectControl label="Prices" value={prices} options={priceLevels} onValueChange={setPrices} />
          <SelectControl label="Images or videos per run" value={count} options={counts} onValueChange={setCount} />
          <SelectControl
            label="Reference images"
            value={references}
            options={referenceCounts}
            onValueChange={setReferences}
          />
          <SwitchControl label="Group by kind" checked={grouped} onCheckedChange={setGrouped} />
        </div>
      }
    >
      <div className="flex w-full flex-col items-center gap-4 text-center">
        <ModelPicker
          models={models}
          value={value}
          onValueChange={setValue}
          settings={settings}
          groupBy={grouped ? byKind : undefined}
          className="w-60"
        />
        <p className="text-sm text-muted-foreground">
          {chosen?.name}:{' '}
          <output data-slot="demo-estimate" className="text-foreground tabular-nums">
            {cost ? `${cost.breakdown} ${cost.total}` : null}
          </output>
        </p>
        <p className="text-xs text-muted-foreground">
          Example prices: Higgsfield’s API prices, checked on {pricesChecked}.
        </p>
      </div>
    </Playground>
  );
}
