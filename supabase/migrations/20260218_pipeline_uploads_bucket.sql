-- Pipeline Uploads Storage Bucket
-- Temporary storage for large files during pipeline processing.
-- Files are uploaded by the client and downloaded by the server,
-- then cleaned up after pipeline completion.
--
-- Bucket: pipeline-uploads (private)
-- Structure: pipeline-temp/{user_id}/{session_id}/{filename}

-- 1. Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pipeline-uploads',
  'pipeline-uploads',
  false,
  104857600,  -- 100 MB per file
  ARRAY[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/x-step',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload pipeline files to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pipeline-uploads'
    AND (storage.foldername(name))[1] = 'pipeline-temp'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 3. Allow authenticated users to read their own pipeline files
-- (needed for the server to download via service key, but also allows user to re-download)
CREATE POLICY "Users can read own pipeline files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pipeline-uploads'
    AND (storage.foldername(name))[1] = 'pipeline-temp'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 4. Allow authenticated users to delete their own pipeline files
-- (cleanup after pipeline processing)
CREATE POLICY "Users can delete own pipeline files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'pipeline-uploads'
    AND (storage.foldername(name))[1] = 'pipeline-temp'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 5. Also ensure the project-files bucket exists (for permanent file storage)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'project-files',
  'project-files',
  false,
  104857600  -- 100 MB per file
)
ON CONFLICT (id) DO NOTHING;

-- Policies for project-files bucket (may already exist from schema.sql comments)
DO $$
BEGIN
  -- Upload policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Users can upload to own folder'
  ) THEN
    CREATE POLICY "Users can upload to own folder"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'project-files'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  -- Read policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Users can read own files'
  ) THEN
    CREATE POLICY "Users can read own files"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'project-files'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  -- Delete policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Users can delete own files'
  ) THEN
    CREATE POLICY "Users can delete own files"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'project-files'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;
