import { ref, onMounted, onUnmounted } from 'vue'

/**
 * useEyeTracking — head position + gaze estimation via webcam
 * 
 * Uses MediaPipe Face Mesh directly (CDN loaded, no bundler issues)
 * Iris landmarks (468-477) for gaze direction
 * 
 * Outputs:
 *   headX, headY: normalized head position (-1 to 1)
 *   gazeX, gazeY: estimated gaze on screen (0 to 1)
 *   isTracking: face detected
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

  let video = null
  let faceMesh = null
  let animFrame = null

  // Smooth targets (updated by detection, interpolated every frame)
  let tHeadX = 0, tHeadY = 0
  let tGazeX = 0.5, tGazeY = 0.5

  function lerp(a, b, t) { return a + (b - a) * t }

  async function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
      const s = document.createElement('script')
      s.src = src
      s.onload = resolve
      s.onerror = reject
      document.head.appendChild(s)
    })
  }

  async function init() {
    try {
      // Setup video
      video = document.createElement('video')
      video.setAttribute('playsinline', '')
      video.setAttribute('autoplay', '')
      video.style.cssText = 'position:fixed;top:-9999px;opacity:0;pointer-events:none'
      document.body.appendChild(video)

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 240 }
      })
      video.srcObject = stream
      await video.play()

      // Load MediaPipe Face Mesh from CDN
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js')
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js')

      // Wait for FaceMesh to be available globally
      const FM = window.FaceMesh
      if (!FM) throw new Error('FaceMesh not loaded')

      faceMesh = new FM({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      })

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true, // iris tracking
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })

      faceMesh.onResults(onResults)

      // Start detection loop
      startLoop()
      error.value = null
    } catch (e) {
      console.error('Eye tracking init failed:', e)
      error.value = e.message
    }
  }

  function onResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      isTracking.value = false
      confidence.value = 0
      tHeadX = lerp(tHeadX, 0, 0.05)
      tHeadY = lerp(tHeadY, 0, 0.05)
      return
    }

    isTracking.value = true
    confidence.value = 1
    const lm = results.multiFaceLandmarks[0]

    // === Head position (nose tip = landmark 1) ===
    const nose = lm[1]
    tHeadX = -(nose.x * 2 - 1) // flip for mirror
    tHeadY = -(nose.y * 2 - 1)

    // === Gaze from iris ===
    if (lm.length >= 478) {
      // Right iris center=468, corners: inner=33, outer=133
      const ri = lm[468], rIn = lm[33], rOut = lm[133]
      // Left iris center=473, corners: inner=362, outer=263
      const li = lm[473], lIn = lm[362], lOut = lm[263]

      const rw = Math.abs(rOut.x - rIn.x) || 0.01
      const rx = (ri.x - rIn.x) / rw
      const lw = Math.abs(lOut.x - lIn.x) || 0.01
      const lx = (li.x - lIn.x) / lw
      const irisX = (rx + lx) / 2

      // Vertical
      const rUp = lm[159], rDn = lm[145]
      const lUp = lm[386], lDn = lm[374]
      const rh = Math.abs(rDn.y - rUp.y) || 0.01
      const ry = (ri.y - rUp.y) / rh
      const lh = Math.abs(lDn.y - lUp.y) || 0.01
      const ly = (li.y - lUp.y) / lh
      const irisY = (ry + ly) / 2

      tGazeX = Math.max(0, Math.min(1, (irisX - 0.3) / 0.4))
      tGazeY = Math.max(0, Math.min(1, (irisY - 0.2) / 0.6))
    }
  }

  let lastDetect = 0
  const interval = 1000 / updateRate
  let detecting = false // lock to prevent overlapping sends

  function startLoop() {
    function loop(now) {
      animFrame = requestAnimationFrame(loop)

      // Interpolate every frame
      headX.value = lerp(headX.value, tHeadX, smoothing)
      headY.value = lerp(headY.value, tHeadY, smoothing)
      gazeX.value = lerp(gazeX.value, tGazeX, smoothing)
      gazeY.value = lerp(gazeY.value, tGazeY, smoothing)

      // Send frame to MediaPipe at target rate (with lock)
      if (now - lastDetect < interval) return
      if (detecting) return // previous frame still processing
      lastDetect = now
      if (!faceMesh || !video || video.readyState < 2) return

      detecting = true
      faceMesh.send({ image: video }).catch((e) => {
        console.warn('faceMesh.send error:', e)
      }).finally(() => {
        detecting = false
      })
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
    if (faceMesh) {
      faceMesh.close?.()
      faceMesh = null
    }
  }

  onMounted(() => init())
  onUnmounted(() => destroy())

  return { headX, headY, gazeX, gazeY, isTracking, confidence, error, init, destroy }
}
