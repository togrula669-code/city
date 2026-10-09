/**
 * Inspect file signatures. MIME from browsers is advisory and must not bypass
 * signature validation. This recognizes the container type, not its codecs.
 */
export function sniffMediaType(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return null;
  const is = (...values) => values.every((value, index) => bytes[index] === value);
  if (is(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (is(137, 80, 78, 71, 13, 10, 26, 10)) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF') {
    if (bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (bytes.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  }
  if (bytes.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  if (is(0x1a, 0x45, 0xdf, 0xa3)) return 'application/webm';
  // ISO BMFF/MP4: 'ftyp' is normally the first box, but free/skip/wide boxes
  // can appear before it. Walk bounded, well-formed top-level box headers.
  let cursor = 0;
  while (cursor + 8 <= Math.min(bytes.length, 4096)) {
    const size = bytes.readUInt32BE(cursor);
    const type = bytes.toString('ascii', cursor + 4, cursor + 8);
    if (type === 'ftyp' && size >= 16 && cursor + size <= bytes.length) return 'application/mp4';
    if (!['free', 'skip', 'wide'].includes(type) || size < 8 || cursor + size > bytes.length) break;
    cursor += size;
  }
  if (bytes.toString('ascii', 0, 3) === 'ID3' && bytes.length >= 10) {
    // A valid ID3v2 header has a major version 2–4 and 7-bit syncsafe size.
    if ([2,3,4].includes(bytes[3]) && [6,7,8,9].every(i => bytes[i] < 128)) return 'audio/mpeg';
  }
  // MPEG Audio frame sync: covers FF FB, FF FA (CRC), FF F3, FF F2 and
  // MPEG-2.5 frames; excludes reserved versions/layers and invalid bitrate.
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 &&
      ((bytes[1] >> 3) & 0x3) !== 1 && ((bytes[1] >> 1) & 0x3) !== 0 &&
      ((bytes[2] >> 4) & 0xf) !== 15) return 'audio/mpeg';
  return null;
}

export function normalizeMediaMime(mime = '') {
  const value = String(mime).toLowerCase().split(';', 1)[0].trim();
  const aliases = {
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/mp3': 'audio/mpeg',
    'audio/x-mp3': 'audio/mpeg',
    'audio/x-m4a': 'audio/mp4',
    'audio/m4a': 'audio/mp4'
  };
  return aliases[value] || value;
}

export function mediaSignatureMatches(bytes, mime) {
  const type = sniffMediaType(bytes);
  const claimed = normalizeMediaMime(mime);
  if (type === 'application/webm') return claimed === 'audio/webm' || claimed === 'video/webm';
  if (type === 'application/mp4') return claimed === 'audio/mp4' || claimed === 'video/mp4';
  return type !== null && type === claimed;
}

export function mediaMismatchMessage(bytes, mime) {
  const actual = sniffMediaType(bytes);
  if (actual === 'application/webm') return `The file is a WebM container but was submitted as ${mime}. Please upload it as a WebM audio or video file.`;
  if (actual === 'application/mp4') return `The file is an MP4 container but was submitted as ${mime}. Please upload it as MP4/M4A audio or video.`;
  if (actual) return `The file appears to contain ${actual} data, but the selected format is ${mime}. Please choose the original file or convert it to a supported format.`;
  return `The file format could not be verified as ${mime}. Please convert or export it as JPG, PNG, WebP, MP3, WAV, OGG, WebM or MP4 and retry. Changing only the file extension will not work.`;
}
