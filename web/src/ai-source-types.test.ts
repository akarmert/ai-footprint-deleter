import test from 'node:test';
import assert from 'node:assert/strict';
import { aiDigitalSourceTypeTerm, isAiDigitalSourceType } from './ai-source-types.ts';
import { aiEvidence, explicitTextDeclaration } from './results.ts';

const iptc = 'http://cv.iptc.org/newscodes/digitalsourcetype/';

test('AI Digital Source Type list matches exact IPTC URIs only', () => {
  assert.equal(aiDigitalSourceTypeTerm(`${iptc}trainedAlgorithmicMedia`), 'trainedAlgorithmicMedia');
  assert.equal(
    aiDigitalSourceTypeTerm(`${iptc}compositeWithTrainedAlgorithmicMedia`),
    'compositeWithTrainedAlgorithmicMedia',
  );
  assert.equal(isAiDigitalSourceType(`https://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia`), true);
  for (const value of [
    undefined,
    '',
    'trainedAlgorithmicMedia',
    `${iptc}algorithmicMedia`,
    `${iptc}compositeSynthetic`,
    `${iptc}digitalCapture`,
    `${iptc}trainedAlgorithmicMedia/`,
    `${iptc}TrainedAlgorithmicMedia`,
    `http://evil.example/${iptc}trainedAlgorithmicMedia`,
  ]) {
    assert.equal(isAiDigitalSourceType(value), false, String(value));
  }
});

test('result text classifiers use the same AI list', () => {
  assert.equal(aiEvidence('compositeWithTrainedAlgorithmicMedia'), true);
  assert.equal(aiEvidence('algorithmicMedia'), false);
  assert.equal(
    explicitTextDeclaration(
      `<Iptc4xmpExt:DigitalSourceType>${iptc}compositeWithTrainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>`,
    ),
    true,
  );
  assert.equal(explicitTextDeclaration(`i:DigitalSourceType="${iptc}trainedAlgorithmicMedia"`), true);
  assert.equal(explicitTextDeclaration(`i:DigitalSourceType="${iptc}algorithmicMedia"`), false);
});
