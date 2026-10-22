'use client';

import { useEffect, useState } from 'react';
import { SwitchControl } from '@/components/docs/controls';
import { Playground } from '@/components/docs/playground';
import { byKind, demoModels, pricesChecked } from '@/lib/demo-models';
import { cameraScenes, posterUrl } from '@/lib/feed-media';
import { estimateCost, formatEstimate } from '@/registry/lib/estimate-cost';
import { AspectRatioPicker } from '@/registry/ui/aspect-ratio-picker/aspect-ratio-picker';
import { ModelPicker } from '@/registry/ui/model-picker/model-picker';
import {
  PromptComposer,
  type PresetGroup,
  type PromptReference,
  type PromptSubmission,
} from '@/registry/ui/prompt-composer/prompt-composer';

function group(label: string, names: string[]): PresetGroup {
  return { label, presets: names.map((name) => ({ id: name.toLowerCase().replaceAll(' ', '-'), label: name })) };
}

// The camera moves are the Feed's Cinema Studio presets (spec 3.8); the styles, its prompts' looks.
const presets = [
  group('Camera', ['Dolly in', 'Dolly out', 'Orbit', 'Crane up', 'Crash zoom', 'Whip pan', 'Dolly zoom', 'Bullet time']),
  group('Style', ['Film still', 'Editorial', 'Painted', 'Fine art']),
];
const presetLabels = new Map(presets.flatMap((entry) => entry.presets.map((preset) => [preset.id, preset.label])));

const ratios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
const models = demoModels('sale');

// Two of the Feed's camera scenes to start with; room for four.
const firstReferences: PromptReference[] = cameraScenes.slice(0, 2).map(({ name, image }) => ({
  id: name,
  name,
  src: posterUrl(image, 160, 'webp'),
  alt: image.description,
}));

// The demo's stand-in for a request: it takes a second.
const SENDING_MS = 1000;

interface Sent extends PromptSubmission {
  model: string;
  ratio: string;
  cost: string;
}

/**
 * PromptComposer's playground, and a first glimpse of the Studio: ModelPicker and a compact
 * AspectRatioPicker in its toolbar, and the cost of a run from estimateCost as its cost hint.
 */
export function PromptComposerDemo() {
  const [references, setReferences] = useState(firstReferences);
  const [modelId, setModelId] = useState('kling-2.5');
  const [ratio, setRatio] = useState('16:9');
  const [submitOnEnter, setSubmitOnEnter] = useState(false);
  const [limit, setLimit] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [sending, setSending] = useState<Sent | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const model = models.find((entry) => entry.id === modelId);
  const settings = { count: 1, references: references.length };
  const estimate = model ? estimateCost(model, { ...settings, duration: model.durations?.[0] }) : null;
  const cost = estimate ? formatEstimate(estimate) : null;

  useEffect(() => {
    if (!sending) return;
    const timer = setTimeout(() => {
      setSent(sending);
      setSending(null);
    }, SENDING_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [sending]);

  return (
    <Playground
      title="PromptComposer demo"
      wide
      controls={
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <SwitchControl label="Submit on Enter" checked={submitOnEnter} onCheckedChange={setSubmitOnEnter} />
          <SwitchControl label="300-character limit" checked={limit} onCheckedChange={setLimit} />
          <SwitchControl label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
        </div>
      }
    >
      <div className="flex w-full flex-col gap-4">
        <PromptComposer
          placeholder="Describe the shot; type @ to mention a reference"
          references={references}
          onReferencesChange={setReferences}
          maxReferences={4}
          presets={presets}
          defaultSelectedPresets={['dolly-in']}
          maxLength={limit ? 300 : undefined}
          submitOnEnter={submitOnEnter}
          disabled={disabled}
          loading={sending !== null}
          toolbar={
            <>
              <ModelPicker
                models={models}
                value={modelId}
                onValueChange={setModelId}
                settings={settings}
                groupBy={byKind}
                className="w-44"
              />
              <AspectRatioPicker compact ratios={ratios} value={ratio} onValueChange={setRatio} />
            </>
          }
          costHint={cost ? `${cost.breakdown} ${cost.total}` : undefined}
          onSubmit={(submission) => {
            setSending({
              ...submission,
              model: model?.name ?? '',
              ratio,
              cost: cost ? cost.total : '',
            });
          }}
        />
        {sent ? (
          <dl
            data-slot="demo-submission"
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border bg-card p-3 text-xs"
          >
            <dt className="text-muted-foreground">Submitted</dt>
            <dd className="break-words">{sent.text}</dd>
            <dt className="text-muted-foreground">References</dt>
            <dd>{sent.references.map((reference) => `@${reference.name}`).join(', ') || 'None'}</dd>
            <dt className="text-muted-foreground">Presets</dt>
            <dd>{sent.presets.map((id) => presetLabels.get(id)).join(', ') || 'None'}</dd>
            <dt className="text-muted-foreground">Run</dt>
            <dd>
              {sent.model}, {sent.ratio}, {sent.cost}
            </dd>
          </dl>
        ) : null}
        <p className="text-xs text-muted-foreground">
          References: AI-generated stills from Generation Feed. Example prices: Higgsfield’s API prices,
          checked on {pricesChecked}.
        </p>
      </div>
    </Playground>
  );
}
