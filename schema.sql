-- ==========================================================
-- AI OCR STUDIO - DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- Production-Ready Schema with RLS, Triggers, & Indexes
-- ==========================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'auditor')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (
        status IN (
            'uploaded',
            'ocr_processing',
            'extracting',
            'cleaning',
            'ready_for_validation',
            'approved',
            'rejected'
        )
    ),
    document_type TEXT NOT NULL DEFAULT 'Unknown',
    confidence_score NUMERIC(5, 2) DEFAULT 0.00 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    page_count INT DEFAULT 1,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. OCR RESULTS TABLE (Azure Document Intelligence output)
CREATE TABLE IF NOT EXISTS public.ocr_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    raw_text TEXT NOT NULL,
    page_count INT DEFAULT 1,
    tables JSONB DEFAULT '[]'::jsonb,
    key_value_pairs JSONB DEFAULT '[]'::jsonb,
    lines JSONB DEFAULT '[]'::jsonb,
    provider TEXT NOT NULL DEFAULT 'azure',
    model_used TEXT DEFAULT 'prebuilt-layout',
    raw_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. AI RESULTS TABLE (OpenAI Structured Extraction & Cleaner)
CREATE TABLE IF NOT EXISTS public.ai_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    overall_confidence NUMERIC(5, 2) DEFAULT 0.00,
    field_confidences JSONB DEFAULT '{}'::jsonb,
    raw_extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    cleaned_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_errors JSONB DEFAULT '[]'::jsonb,
    flags JSONB DEFAULT '{"isDuplicateInvoice": false, "isDuplicateVendor": false, "isGstinValid": true, "isPanValid": true, "isCalculationAccurate": true, "hasMissingFields": false}'::jsonb,
    cleaning_audit JSONB DEFAULT '{"trimmedSpacesCount": 0, "standardizedDatesCount": 0, "ocrCorrectionsCount": 0, "duplicateRowsRemoved": 0}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending_validation' CHECK (status IN ('pending_validation', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. EXPORTS TABLE
CREATE TABLE IF NOT EXISTS public.exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    export_type TEXT NOT NULL CHECK (export_type IN ('xlsx', 'csv', 'json')),
    file_path TEXT,
    download_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. ACTIVITY LOGS TABLE (Audit Trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. USER SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    ocr_provider TEXT DEFAULT 'azure' CHECK (ocr_provider IN ('azure', 'tesseract', 'simulator')),
    openai_model TEXT DEFAULT 'gpt-4o',
    auto_clean BOOLEAN DEFAULT true,
    default_currency TEXT DEFAULT 'INR',
    export_preferences JSONB DEFAULT '{"includeRawOcr": false, "dateFormat": "YYYY-MM-DD"}'::jsonb,
    azure_endpoint TEXT,
    azure_key_encrypted TEXT,
    openai_key_encrypted TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================================
-- INDEXES FOR HIGH QUERY PERFORMANCE
-- ==========================================================
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_type ON public.documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_results_document_id ON public.ocr_results(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_results_document_id ON public.ai_results(document_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_doc_id ON public.activity_logs(document_id);

-- ==========================================================
-- TRIGGER: Auto-update updated_at timestamps
-- ==========================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_documents_updated_at ON public.documents;
CREATE TRIGGER set_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_ai_results_updated_at ON public.ai_results;
CREATE TRIGGER set_ai_results_updated_at
    BEFORE UPDATE ON public.ai_results
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Allow users to manage only their own records
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can manage own documents" ON public.documents FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can view own OCR results" ON public.ocr_results FOR ALL USING (
    EXISTS (SELECT 1 FROM public.documents WHERE documents.id = ocr_results.document_id AND (documents.user_id = auth.uid() OR documents.user_id IS NULL))
);
CREATE POLICY "Users can view own AI results" ON public.ai_results FOR ALL USING (
    EXISTS (SELECT 1 FROM public.documents WHERE documents.id = ai_results.document_id AND (documents.user_id = auth.uid() OR documents.user_id IS NULL))
);
CREATE POLICY "Users can view own activity logs" ON public.activity_logs FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can manage own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id);
