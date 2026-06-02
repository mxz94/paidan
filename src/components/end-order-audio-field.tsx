"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatAudioFileSize, isLikelyAudioUpload } from "@/lib/audio-file";
import { isCapacitorNativeApp, lockShareReceiveOrder } from "@/lib/capacitor/share-receive";

type Props = {
  orderId: number;
  audioFile: File | null;
  onAudioFileChange: (file: File | null) => void;
  shareGuideActive: boolean;
  onShareGuideActiveChange: (active: boolean) => void;
};

export function EndOrderAudioField({
  orderId,
  audioFile,
  onAudioFileChange,
  shareGuideActive,
  onShareGuideActiveChange,
}: Props) {
  const isNativeApp = isCapacitorNativeApp();
  const [error, setError] = useState("");
  const previewUrl = useMemo(
    () => (audioFile ? URL.createObjectURL(audioFile) : null),
    [audioFile],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-600">通话录音（必传）</label>

      {isNativeApp ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
          <button
            type="button"
            onClick={async () => {
              setError("");
              try {
                await lockShareReceiveOrder(orderId);
                onShareGuideActiveChange(true);
              } catch {
                setError("无法锁定当前单据，请重试。");
              }
            }}
            className={`w-full rounded-lg px-3 py-2 text-xs font-semibold ${
              shareGuideActive
                ? "border border-amber-300 bg-amber-50 text-amber-800"
                : "border border-slate-300 bg-slate-50 text-slate-800"
            }`}
          >
            {shareGuideActive ? "等待分享录音…" : "导入通话录音"}
          </button>
          {shareGuideActive ? (
            <p className="text-[11px] leading-5 text-slate-500">
              已锁定当前单据。请打开「通话录音」，找到对应录音后点「分享」，选择「派单系统」返回即可。
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
        >
          从文件选择
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.amr,.m4a,.3gp,.wav,.aac,.ogg,.webm,audio/*"
          className="hidden"
          onChange={(event) => {
            setError("");
            onShareGuideActiveChange(false);
            const file = event.currentTarget.files?.[0] ?? null;
            if (!file) {
              onAudioFileChange(null);
              return;
            }
            if (!isLikelyAudioUpload(file)) {
              setError("请选择音频文件（支持 mp3/amr/m4a/3gp 等）。");
              onAudioFileChange(null);
              event.currentTarget.value = "";
              return;
            }
            onAudioFileChange(file);
          }}
        />
        {!isNativeApp ? (
          <p className="text-[11px] leading-5 text-slate-500">
            浏览器请从「通话录音」目录选择文件。常见路径：小米 MIUI/sound_recorder/call_rec，华为 Sounds/CallRecord。
          </p>
        ) : null}
      </div>

      {audioFile ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">已选择录音</p>
              <p className="mt-1 break-all">{audioFile.name}</p>
              <p className="mt-1 text-emerald-700">{formatAudioFileSize(audioFile.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                onAudioFileChange(null);
                onShareGuideActiveChange(false);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              className="rounded border border-emerald-300 px-2 py-1 text-[11px] font-semibold"
            >
              清除
            </button>
          </div>
          {previewUrl ? (
            <audio controls preload="none" className="mt-2 w-full">
              <source src={previewUrl} type={audioFile.type || "audio/mpeg"} />
            </audio>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
