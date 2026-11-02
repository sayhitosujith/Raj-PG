import { useState } from 'react'
import { Camera, RotateCcw, X } from 'lucide-react'
import { ModalLayer } from './ModalLayer'
import { captureSquareJpeg } from './imageResize'
import { useCameraStream } from './useCameraStream'

/**
 * Takes a profile photo from the device camera, so the photo is of the person in front of it rather than any
 * saved image. The camera runs only while this dialog is open; the picture is cropped and shrunk like an upload.
 */
export function CameraCapture({ onCapture, onClose }: { onCapture: (dataUrl: string) => void; onClose: () => void }) {
  const { videoRef, isReady, error: cameraError, markReady } = useCameraStream('user', 720)
  const [captureError, setCaptureError] = useState('')
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const error = cameraError || captureError

  async function capture() {
    if (!videoRef.current) return
    const result = await captureSquareJpeg(videoRef.current)
    if ('error' in result) { setCaptureError(result.error); return }
    setSnapshot(result.dataUrl)
  }

  return (
    <ModalLayer><div className="modal-backdrop camera-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="profile-modal camera-modal" role="dialog" aria-modal="true" aria-labelledby="camera-capture-title">
        <div className="modal-heading"><div><p className="eyebrow">Profile photo</p><h2 id="camera-capture-title">Take photo</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
        <div className="camera-frame">
          {/* Kept mounted under the snapshot so Retake resumes the same stream without asking for permission again. */}
          <video ref={videoRef} autoPlay playsInline muted onLoadedData={markReady} hidden={Boolean(snapshot)} />
          {snapshot && <img src={snapshot} alt="Captured photo" />}
          {!isReady && !error && <p className="camera-status">Starting camera…</p>}
        </div>
        {error ? <p className="login-error" role="alert">{error}</p> : <p className="camera-hint">Face the camera in good light; the photo is cropped to a circle.</p>}
        <div className="modal-actions">
          {snapshot
            ? <><button type="button" className="secondary-button" onClick={() => setSnapshot(null)}><RotateCcw size={15} /> Retake</button><button type="button" className="primary-button" onClick={() => onCapture(snapshot)}>Use photo</button></>
            : <><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" onClick={() => void capture()} disabled={!isReady}><Camera size={15} /> Capture</button></>}
        </div>
      </div>
    </div></ModalLayer>
  )
}
