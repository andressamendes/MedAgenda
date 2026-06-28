-- ============================================================
-- Etapa 16 — Storage: avatars bucket
-- Execute APÓS criar o bucket 'avatars' no Supabase Dashboard:
--   Storage → New Bucket → Name: avatars → Public: yes
-- ============================================================

-- ── Storage RLS policies ────────────────────────────────────────────────────

-- Allow authenticated users to upload their own avatar
CREATE POLICY "avatars_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to update/replace their own avatar
CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to delete their own avatar
CREATE POLICY "avatars_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow public read access so avatar URLs work without authentication
CREATE POLICY "avatars_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
