import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  CHROMATIC_ABERRATION_AMOUNT,
  CHROMATIC_ABERRATION_MAX,
  CHROMATIC_ABERRATION_SHADER,
  PostFx,
} from '../../src/core/postfx.js'

function stubRenderer() {
  const calls = { render: [], targets: [] }
  return {
    calls,
    getDrawingBufferSize(target) {
      return target.set(640, 360)
    },
    getPixelRatio() {
      return 2
    },
    render(scene, camera) {
      calls.render.push({ scene, camera })
    },
    setRenderTarget(value) {
      calls.targets.push(value)
    },
  }
}

function setup() {
  const renderer = stubRenderer()
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  const postFx = new PostFx(renderer, scene, camera)
  return { renderer, scene, camera, postFx }
}

test('while disabled the post-fx renders the scene straight to the canvas', () => {
  const { renderer, scene, camera, postFx } = setup()

  postFx.render(camera)

  assert.equal(renderer.calls.render.length, 1, 'one draw call')
  assert.equal(renderer.calls.render[0].scene, scene)
  assert.equal(renderer.calls.render[0].camera, camera)
  assert.equal(renderer.calls.targets.length, 0, 'no offscreen target is touched')
})

test('while enabled the scene is drawn offscreen and blitted back with the aberration', () => {
  const { renderer, scene, camera, postFx } = setup()
  postFx.enabled = true

  postFx.render(camera)

  assert.equal(renderer.calls.targets.length, 2, 'offscreen target then canvas')
  assert.equal(renderer.calls.targets[0], postFx.target)
  assert.equal(renderer.calls.targets[1], null)
  assert.equal(renderer.calls.render.length, 2, 'scene pass plus fullscreen blit')
  assert.equal(renderer.calls.render[0].scene, scene, 'scene goes into the target')
  assert.notEqual(renderer.calls.render[1].scene, scene, 'second draw is the fullscreen quad')
  assert.equal(
    postFx.material.uniforms.tDiffuse.value,
    postFx.target.texture,
    'the blit samples the target that was just filled'
  )
})

test('the offscreen target matches the drawing buffer, pixel ratio and MSAA of the canvas', () => {
  const { postFx } = setup()

  assert.equal(postFx.target.width, 640, 'drawing buffer size is already device pixels')
  assert.equal(postFx.target.height, 360)
  assert.equal(postFx.target.samples, 4, 'keeps the antialias: true edge quality')
  assert.equal(postFx.target.texture.type, THREE.HalfFloatType, 'no banding in the dark carriages')

  postFx.setSize(500, 300)
  assert.equal(postFx.target.width, 1000)
  assert.equal(postFx.target.height, 600)
})

test('the aberration amount is clamped to a sane range', () => {
  const { postFx } = setup()
  const amount = postFx.material.uniforms.uAmount

  assert.equal(amount.value, CHROMATIC_ABERRATION_AMOUNT, 'sensible default')

  postFx.setAmount(0.004)
  assert.equal(amount.value, 0.004)

  postFx.setAmount(999)
  assert.equal(amount.value, CHROMATIC_ABERRATION_MAX, 'clamped high')

  postFx.setAmount(-1)
  assert.equal(amount.value, 0, 'clamped low')
})

test('the aberration shader stays a three-tap radial fringe in the right colour space', () => {
  const fragment = CHROMATIC_ABERRATION_SHADER.fragmentShader

  const taps = fragment.match(/texture2D\(/g) || []
  assert.equal(taps.length, 3, 'three texture fetches per pixel')
  assert.ok(fragment.includes('dir * uAmount'), 'fringe grows towards the edges of the frame')
  assert.ok(
    fragment.includes('#include <colorspace_fragment>'),
    'linear scene pixels are converted on the way to the canvas'
  )
  assert.equal(
    CHROMATIC_ABERRATION_SHADER.uniforms.uAmount.value,
    CHROMATIC_ABERRATION_AMOUNT
  )
})

test('the post-fx can be disposed without touching anything else', () => {
  const { postFx } = setup()
  postFx.dispose()
  assert.equal(postFx.target.texture.isRenderTargetTexture, true)
})
