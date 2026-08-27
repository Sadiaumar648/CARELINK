"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ArrowCounterClockwise } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

// App Flow doc task 4.1: a guided selfie capture with an on-screen
// outline, live camera preview, and a fallback for when the camera
// can't be reached — never a dead end, per the doc's "flows remain
// typeable" rule.
export function CameraCapture({
  onCapture,
  onFallback,
}: {
  onCapture: (file: File) => void;
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach your camera.");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1); // mirror, to match what the person sees in preview
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPreviewUrl(URL.createObjectURL(blob));
        streamRef.current?.getTracks().forEach((t) => t.stop());
      },
      "image/jpeg",
      0.9,
    );
  }

  function retake() {
    setPreviewUrl(null);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError("Couldn't reach your camera."));
  }

  async function confirm() {
    if (!previewUrl) return;
    const blob = await fetch(previewUrl).then((r) => r.blob());
    onCapture(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-ink-muted">{error} You can attach a photo instead.</p>
        <Button type="button" variant="secondary" onClick={onFallback}>
          Attach a photo instead
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative aspect-square w-64 max-w-full overflow-hidden rounded bg-paper">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a static asset
          <img src={previewUrl} alt="Captured selfie" className="h-full w-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full -scale-x-100 object-cover"
          />
        )}
        {!previewUrl && (
          <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-dashed border-cyan" />
        )}
      </div>

      {previewUrl ? (
        <div className="flex gap-3">
          <Button type="button" onClick={() => void confirm()}>
            Use this photo
          </Button>
          <Button type="button" variant="secondary" onClick={retake}>
            <ArrowCounterClockwise size={18} /> Retake
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={capture} disabled={!ready}>
          <Camera size={18} /> {ready ? "Capture" : "Starting camera…"}
        </Button>
      )}

      <button type="button" onClick={onFallback} className="text-[13px] text-ink-muted underline">
        Attach a photo instead
      </button>
    </div>
  );
}
