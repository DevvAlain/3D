import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiRole } from '@/lib/supabase/auth';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import {
  MAX_UPLOAD_BYTES,
  validateUploadMetadataAndBytes,
} from '@/lib/upload-validation';

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

    const arrayBuffer = await fileEntry.arrayBuffer();
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 16));
    const checked = validateUploadMetadataAndBytes({
      fileName: fileEntry.name,
      mimeType: fileEntry.type,
      kind: kindParse.data,
      headerBytes,
    });

    if (!checked.ok) {
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const filePath = `${eventIdParse.data}/${kindParse.data}-${Date.now()}.${checked.ext}`;

    const { error: uploadErr } = await admin.storage
      .from('event-assets')
      .upload(filePath, arrayBuffer, {
        contentType: checked.contentType,
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
