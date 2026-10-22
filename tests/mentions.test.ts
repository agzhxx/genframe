// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  activeMention,
  findMentions,
  insertMention,
  matchReferences,
  mentionedReferences,
  referenceName,
} from '@/registry/ui/prompt-composer/mentions';

const car = { name: 'car' };
const alley = { name: 'alley' };
const carpet = { name: 'Carpet' };
const scar = { name: 'scar' };

/** The text with a "|" where the caret is: "@ca|r" → { text: "@car", caret: 3 }. */
function at(marked: string) {
  return { text: marked.replace('|', ''), caret: marked.indexOf('|') };
}

describe('findMentions', () => {
  it('finds each @name, with where it starts and ends', () => {
    expect(findMentions('Use @car on @alley.')).toEqual([
      { start: 4, end: 8, name: 'car' },
      { start: 12, end: 18, name: 'alley' },
    ]);
  });

  it('ends a name at the first character that can’t be in one', () => {
    expect(findMentions('(@car), @car-2; @my_car!').map((mention) => mention.name)).toEqual(['car', 'car-2', 'my_car']);
  });

  it('takes letters and digits from any script', () => {
    expect(findMentions('@машина и @車2').map((mention) => mention.name)).toEqual(['машина', '車2']);
  });

  it('ignores an @ after a letter, a digit or another @, and a bare @', () => {
    expect(findMentions('me@example.com 3@4 @@car @ alone')).toEqual([]);
  });
});

describe('activeMention', () => {
  it('finds the mention being typed at the caret', () => {
    const { text, caret } = at('Look at @ca|');
    expect(activeMention(text, caret)).toEqual({ start: 8, end: 11, query: 'ca' });
  });

  it('starts with a bare @', () => {
    const { text, caret } = at('Look at @|');
    expect(activeMention(text, caret)).toEqual({ start: 8, end: 9, query: '' });
  });

  it('reads the query up to the caret, and the word to its end', () => {
    const { text, caret } = at('@ca|rpet, then');
    expect(activeMention(text, caret)).toEqual({ start: 0, end: 7, query: 'ca' });
  });

  it('is null outside a mention', () => {
    for (const marked of ['|@car', '@car |', 'no mention|', 'me@ex|', '@car, th|en', '|']) {
      const { text, caret } = at(marked);
      expect(activeMention(text, caret), marked).toBeNull();
    }
  });
});

describe('insertMention', () => {
  it('replaces the typed @query, and adds a space at the end of the text', () => {
    const { text, caret } = at('Look at @ca|');
    const mention = activeMention(text, caret);
    if (!mention) throw new Error('no mention');
    expect(insertMention(text, mention, 'car')).toEqual({ text: 'Look at @car ', caret: 13 });
  });

  it('replaces the whole word in the middle of the text, and adds nothing', () => {
    const { text, caret } = at('A @al|y, at dusk');
    const mention = activeMention(text, caret);
    if (!mention) throw new Error('no mention');
    expect(insertMention(text, mention, 'alley')).toEqual({ text: 'A @alley, at dusk', caret: 8 });
  });
});

describe('mentionedReferences', () => {
  it('lists the mentioned references in their own order, matching names ignoring case', () => {
    expect(mentionedReferences('@ALLEY then @car', [car, alley, carpet])).toEqual([car, alley]);
    expect(mentionedReferences('@carpet', [car, carpet])).toEqual([carpet]);
  });

  it('ignores mentions of no reference, and references named twice count once', () => {
    expect(mentionedReferences('@boat @car @car', [car, alley])).toEqual([car]);
  });

  it('follows the text through edits', () => {
    const references = [car, alley];
    expect(mentionedReferences('@car', references)).toEqual([car]);
    // Text added before a mention doesn't move it out of the list.
    expect(mentionedReferences('A red @car', references)).toEqual([car]);
    // A letter deleted from it, or added to it, does.
    expect(mentionedReferences('A red @ca', references)).toEqual([]);
    expect(mentionedReferences('A red @cars', references)).toEqual([]);
    // So does an email-like join.
    expect(mentionedReferences('A red@car', references)).toEqual([]);
  });
});

describe('matchReferences', () => {
  it('offers names that start with the query, then names that contain it, ignoring case', () => {
    expect(matchReferences([scar, alley, car, carpet], 'CAR')).toEqual([car, carpet, scar]);
  });

  it('offers every reference for an empty query, in order', () => {
    expect(matchReferences([car, alley], '')).toEqual([car, alley]);
  });

  it('offers nothing when nothing matches', () => {
    expect(matchReferences([car, alley], 'boat')).toEqual([]);
  });
});

describe('referenceName', () => {
  it('names a reference after its file', () => {
    expect(referenceName('car.png', [])).toBe('car');
    expect(referenceName('Red Car (2).PNG', [])).toBe('red-car-2');
    expect(referenceName('my_ref--final.webp', [])).toBe('my_ref-final');
    expect(referenceName('Машина.jpg', [])).toBe('машина');
  });

  it('falls back to "image", and keeps names short', () => {
    expect(referenceName('.png', [])).toBe('image');
    expect(referenceName('(((.jpg', [])).toBe('image');
    expect(referenceName(`${'a'.repeat(31)} b c.png`, [])).toBe('a'.repeat(31));
  });

  it('numbers a name that’s taken, ignoring case', () => {
    expect(referenceName('car.png', ['Car'])).toBe('car-2');
    expect(referenceName('car.png', ['car', 'car-2'])).toBe('car-3');
    expect(referenceName('image.png', ['image'])).toBe('image-2');
  });
});
