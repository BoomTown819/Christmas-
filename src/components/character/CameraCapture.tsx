'use client';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../Modal';

/**
 * Takes a photo with the device camera, inside the page (works on computers and phones).
 * Returns a JPEG data URL. The camera turns off as soon as the dialog closes.
 */
export function CameraCapture({ open, onClose, onPhoto }: { open: boolean; onClose: () => void; onPhoto: (dataUrl: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null); setReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser can’t open the camera. Use “Choose from files” instead.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
      })
      .catch((e: DOMException) => {
        setError(e.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site in your browser’s address bar, then try again.'
          : e.name === 'NotFoundError' ? 'No camera was found on this device. Use “Choose from files” instead.'
          : 'The camera couldn’t start. Close other apps using it and try again.');
      });
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [open]);

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, 768 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext('2d')!;
    ctx.translate(c.width, 0); ctx.scale(-1, 1); // match the mirrored preview
    ctx.drawImage(v, 0, 0, c.width, c.height);
    onPhoto(c.toDataURL('image/jpeg', 0.86));
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Take a photo" size="sm"
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={snap} disabled={!ready || Boolean(error)}>📸 Snap</button>
      </>}>
      {error ? <p className="field-error" role="alert">{error}</p> : (
        <div className="camera-box">
          <video ref={video} className="camera-video" playsInline muted autoPlay onLoadedData={() => setReady(true)} aria-label="Camera preview" />
          {!ready && <p className="muted camera-wait">Starting camera…</p>}
          <p className="field-note">Face the camera in good light, with just you in the picture.</p>
        </div>
      )}
    </Modal>
  );
}
