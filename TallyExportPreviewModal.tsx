"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { TallyInvoice, TallyValidationResult, TallyProfile } from "@/types/tally";
import { DocumentRecord } from "@/types/document";
import { TallyDataTable } from "@/components/validation/TallyDataTable";

interface TallyExportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  document?: DocumentRecord;
  tallyInvoice?: TallyInvoice;
  validation?: TallyValidationResult;
  onExportComplete?: (filename: string) => void;
  onProfileUpdate?: (profile: TallyProfile) => void;
}

export function TallyExportPreviewModal({
  isOpen,
  onClose,
  documentId,
  document: propDoc,
  tallyInvoice,
  onExportComplete,
  onProfileUpdate,
}: TallyExportPreviewModalProps) {
  const [doc, setDoc] = useState<DocumentRecord | undefined>(propDoc);

  useEffect(() => {
    if (propDoc) {
      setDoc(propDoc);
      return;
    }
    if (documentId && documentId !== "latest") {
      fetch(`/api/document/${documentId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.data) setDoc(json.data);
        })
        .catch(() => {});
    }
  }, [documentId, propDoc]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tally Import — Invoice Table Preview"
      maxWidth="6xl"
    >
      <div className="space-y-4">
        <TallyDataTable
          document={doc}
          formData={tallyInvoice as any}
          showExportButton={true}
          onProfileUpdate={onProfileUpdate}
        />
      </div>
    </Modal>
  );
}
