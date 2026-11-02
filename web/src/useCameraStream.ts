import { useEffect, useRef, useState } from 'react'

// Browsers only offer the camera on https (or localhost); mediaDevices is missing otherwise, whatever the types say.
const hasCamera = () => typeof navigator.mediaDevices?.getUserMedia === 'function'

// Reasons getUserMedia rejects, in words the person at the desk can act on.
function cameraError(error: unknown) {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') return 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.'
  return 'The camera could not be started.'
}

/**
 * A live camera feed for a `<video>` element, running for as long as the calling component is mounted and
 * released when it unmounts. `facingMode` picks the front ("user") or back ("environment") camera where a
 * device has both; webcams ignore it. Pass `onLoadedData={markReady}` to the video.
 */
export function useCameraStream(facingMode: 'user' | 'environment', resolution: number) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(() => hasCamera() ? '' : 'The camera needs a secure (https) connection and a browser that supports it.')

  useEffect(() => {
    if (!hasCamera()) return
    let stream: MediaStream | null = null
    let isCancelled = false
    navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: resolution }, height: { ideal: resolution } }, audio: false })
      .then((started) => {
        // Closed before permission was granted: release the camera straight away.
        if (isCancelled) { started.getTracks().forEach((track) => track.stop()); return }
        stream = started
        if (videoRef.current) videoRef.current.srcObject = started
      })
      .catch((reason: unknown) => { if (!isCancelled) setError(cameraError(reason)) })
    return () => {
      isCancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [facingMode, resolution])

  return { videoRef, isReady, error, markReady: () => setIsReady(true) }
}
