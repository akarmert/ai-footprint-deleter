// Single source of truth for which IPTC Digital Source Type values count as an
// explicit AI declaration. Used by the C2PA Actions reader, the XMP analyzer and
// the result text classifiers. Values are unverified claims, never proof.
// Vocabulary: https://cv.iptc.org/newscodes/digitalsourcetype/

const BASES = [
  'http://cv.iptc.org/newscodes/digitalsourcetype/',
  'https://cv.iptc.org/newscodes/digitalsourcetype/',
] as const;

export const AI_DIGITAL_SOURCE_TYPE_TERMS = [
  // Created by a trained model (text-to-image, etc.).
  'trainedAlgorithmicMedia',
  // Composite that includes trained-model output (AI edit, generative fill).
  'compositeWithTrainedAlgorithmicMedia',
] as const;

export type AiDigitalSourceTypeTerm = (typeof AI_DIGITAL_SOURCE_TYPE_TERMS)[number];

/** Returns the AI term when value is an exact IPTC Digital Source Type URI from the AI list. */
export function aiDigitalSourceTypeTerm(value: string | undefined): AiDigitalSourceTypeTerm | undefined {
  if (!value) return undefined;
  const base = BASES.find(b => value.startsWith(b));
  if (!base) return undefined;
  const term = value.slice(base.length);
  return (AI_DIGITAL_SOURCE_TYPE_TERMS as readonly string[]).includes(term)
    ? (term as AiDigitalSourceTypeTerm)
    : undefined;
}

export function isAiDigitalSourceType(value: string | undefined): boolean {
  return aiDigitalSourceTypeTerm(value) !== undefined;
}

/** Regex source matching any AI term as a whole word (for free-text previews). */
export const AI_DIGITAL_SOURCE_TERM_PATTERN = `(?:${AI_DIGITAL_SOURCE_TYPE_TERMS.join('|')})`;

/** Regex source matching a full AI Digital Source Type URI. */
export const AI_DIGITAL_SOURCE_TYPE_URI_PATTERN = `https?:\\/\\/cv\\.iptc\\.org\\/newscodes\\/digitalsourcetype\\/${AI_DIGITAL_SOURCE_TERM_PATTERN}`;
