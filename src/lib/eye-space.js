import {
  Scene,
  PerspectiveCamera,
  Matrix4,
} from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'

/**
 * EyeSpace — CSS3DRenderer scene with off-axis projection
 * 
 * DOM elements live in a 3D scene. Camera projection matrix
 * shifts based on head position, creating the "looking through
 * a window" effect while keeping all DOM interactivity.
 */
export class EyeSpace {
  constructor(container) {
    this.container = container
    this.objects = new Map() // cardId → CSS3DObject

    // Scene
    this.scene = new Scene()

    // Camera — will be modified for off-axis projection
    const aspect = container.clientWidth / container.clientHeight
    this.camera = new PerspectiveCamera(50, aspect, 1, 5000)
    this.camera.position.set(0, 0, 1000)

    // CSS3D Renderer — renders DOM elements in 3D
    this.renderer = new CSS3DRenderer()
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.top = '0'
    this.renderer.domElement.style.left = '0'
    this.renderer.domElement.style.pointerEvents = 'auto'
    container.appendChild(this.renderer.domElement)

    // Screen physical dimensions (approximate)
    // Used for off-axis projection calculation
    this.screenWidth = container.clientWidth
    this.screenHeight = container.clientHeight

    // Animation loop
    this._animFrame = null
    this._headX = 0
    this._headY = 0

    this._startLoop()

    // Handle resize
    this._onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      this.screenWidth = w
      this.screenHeight = h
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(w, h)
    }
    window.addEventListener('resize', this._onResize)
  }

  /**
   * Update head position for off-axis projection
   * @param {number} hx - normalized head X (-1 to 1)
   * @param {number} hy - normalized head Y (-1 to 1)
   */
  setHeadPosition(hx, hy) {
    this._headX = hx
    this._headY = hy
  }

  /**
   * Add a DOM element to the 3D scene
   * @param {string} id - unique card id
   * @param {HTMLElement} element - the DOM element
   * @param {number} x - position X (px from center)
   * @param {number} y - position Y (px from center)
   * @param {number} z - depth (0 = screen plane, positive = closer to viewer)
   */
  addObject(id, element, x = 0, y = 0, z = 0) {
    if (this.objects.has(id)) this.removeObject(id)
    const obj = new CSS3DObject(element)
    obj.position.set(x, -y, z) // flip Y for screen coords
    this.scene.add(obj)
    this.objects.set(id, obj)
    return obj
  }

  /**
   * Update an object's position
   */
  updateObject(id, x, y, z) {
    const obj = this.objects.get(id)
    if (!obj) return
    if (x !== undefined) obj.position.x = x
    if (y !== undefined) obj.position.y = -y
    if (z !== undefined) obj.position.z = z
  }

  removeObject(id) {
    const obj = this.objects.get(id)
    if (!obj) return
    this.scene.remove(obj)
    this.objects.delete(id)
  }

  /**
   * Off-axis projection — the key to the "window" effect
   * 
   * Instead of a symmetric frustum, we shift the frustum
   * based on where the viewer's eyes are, making the screen
   * behave like a physical window into the 3D scene.
   */
  _updateProjection() {
    const cam = this.camera
    const near = cam.near
    const far = cam.far
    const fov = cam.fov * Math.PI / 180
    const aspect = cam.aspect
    const d = cam.position.z // distance from camera to screen plane

    // Base frustum dimensions at near plane
    const top = near * Math.tan(fov / 2)
    const bottom = -top
    const right = top * aspect
    const left = -right

    // Head offset mapped to world units
    // headX/Y in [-1, 1] → shift the frustum
    const shiftX = this._headX * right * 1.5  // amplify shift
    const shiftY = this._headY * top * 1.5

    // Build off-axis projection matrix
    cam.projectionMatrix.makePerspective(
      left + shiftX,
      right + shiftX,
      top + shiftY,
      bottom + shiftY,
      near,
      far
    )

    // Also shift camera position to match (parallel to screen)
    // This creates the parallax — camera moves but looks at same screen
    cam.position.x = this._headX * 200
    cam.position.y = this._headY * 150
  }

  _startLoop() {
    const loop = () => {
      this._animFrame = requestAnimationFrame(loop)
      this._updateProjection()
      this.renderer.render(this.scene, this.camera)
    }
    this._animFrame = requestAnimationFrame(loop)
  }

  destroy() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame)
    window.removeEventListener('resize', this._onResize)
    this.renderer.domElement.remove()
    this.objects.clear()
  }
}
