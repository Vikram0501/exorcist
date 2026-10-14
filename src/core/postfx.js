import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

// Screen-space post effects. The scene is drawn into an offscreen target and
// a single fullscreen pass blits it back to the canvas with a radial
// chromatic aberration (three texture fetches per pixel, no loops). Only the
// train level turns it on; every other level renders straight to the canvas
// exactly as before.

export const CHROMATIC_ABERRATION_AMOUNT = 0.008
export const CHROMATIC_ABERRATION_MAX = 0.03

export const CHROMATIC_ABERRATION_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: CHROMATIC_ABERRATION_AMOUNT },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      vec2 shift = dir * uAmount;
      float red = texture2D(tDiffuse, vUv + shift).r;
      vec4 base = texture2D(tDiffuse, vUv);
      float blue = texture2D(tDiffuse, vUv - shift).b;
      gl_FragColor = vec4(red, base.g, blue, base.a);
      #include <colorspace_fragment>
    }`,
}

export class PostFx {
  constructor(renderer, scene, camera) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.enabled = false

    const size = renderer.getDrawingBufferSize(new THREE.Vector2())

    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.UnsignedByteType,
      // Two samples keep edges readable without the bandwidth cost of a
      // four-sample floating point buffer on the train.
      samples: 2,
    })

    const shader = CHROMATIC_ABERRATION_SHADER
    this.material = new THREE.ShaderMaterial({
      name: 'ChromaticAberration',
      uniforms: THREE.UniformsUtils.clone(shader.uniforms),
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    })

    this.quad = new FullScreenQuad(this.material)
  }

  setAmount(amount) {
    this.material.uniforms.uAmount.value =
      Math.min(Math.max(amount, 0), CHROMATIC_ABERRATION_MAX)
  }

  setSize(width, height) {
    const pixelRatio = this.renderer.getPixelRatio()
    this.target.setSize(width * pixelRatio, height * pixelRatio)
  }

  render(camera = this.camera) {
    if (!this.enabled) {
      this.renderer.render(this.scene, camera)
      return
    }

    this.material.uniforms.tDiffuse.value = this.target.texture

    this.renderer.setRenderTarget(this.target)
    this.renderer.render(this.scene, camera)
    this.renderer.setRenderTarget(null)
    this.quad.render(this.renderer)
  }

  dispose() {
    this.target.dispose()
    this.material.dispose()
  }
}
