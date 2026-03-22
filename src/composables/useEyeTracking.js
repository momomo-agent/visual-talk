import { ref, onMounted, onUnmounted } from 'vue'

/**
 * useEyeTracking — head parallax via webcam
 * 
 * Strategy: try Chrome FaceDetector API first (zero deps),
 * fall back to manual face detection via canvas brightness analysis.
 * 
 * For gaze: uses eye region crop + pupil position estimation.
 */
export function useEyeTracking(options = {}) {
  const {
    smoothing = 0.15,
    updateRate = 15,
  } = options

  const headX = ref(0)
  const headY = ref(0)
  const gazeX = ref(0.5)
  const gazeY = ref(0.5)
  const isTracking = ref(false)
  const confidence = ref(0)
  const error = ref(null)
  const method = ref('none') // 'facedetector' | 'tracking.js' | 'none'

  let video = null
  let canvas = null
  let ctx = null
  let detector = null
  let animFrame = null
  let detecting = false

  let tHeadX = 0, tHeadY = 0
  let tGazeX = 0.5, tGazeY = 0.5

  function lerp(a, b, t) { return a + (b - a) * t }

  async function init() {
    try {
      // Setup video
      video = document.createElement('video')
      video.setAttribute('playsinline', '')
      video.setAttribute('autoplay', '')
      video.style.cssText = 'position:fixed;top:-9999px;opacity:0;pointer-events:none;width:320px;height:240px'
      document.body.appendChild(video)

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 }
      })
      video.srcObject = stream
      await video.play()

      // Setup offscreen canvas for analysis
      canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 240
      ctx = canvas.getContext('2d', { willReadFrequently: true })

      // Try Chrome FaceDetector API
      if ('FaceDetector' in window) {
        try {
          detector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: true })
          method.value = 'facedetector'
        } catch (e) {
          console.warn('FaceDetector failed:', e)
        }
      }

      if (!detector) {
        // Fallback: manual face detection via skin color + contour
        method.value = 'canvas-manual'
      }

      error.value = null
      startLoop()
    } catch (e) {
      console.error('Eye tracking init failed:', e)
      error.value = e.message
    }
  }

  async function detectFace() {
    if (!video || video.readyState < 2) return

    ctx.drawImage(video, 0, 0, 320, 240)

    if (detector && method.value === 'facedetector') {
      try {
        const faces = await detector.detect(canvas)
        if (faces.length > 0) {
          const face = faces[0]
          const box = face.boundingBox
          const centerX = box.x + box.width / 2
          const centerY = box.y + box.height / 2

          // Normalize to -1..1
          tHeadX = ((centerX / 320) * 2 - 1)
          tHeadY = -((centerY / 240) * 2 - 1)
          isTracking.value = true
          confidence.value = 1

          // Gaze estimation from eye landmarks if available
          if (face.landmarks && face.landmarks.length >= 2) {
            const rightEye = face.landmarks[0] // {x, y} in image coords
            const leftEye = face.landmarks[1]

            // Average eye position relative to face box center
            const eyeMidX = (rightEye[0].x + leftEye[0].x) / 2
            const eyeMidY = (rightEye[0].y + leftEye[0].y) / 2
            const boxCenterX = box.x + box.width / 2
            const boxCenterY = box.y + box.height * 0.35 // eyes are in upper third

            // How far eyes deviate from expected center = gaze direction
            const deviationX = (eyeMidX - boxCenterX) / box.width
            const deviationY = (eyeMidY - boxCenterY) / box.height

            tGazeX = Math.max(0, Math.min(1, 0.5 - deviationX * 2))
            tGazeY = Math.max(0, Math.min(1, 0.5 + deviationY * 2))
          } else {
            // No landmarks — estimate gaze from head position
            tGazeX = Math.max(0, Math.min(1, 0.5 + tHeadX * 0.8))
            tGazeY = Math.max(0, Math.min(1, 0.5 + tHeadY * 0.8))
          }
          return
        }
      } catch (e) {
        // FaceDetector might fail on some frames
      }
    }

    // Manual fallback: find brightest region (face-like)
    const imageData = ctx.getImageData(0, 0, 320, 240)
    const data = imageData.data
    let sumX = 0, sumY = 0, count = 0

    for (let y = 0; y < 240; y += 4) {
      for (let x = 0; x < 320; x += 4) {
        const i = (y * 320 + x) * 4
        const r = data[i], g = data[i + 1], b = data[i + 2]
        // Skin-color detection (simple YCbCr range)
        const Y = 0.299 * r + 0.587 * g + 0.114 * b
        const Cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b
        const Cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b
        if (Y > 80 && Cb > 77 && Cb < 127 && Cr > 133 && Cr < 173) {
          sumX += x
          sumY += y
          count++
        }
      }
    }

    if (count > 50) {
      const cx = sumX / count
      const cy = sumY / count
      tHeadX = ((cx / 320) * 2 - 1)
      tHeadY = -((cy / 240) * 2 - 1)
      isTracking.value = true
      confidence.value = Math.min(1, count / 2000)
      // Gaze follows head when no landmarks
      tGazeX = Math.max(0, Math.min(1, 0.5 + tHeadX * 0.8))
      tGazeY = Math.max(0, Math.min(1, 0.5 + tHeadY * 0.8))
    } else {
      isTracking.value = false
      confidence.value = 0
      tHeadX = lerp(tHeadX, 0, 0.05)
      tHeadY = lerp(tHeadY, 0, 0.05)
    }
  }

  const interval = 1000 / updateRate

  function startLoop() {
    let lastDetect = 0
    function loop(now) {
      animFrame = requestAnimationFrame(loop)

      headX.value = lerp(headX.value, tHeadX, smoothing)
      headY.value = lerp(headY.value, tHeadY, smoothing)
      gazeX.value = lerp(gazeX.value, tGazeX, smoothing)
      gazeY.value = lerp(gazeY.value, tGazeY, smoothing)

      if (now - lastDetect < interval) return
      if (detecting) return
      lastDetect = now

      detecting = true
      detectFace().finally(() => { detecting = false })
    }
    animFrame = requestAnimationFrame(loop)
  }

  function destroy() {
    if (animFrame) cancelAnimationFrame(animFrame)
    if (video) {
      const stream = video.srcObject
      if (stream) stream.getTracks().forEach(t => t.stop())
      video.remove()
      video = null
    }
    detector = null
  }

  onMounted(() => init())
  onUnmounted(() => destroy())

  return { headX, headY, gazeX, gazeY, isTracking, confidence, error, method, init, destroy }
}
