import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptiveStreamUrl,browserPreviewUrl,cardPreviewUrl,videoSources} from '../lib/browserPreview';

const base='/composite-review/media/composite/clip-sph-stk-legacy-20260803-ga-dtla-dtla-day01-clip-0031-0ae2445f12f4/';
const unprovisioned=['/composite-review/media/composite/new-clip/composite.mp4','/media/demo.mp4','https://example.com/composite.mp4','/composite-review/media/composite/../composite.mp4'];

test('provisioned catalog clips use the small preview without changing time or URL parameters', () => {
  assert.equal(browserPreviewUrl(base+'composite.mp4'),base+'browser-preview-v1.mp4');
  assert.equal(browserPreviewUrl(base+'composite.mp4?review=1#t=4'),base+'browser-preview-v1.mp4?review=1#t=4');
  assert.equal(browserPreviewUrl(base+'browser-preview-v1.mp4'),base+'browser-preview-v1.mp4');
});

test('unprovisioned clips and unrelated URLs retain their working sources', () => {
  for(const source of unprovisioned) {
    assert.equal(browserPreviewUrl(source),source);
    assert.equal(cardPreviewUrl(source),source);
    assert.equal(adaptiveStreamUrl(source),undefined);
    assert.deepEqual(videoSources(source),{adaptive:undefined,progressive:source});
  }
});

test('provisioned clips offer an adaptive ladder with the progressive preview as fallback', () => {
  for(const file of ['composite.mp4','browser-preview-v1.mp4']) {
    assert.deepEqual(videoSources(base+file),{adaptive:base+'stream-v1/master.m3u8',progressive:base+'browser-preview-v1.mp4'});
  }
  // A media fragment addresses one file; it has no meaning on a playlist.
  assert.equal(adaptiveStreamUrl(base+'composite.mp4?review=1#t=4'),base+'stream-v1/master.m3u8?review=1');
});

test('catalog cards use the small hover preview for provisioned clips', () => {
  assert.equal(cardPreviewUrl(base+'composite.mp4'),base+'card-preview-v1.mp4');
  assert.equal(cardPreviewUrl(base+'browser-preview-v1.mp4'),base+'card-preview-v1.mp4');
});

test('adaptive streaming can be switched off without a code change', () => {
  process.env.NEXT_PUBLIC_ADAPTIVE_STREAMING='0';
  try {
    assert.deepEqual(videoSources(base+'composite.mp4'),{adaptive:undefined,progressive:base+'browser-preview-v1.mp4'});
  } finally {
    delete process.env.NEXT_PUBLIC_ADAPTIVE_STREAMING;
  }
});
