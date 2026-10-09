import test from 'node:test';
import assert from 'node:assert/strict';
import { sniffMediaType, mediaSignatureMatches, normalizeMediaMime, mediaMismatchMessage } from '../../server/src/services/media-type.js';
const padded = array => Buffer.concat([Buffer.from(array), Buffer.alloc(40)]);
test('recognizes standard JPEG, PNG, WEBP and WAV magic',()=>{
  assert.equal(sniffMediaType(padded([0xff,0xd8,0xff])), 'image/jpeg');
  assert.equal(sniffMediaType(padded([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(sniffMediaType(Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),Buffer.alloc(40)])), 'image/webp');
  assert.equal(sniffMediaType(Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVE'),Buffer.alloc(40)])), 'audio/wav');
});
test('accepts valid MP3 frame headers including CRC FF FA without accepting random bytes',()=>{
  for(const header of [[0xff,0xfb,0x90,0x64],[0xff,0xfa,0x90,0x64],[0xff,0xf3,0x90,0x64],[0xff,0xe3,0x90,0x64]]) {
    assert.equal(mediaSignatureMatches(padded(header), 'audio/mpeg'),true,header.map(x=>x.toString(16)).join(' '));
  }
  assert.equal(mediaSignatureMatches(padded([0xff,0xe9,0xf0,0x64]), 'audio/mpeg'),false);
  assert.equal(mediaSignatureMatches(Buffer.alloc(80), 'audio/mpeg'),false);
});
test('recognizes ID3 tags with legal header',()=>{
  assert.equal(mediaSignatureMatches(padded([73,68,51,4,0,0,0,0,0,20]),'audio/mpeg'),true);
  assert.equal(mediaSignatureMatches(padded([73,68,51,99,0,0,0,0,0,20]),'audio/mpeg'),false);
});
test('normalizes browser MIME aliases and codec parameters',()=>{
  assert.equal(normalizeMediaMime('audio/x-m4a'), 'audio/mp4');
  assert.equal(normalizeMediaMime('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(normalizeMediaMime('audio/mp3'), 'audio/mpeg');
});
test('supports valid MP4 with and without preceding free box',()=>{
  const ftyp=Buffer.concat([Buffer.from([0,0,0,20]),Buffer.from('ftyp'),Buffer.from('isom'),Buffer.alloc(8)]);
  assert.equal(mediaSignatureMatches(ftyp,'video/mp4'),true);
  assert.equal(mediaSignatureMatches(ftyp,'audio/x-m4a'),true);
  const free=Buffer.concat([Buffer.from([0,0,0,8]),Buffer.from('free'),ftyp]);
  assert.equal(mediaSignatureMatches(free,'video/mp4'),true);
});
test('rejects real content mismatch even if file name or mime is misleading',()=>{
  const jpg=padded([0xff,0xd8,0xff]);
  assert.equal(mediaSignatureMatches(jpg,'image/png'),false);
  assert.match(mediaMismatchMessage(jpg,'image/png'),/image\/jpeg/);
  assert.equal(mediaSignatureMatches(Buffer.alloc(100),'image/jpeg'),false);
});
test('accepts WebM header for both audio and video',()=>{
  const webm=padded([0x1a,0x45,0xdf,0xa3]);
  assert.equal(mediaSignatureMatches(webm,'audio/webm'),true);
  assert.equal(mediaSignatureMatches(webm,'video/webm'),true);
  assert.equal(mediaSignatureMatches(webm,'image/jpeg'),false);
});
