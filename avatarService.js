import { supabase, currentUserId } from './supabase.js';

const BUCKET       = 'avatars';
const MAX_SIZE_MB  = 2;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function uploadAvatar(file) {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('Formato não suportado. Use JPG, PNG, WebP ou GIF.');
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`Arquivo muito grande. Tamanho máximo: ${MAX_SIZE_MB} MB.`);
  }

  const id  = await currentUserId();
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `${id}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function removeAvatar() {
  const id = await currentUserId();

  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET)
    .list(id);

  if (listError) throw listError;
  if (!files?.length) return;

  const paths = files.map(f => `${id}/${f.name}`);
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}
