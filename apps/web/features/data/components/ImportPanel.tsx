"use client";

import { useState, useRef, useCallback } from "react";
import { Card } from "@shared/ui/Card";
import { Badge } from "@shared/ui/Badge";
import { API_ERROR_KINDS, ApiError, apiErrorMessage, apiFetch } from "@shared/lib/api";

const ACCEPTED_EXTENSIONS = [".fit", ".tcx", ".gpx"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const HISTORY_KEY = "rm_upload_history";

interface UploadRecord {
  id: string;
  filename: string;
  status: "success" | "failed" | "duplicate";
  timestamp: string;
  error?: string;
}

export function ImportPanel() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState<UploadRecord[]>(loadHistory());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addHistory = useCallback((partial: Omit<UploadRecord, "id" | "timestamp">) => {
    const record: UploadRecord = {
      ...partial,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    setHistory((prev) => {
      const next = [record, ...prev].slice(0, 50);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      addHistory({ filename: file.name, status: "failed", error: "不支持的文件格式" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      addHistory({ filename: file.name, status: "failed", error: "文件大小超过 50MB 限制" });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await apiFetch<unknown>("/activities/upload", {
        method: "POST",
        body: formData,
      });
      addHistory({ filename: file.name, status: "success" });
    } catch (caught) {
      if (caught instanceof ApiError && caught.kind === API_ERROR_KINDS.conflict) {
        addHistory({ filename: file.name, status: "duplicate" });
      } else {
        addHistory({
          filename: file.name,
          status: "failed",
          error: apiErrorMessage(caught),
        });
      }
    } finally {
      setUploading(false);
    }
  }, [addHistory]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      await uploadFile(file);
    }
  }, [uploadFile]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = "";
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <h2 className="text-callout font-semibold text-text-primary">导入</h2>
        <p className="text-caption1 text-text-secondary">支持 FIT、TCX、GPX 格式，单文件最大 50MB</p>

        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            flex cursor-pointer flex-col items-center justify-center gap-2
            rounded-lg border-2 border-dashed px-6 py-8 transition-colors
            ${isDragging
              ? "border-accent bg-accent/10"
              : "border-border-subtle bg-surface-base hover:border-border-strong"
            }
          `.trim()}
        >
          <UploadCloudIcon />
          <span className="text-subheadline font-medium text-text-primary">
            {uploading ? "上传中…" : "拖拽文件到此处，或点击选择"}
          </span>
          <span className="text-caption1 text-text-muted">FIT / TCX / GPX</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".fit,.tcx,.gpx"
            multiple
            onChange={handleInputChange}
            className="hidden"
            aria-label="选择训练文件"
          />
        </div>

        {/* Upload History */}
        {history.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
            <h3 className="text-subheadline font-medium text-text-secondary">上传历史</h3>
            <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {history.map((record) => (
                <UploadHistoryRow key={record.id} record={record} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function UploadHistoryRow({ record }: { record: UploadRecord }) {
  const statusVariant: Record<UploadRecord["status"], "success" | "warning" | "error"> = {
    success: "success",
    failed: "error",
    duplicate: "warning",
  };
  const statusLabel: Record<UploadRecord["status"], string> = {
    success: "成功",
    failed: "失败",
    duplicate: "重复",
  };

  return (
    <li className="flex items-center justify-between rounded-md bg-surface-base px-3 py-2">
      <div className="flex flex-col">
        <span className="text-caption1 text-text-primary truncate max-w-48">{record.filename}</span>
        <span className="text-caption1 text-text-muted">
          {new Date(record.timestamp).toLocaleString("zh-CN", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {record.error && (
          <span className="text-caption1 text-error max-w-32 truncate">
            {record.error}
          </span>
        )}
        <Badge variant={statusVariant[record.status]}>{statusLabel[record.status]}</Badge>
      </div>
    </li>
  );
}

function loadHistory(): UploadRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function UploadCloudIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
      className="h-8 w-8 text-text-muted">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}
