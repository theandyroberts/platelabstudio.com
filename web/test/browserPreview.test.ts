import test from 'node:test';
import assert from 'node:assert/strict';
import {browserPreviewUrl} from '../lib/browserPreview';

test('provisioned catalog clips use the small preview without changing time or URL parameters', () => {
  const base='/composite-review/media/composite/clip-sph-stk-legacy-20260803-ga-dtla-dtla-day01-clip-0031-0ae2445f12f4/';
  assert.equal(browserPreviewUrl(base+'composite.mp4'),base+'browser-preview-v1.mp4');
  assert.equal(browserPreviewUrl(base+'composite.mp4?review=1#t=4'),base+'browser-preview-v1.mp4?review=1#t=4');
  assert.equal(browserPreviewUrl(base+'browser-preview-v1.mp4'),base+'browser-preview-v1.mp4');
});

test('unprovisioned clips and unrelated URLs retain their working sources', () => {
  for(const source of ['/composite-review/media/composite/new-clip/composite.mp4','/media/demo.mp4','https://example.com/composite.mp4','/composite-review/media/composite/../composite.mp4']) {
    assert.equal(browserPreviewUrl(source),source);
  }
});
