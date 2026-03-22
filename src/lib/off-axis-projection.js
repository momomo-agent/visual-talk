/**
 * OffAxisProjection — 从零构建的非对称透视投影
 * 
 * 把屏幕当作一个物理窗户。
 * 观察者的眼睛在 (eyeX, eyeY, eyeZ)，屏幕在 z=0 平面。
 * 场景中的点在 (px, py, pz)，pz > 0 表示在屏幕后面（远离观察者）。
 * 
 * 投影公式：
 *   projectedX = eyeX + (px - eyeX) * eyeZ / (eyeZ + pz)
 *   projectedY = eyeY + (py - eyeY) * eyeZ / (eyeZ + pz)
 * 
 * 偏移量（相对于原位置的位移）：
 *   offsetX = projectedX - px = (eyeX - px) * pz / (eyeZ + pz)
 *   offsetY = projectedY - py = (eyeY - py) * pz / (eyeZ + pz)
 * 
 * 当 pz=0（在屏幕平面上），偏移=0 —— 和真实窗户一样。
 * 当 pz>0（在屏幕后面），物体往眼睛反方向偏移 —— 视差。
 * 当 pz<0（在屏幕前面），物体往眼睛同方向偏移 —— 更强的视差。
 * 
 * 缩放（近大远小）：
 *   scale = eyeZ / (eyeZ + pz)
 *   pz=0 → scale=1, pz>0 → scale<1 (远的变小), pz<0 → scale>1 (近的变大)
 */
export class OffAxisProjection {
  /**
   * @param {number} screenW - 屏幕宽度（像素）
   * @param {number} screenH - 屏幕高度（像素）
   * @param {number} eyeDistance - 眼睛到屏幕的虚拟距离（像素单位，控制效果强度）
   */
  constructor(screenW, screenH, eyeDistance = 600) {
    this.screenW = screenW
    this.screenH = screenH
    this.eyeZ = eyeDistance

    // 眼睛位置（像素，相对于屏幕中心）
    this.eyeX = 0
    this.eyeY = 0
  }

  /**
   * 设置眼睛位置
   * @param {number} normalizedX - 归一化的头部 X 位置 [-1, 1]
   * @param {number} normalizedY - 归一化的头部 Y 位置 [-1, 1]
   * @param {number} rangeX - 头部在 X 方向的最大物理偏移（像素），默认屏幕宽度的 40%
   * @param {number} rangeY - 头部在 Y 方向的最大物理偏移（像素），默认屏幕高度的 30%
   */
  setEyePosition(normalizedX, normalizedY, rangeX, rangeY) {
    this.eyeX = normalizedX * (rangeX || this.screenW * 0.4)
    this.eyeY = normalizedY * (rangeY || this.screenH * 0.3)
  }

  /**
   * 计算一个点的投影偏移和缩放
   * @param {number} x - 点在屏幕上的 X 位置（像素，相对于屏幕中心）
   * @param {number} y - 点在屏幕上的 Y 位置（像素，相对于屏幕中心）
   * @param {number} z - 点的深度（正=屏幕后方，负=屏幕前方）
   * @returns {{ offsetX: number, offsetY: number, scale: number }}
   */
  project(x, y, z) {
    const denom = this.eyeZ + z
    if (denom <= 0) {
      // 点在眼睛后面或同平面，不渲染
      return { offsetX: 0, offsetY: 0, scale: 1 }
    }

    const offsetX = (this.eyeX - x) * z / denom
    const offsetY = (this.eyeY - y) * z / denom
    const scale = this.eyeZ / denom

    return { offsetX, offsetY, scale }
  }

  /**
   * 更新屏幕尺寸（窗口 resize 时）
   */
  resize(w, h) {
    this.screenW = w
    this.screenH = h
  }
}
