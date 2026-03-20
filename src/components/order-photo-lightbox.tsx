"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type PhotoItem = {
  url: string;
  title: string;
};

type Props = {
  currentUrl: string;
  currentTitle: string;
  photos: PhotoItem[];
};

export function OrderPhotoLightbox({ currentUrl, currentTitle, photos }: Props) {
  const [open, setOpen] = useState(false);
  const currentIndex = useMemo(() => {
    const idx = photos.findIndex((item) => item.url === currentUrl);
    return idx >= 0 ? idx : 0;
  }, [currentUrl, photos]);
  const [activeIndex, setActiveIndex] = useState(currentIndex);

  const openModal = () => {
    setActiveIndex(currentIndex);
    setOpen(true);
  };

  const active = photos[activeIndex] ?? { url: currentUrl, title: currentTitle };

  return (
    <>
      <button type="button" onClick={openModal} className="inline-block">
        <Image src={currentUrl} alt="附件缩略图" width={56} height={56} className="rounded object-cover" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-5xl rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-slate-100 md:p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
            >
              关闭
            </button>

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setActiveIndex((prev) => (prev - 1 + photos.length) % photos.length)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
              >
                上一张
              </button>
              <div className="flex-1">
                <div className="relative h-[68vh] w-full overflow-hidden rounded-xl bg-slate-100">
                  <Image src={active.url} alt={active.title || "附件"} fill className="object-contain" />
                </div>
                <p className="mt-2 text-center text-xs text-slate-600">
                  {activeIndex + 1}/{photos.length} · {active.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveIndex((prev) => (prev + 1) % photos.length)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
              >
                下一张
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
