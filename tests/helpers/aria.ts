import { within } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * Checks that an element has a role, explicit or implied by its tag (a <button> is a button),
 * and optionally an accessible name, the way assistive technology computes them.
 */
export function expectRole(element: HTMLElement, role: string, name?: string | RegExp) {
  const matches = within(element.ownerDocument.body).queryAllByRole(role, {
    hidden: true,
    ...(name === undefined ? {} : { name }),
  });
  expect(matches, `role "${role}"${name === undefined ? '' : ` named ${String(name)}`}`).toContain(element);
}

/**
 * Checks ARIA states and properties, named without the `aria-` prefix. Values compare as the
 * attribute's text (true → "true", 60 → "60"); null means the attribute must be absent.
 *
 *   expectAriaState(slider, { valuenow: 60, valuetext: '60% final', disabled: null })
 */
export function expectAriaState(element: HTMLElement, states: Record<string, string | number | boolean | null>) {
  const actual = Object.fromEntries(Object.keys(states).map((name) => [name, element.getAttribute(`aria-${name}`)]));
  const expected = Object.fromEntries(
    Object.entries(states).map(([name, value]) => [name, value === null ? null : String(value)]),
  );
  expect(actual).toEqual(expected);
}

// What screen readers treat as a live region.
const liveRegion = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';

/** The text in each live region now, in document order (empty regions left out). */
export function liveRegionText(container: ParentNode = document.body) {
  return [...container.querySelectorAll(liveRegion)]
    .map((region) => region.textContent.trim())
    .filter((text) => text.length > 0);
}

/**
 * Records what live regions announce: each time a region's content changes, its new text joins
 * `messages`, roughly what a screen reader would read out. A region added with text already in
 * it isn't announced, as with real screen readers. Mutations are delivered between tasks, so
 * await something (a user-event call, waitFor) before reading `messages`.
 */
export function recordAnnouncements(container: Node = document.body) {
  const messages: string[] = [];
  const observer = new MutationObserver((mutations) => {
    const changed = new Set<Element>();
    for (const { target } of mutations) {
      const element = target instanceof Element ? target : target.parentElement;
      const region = element?.closest(liveRegion);
      if (region) changed.add(region);
    }
    for (const region of changed) {
      const text = region.textContent.trim();
      if (text) messages.push(text);
    }
  });
  observer.observe(container, { childList: true, characterData: true, subtree: true });
  return {
    messages,
    stop() {
      observer.disconnect();
    },
  };
}
