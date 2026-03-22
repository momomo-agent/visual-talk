import { ref, onMounted, onUnmounted } from 'vue'

/**
 * useEyeTracking — head parallax via webcam
 * 
 * Based on munrocket/parallax-effect approach:
 * - Use eye midpoint (not nose/bounding box) for head position
 * - EMA smoothing on raw landmark positions
 * - Eye distance for Z estimation
 * - Chrome FaceDetector API (zero deps) with canvas skin-color fallback
 * 
 * Output: x/y in [-1, 1], z proportional to distance
 */
export function useEyeTracking(options = {}) {
  const {
    smoothEye = 0.3,      // EMA for eye position (higher = more responsive)
    smoothDist = 0.15,     // EMA for distance
    defaultDist = 0.12,    // default eye distance ratio for z=1
  } = options

  const headX = ref(0)
  const headY = ref(0)
  const headZ = ref(1)
  const isTracking = ref(false)
  const error = ref(null)
  const method = ref('none')

  let video = null
  let canvas = null
  let ctx = null
  let detector = null
  let animFrame = null
  let detecting = false

  // Raw smoothed eye positions (EMA applied directly to landmarks)
  let eyes = null  // [rightEyeX, rightEyeY, leftEyeX, leftEyeY]
  let dist = null   // smoothed eye distance

  async function init() {
    try {
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
      if (!detector) method.value = 'canvas-manual'

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

          // Use eye landmarks if available, otherwise estimate from box
          let nextEyes
          if (face.landmarks && face.landmarks.length >= 2) {
            const re = face.landmarks[0]  // right eye
            const le = face.landmarks[1]  // left eye
            // landmarks can be {x,y} or [{x,y}]
            const rex = re.x ?? re[0]?.x ?? (box.x + box.width * 0.35)
            const rey = re.y ?? re[0]?.y ?? (box.y + box.height * 0.35)
            const lex = le.x ?? le[0]?.x ?? (box.x + box.width * 0.65)
            const ley = le.y ?? le[0]?.y ?? (box.y + box.height * 0.35)
            nextEyes = [rex, rey, lex, ley]
          } else {
            // Estimate eyes from bounding box
            nextEyes = [
              box.x + box.width * 0.35, box.y + box.height * 0.35,
              box.x + box.width * 0.65, box.y + box.height * 0.35,
            ]
          }

          // EMA smooth on raw landmarks (like parallax-effect library)
          if (eyes === null) {
            eyes = [...nextEyes]
          } else {
            for (let i = 0; i < 4; i++) {
              eyes[i] = eyes[i] * (1 - smoothEye) + nextEyes[i] * smoothEye
            }
          }

          // Eye distance for Z
          const dx = eyes[0] - eyes[2]
          const dy = eyes[1] - eyes[3]
          const nextDist = Math.sqrt(dx * dx + dy * dy) / 320
          if (dist === null) {
            dist = nextDist
          } else {
            dist = dist * (1 - smoothDist) + nextDist * smoothDist
          }

          // Output: eye midpoint normalized to [-1, 1]
          const midX = (eyes[0] + eyes[2]) / 320 - 1
          const midY = 1 - (eyes[1] + eyes[3]) / 320  // flip Y, use width for aspect consistency
          const z = defaultDist / (dist || defaultDist)

          headX.value = midX
          headY.value = midY
          headZ.value = z
          isTracking.value = true
          return
        }
      } catch (e) { /* detection failed this frame */ }
    }

    // Fallback: skin color detection
    const imageData = ctx.getImageData(0, 0, 320, 240)
    const data = imageData.data
    let sumX = 0, sumY = 0, count = 0

    for (let y = 0; y < 240; y += 4) {
      for (let x = 0; x < 320; x += 4) {
        const i = (y * 320 + x) * 4
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const Y = 0.299 * r + 0.587 * g + 0.114 * b
        const Cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b
        const Cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b
        if (Y > 80 && Cb > 77 && Cb < 127 && Cr > 133 && Cr < 173) {
          sumX += x; sumY += y; count++
        }
      }
    }

    if (count > 50) {
      const cx = sumX / count
      const cy = sumY / count
      const rawX = (cx / 160) - 1
      const rawY = 1 - (cy / 160)

      if (eyes === null) {
        eyes = [cx, cy, cx, cy]
      } else {
        eyes[0] = eyes[0] * (1 - smoothEye) + cx * smoothEye
        eyes[1] = eyes[1] * (1 - smoothEye) + cy * smoothEye
      }

      headX.value = (eyes[0] / 160) - 1
      headY.value = 1 - (eyes[1] / 160)
      headZ.value = 1
      isTracking.value = true
    } else {
      isTracking.value = false
    }
  }

  function startLoop() {
    function loop() {
      animFrame = requestAnimationFrame(loop)

      if (detecting) return
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

  return { headX, headY, headZ, isTracking, error, method, init, destroy }
}
