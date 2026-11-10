export type UploadKind = 'logo' | 'music';

const MIME_TO_CANONICAL_EXT = {
  logo: new Map<
    string,
    { canonical: 'png' | 'jpg' | 'webp'; validExts: readonly string[]; contentType: string }
  >([
    ['image/png', { canonical: 'png', validExts: ['png'], contentType: 'image/png' }],
    ['image/jpeg', { canonical: 'jpg', validExts: ['jpg', 'jpeg'], contentType: 'image/jpeg' }],
    ['image/webp', { canonical: 'webp', validExts: ['webp'], contentType: 'image/webp' }],
  ]),
  music: new Map<
    string,
    { canonical: 'mp3' | 'ogg' | 'wav' | 'aac'; validExts: readonly string[]; contentType: string }
  >([
    ['audio/mpeg', { canonical: 'mp3', validExts: ['mp3'], contentType: 'audio/mpeg' }],
    ['audio/mp3', { canonical: 'mp3', validExts: ['mp3'], contentType: 'audio/mpeg' }],
    ['audio/ogg', { canonical: 'ogg', validExts: ['ogg'], contentType: 'audio/ogg' }],
    ['audio/wav', { canonical: 'wav', validExts: ['wav'], contentType: 'audio/wav' }],
    ['audio/x-wav', { canonical: 'wav', validExts: ['wav'], contentType: 'audio/wav' }],
    ['audio/aac', { canonical: 'aac', validExts: ['aac'], contentType: 'audio/aac' }],
    ['audio/x-aac', { canonical: 'aac', validExts: ['aac'], contentType: 'audio/aac' }],
  ]),
} as const;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB matching storage bucket

function matchesMagicBytes(canonicalExt: string, bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;

  switch (canonicalExt) {
    case 'png':
      return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    case 'jpg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'webp':
      return (
        bytes.length >= 12 &&
        bytes[0] === 0x52 && // R
        bytes[1] === 0x49 && // I
        bytes[2] === 0x46 && // F
        bytes[3] === 0x46 && // F
        bytes[8] === 0x57 && // W
        bytes[9] === 0x45 && // E
        bytes[10] === 0x42 && // B
        bytes[11] === 0x50 // P
      );
    case 'wav':
      return (
        bytes.length >= 12 &&
        bytes[0] === 0x52 && // R
        bytes[1] === 0x49 && // I
        bytes[2] === 0x46 && // F
        bytes[3] === 0x46 && // F
        bytes[8] === 0x57 && // W
        bytes[9] === 0x41 && // A
        bytes[10] === 0x56 && // V
        bytes[11] === 0x45 // E
      );
    case 'ogg':
      return bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53; // OggS
    case 'mp3':
      return (
        (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || // ID3
        (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) // MPEG frame sync
      );
    case 'aac':
      return (
        (bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0) || // ADTS sync
        (bytes.length >= 8 &&
          bytes[4] === 0x66 &&
          bytes[5] === 0x74 &&
          bytes[6] === 0x79 &&
          bytes[7] === 0x70) // ftyp
      );
    default:
      return false;
  }
}

export function validateUploadMetadataAndBytes(params: {
  fileName: string;
  mimeType: string;
  kind: UploadKind;
  headerBytes: Uint8Array;
}):
  | { ok: true; ext: string; contentType: string }
  | { ok: false; error: string } {
  const { fileName, mimeType, kind, headerBytes } = params;

  const trimmedName = fileName.trim();
  const dotIdx = trimmedName.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === trimmedName.length - 1) {
    return { ok: false, error: 'Tên tệp thiếu phần mở rộng hợp lệ.' };
  }

  const fileExt = trimmedName.slice(dotIdx + 1).toLowerCase();
  const mime = mimeType.toLowerCase().trim();
  const mimeRule = MIME_TO_CANONICAL_EXT[kind].get(mime);

  if (!mimeRule) {
    return {
      ok: false,
      error:
        kind === 'logo'
          ? 'Định dạng MIME ảnh không hợp lệ (chỉ hỗ trợ PNG, JPEG, WEBP; không cho phép SVG).'
          : 'Định dạng MIME âm thanh không hợp lệ (chỉ hỗ trợ MP3, OGG, WAV, AAC).',
    };
  }

  if (!mimeRule.validExts.includes(fileExt)) {
    return {
      ok: false,
      error: `Phần mở rộng tệp (.${fileExt}) không khớp với loại dữ liệu ${mime}.`,
    };
  }

  if (!matchesMagicBytes(mimeRule.canonical, headerBytes)) {
    return {
      ok: false,
      error: 'Nội dung tệp không khớp chữ ký định dạng cho phép (magic bytes mismatch).',
    };
  }

  return {
    ok: true,
    ext: mimeRule.canonical,
    contentType: mimeRule.contentType,
  };
}
