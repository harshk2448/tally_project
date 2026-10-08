"use client";

import React from "react";
import { Modal } from "@/components/ui/Modal";
import { DocumentRecord } from "@/types/document";
import { TallyDataTable } from "@/components/validation/TallyDataTable";

interface BulkTallyExportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DocumentRecord[];
  onExportComplete?: () => void;
}

export function BulkTallyExportPreviewModal({
  isOpen,
  onClose,
  documents,
  onExportComplete,
}: BulkTallyExportPreviewModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tally Import — Multi-Invoice Table Preview"
      maxWidth="6xl"
    >
      <div className="space-y-4">
        <TallyDataTable
          documents={documents}
          showExportButton={true}
        />
      </div>
    </Modal>
  );
}
