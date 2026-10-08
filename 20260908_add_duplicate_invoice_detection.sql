-- ==========================================================
-- Migration: 20260908_add_duplicate_invoice_detection.sql
-- Feature: Duplicate Invoice Detection & Audit Trail
-- ==========================================================

-- 1. Add duplicate tracking fields to public.documents
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS duplicate_of_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS duplicate_meta JSONB DEFAULT '{}'::jsonb;

-- 2. Add performance index on is_duplicate for fast filtering and history view
CREATE INDEX IF NOT EXISTS idx_documents_is_duplicate ON public.documents(is_duplicate);
CREATE INDEX IF NOT EXISTS idx_documents_duplicate_of_id ON public.documents(duplicate_of_id);
