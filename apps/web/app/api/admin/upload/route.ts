import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { enforceApiRateLimit } from '@/lib/rate-limit';

const ALLOWED_IMAGE_MIME_TYPES = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

const ALLOWED_AUDIO_MIME_TYPES = new Map<string, string>([
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/aac', 'aac'],
]);

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB matching storage bucket

export async function POST(req: Request) {
  const auth = await requireApiRole(['admin']);
  if (!auth.ok) return auth.response;

  const limited = enforceApiRateLimit(req, 'admin:upload', auth.actor.user.id, 15, 60_000);
  if (limited) return limited;

  try {
    const formData = await req.formData();
    const fileEntry = formData.get('file');
    const eventIdRaw = formData.get('event_id');
    const kindRaw = formData.get('kind');

    const eventIdParse = z.string().uuid().safeParse(eventIdRaw);
    const kindParse = z.enum(['logo', 'music']).safeParse(kindRaw);

    if (!eventIdParse.success || !kindParse.success) {
      return NextResponse.json({ error: 'Tham số tải lên không hợp lệ.' }, { status: 400 });
    }

    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: 'Chưa chọn tệp tin để tải lên.' }, { status: 400 });
    }

    if (fileEntry.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Dung lượng tệp vượt quá giới hạn 25MB.' },
        { status: 400 }
      );
    }

    const mime = fileEntry.type.toLowerCase();
    const ext =
      kindParse.data === 'logo'
        ? ALLOWED_IMAGE_MIME_TYPES.get(mime)
        : ALLOWED_AUDIO_MIME_TYPES.get(mime);

    if (!ext) {
      return NextResponse.json(
        {
          error:
            kindParse.data === 'logo'
              ? 'Định dạng ảnh không hợp lệ (chỉ hỗ trợ PNG, JPEG, WEBP; không cho phép SVG).'
              : 'Định dạng âm thanh không hợp lệ (chỉ hỗ trợ MP3, OGG, WAV, AAC).',
        },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    const filePath = `${eventIdParse.data}/${kindParse.data}-${Date.now()}.${ext}`;
    const arrayBuffer = await fileEntry.arrayBuffer();

    const { error: uploadErr } = await admin.storage
      .from('event-assets')
      .upload(filePath, arrayBuffer, {
        contentType: mime === 'audio/mp3' ? 'audio/mpeg' : mime === 'audio/x-wav' ? 'audio/wav' : mime,
        upsert: true,
      });

    if (uploadErr) {
      return NextResponse.json(
        { error: `Không thể tải tệp lên kho lưu trữ: ${uploadErr.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = admin.storage.from('event-assets').getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;

    const columnToUpdate =
      kindParse.data === 'logo'
        ? { logo_url: publicUrl, updated_at: new Date().toISOString() }
        : { bg_music_url: publicUrl, updated_at: new Date().toISOString() };

    const { error: updateErr } = await admin
      .from('events')
      .update(columnToUpdate)
      .eq('id', eventIdParse.data);

    if (updateErr) {
      return NextResponse.json(
        { error: `Tải tệp thành công nhưng lưu cấu hình thất bại: ${updateErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: publicUrl, path: filePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lỗi tải tệp lên.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
