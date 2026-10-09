import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createDefaultTrack } from '../../src/levels/highway/track.js'
import { HighwayCarController } from '../../src/levels/highway/car.js'
import {
  createRaceBanner, START_BANNER_DISTANCE, BANNER_WIDTH, BANNER_HEIGHT,
} from '../../src/levels/highway/race-banners.js'

function withStubs(fn) {
  const document = globalThis.document
  const window = globalThis.window
  const text = []
  globalThis.document = {
    createElement: () => ({ getContext: () => ({
      fillRect() {}, strokeRect() {},
      fillText: (...args) => text.push(args),
    }) }),
  }
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  try { fn(text) } finally {
    globalThis.document = document
    globalThis.window = window
  }
}

test('high-contrast text is drawn once per banner with normal UVs and readable front/reverse faces', () => withStubs(text => {
  const track = createDefaultTrack()
  for (const [s, label] of [[START_BANNER_DISTANCE, 'START'], [track.getFinishDistance(), 'FINISH'], [600, 'FINISH']]) {
    const banner = createRaceBanner(track, s, label)
    banner.updateMatrixWorld(true)
    const forward = track.sampleAt(s).tangent.clone().setY(0).normalize()
    const front = banner.getObjectByName('raceBannerApproachFace')
    const back = banner.getObjectByName('raceBannerReverseFace')
    assert.equal(front.material, back.material, 'same texture and material, separately oriented faces')
    assert.equal(front.material.side, THREE.FrontSide)
    assert.ok(front.material.isMeshBasicMaterial)
    assert.equal(front.material.fog, false)
    assert.equal(front.material.toneMapped, false)
    assert.equal(front.material.depthTest, true, 'no see-through render overlay')
    assert.equal(front.material.map.colorSpace, THREE.SRGBColorSpace)
    assert.equal(front.material.map.image.width, 2048)
    assert.equal(front.material.map.image.height, 320)
    for (const [face, direction] of [[front, forward.clone().negate()], [back, forward]]) {
      const q = face.getWorldQuaternion(new THREE.Quaternion())
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
      assert.ok(normal.dot(direction) > 0.99999, 'visible front points toward its approaching viewer')
      const center = face.getWorldPosition(new THREE.Vector3())
      const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 200)
      camera.position.copy(center).addScaledVector(direction, 20)
      camera.lookAt(center)
      camera.updateMatrixWorld(true)
      const left = face.localToWorld(new THREE.Vector3(-5, 0, 0)).project(camera)
      const right = face.localToWorld(new THREE.Vector3(5, 0, 0)).project(camera)
      assert.ok(left.x < right.x, 'texture left stays screen-left, never mirrored')
      const ray = new THREE.Raycaster(camera.position, direction.clone().negate())
      const hit = ray.intersectObject(face)[0]
      assert.ok(hit && Math.abs(hit.uv.x - 0.5) < 0.001, 'front-side face actually renders to viewer')
    }
    banner.traverse(object => {
      assert.ok(object.scale.x > 0 && object.scale.y > 0 && object.scale.z > 0)
      assert.equal(object.visible, true)
    })
  }
  assert.deepEqual(text.map(call => call[0]), ['START', 'FINISH', 'FINISH'])
}))

test('gantry feet follow elevation while all overhead geometry clears both racing lanes', () => withStubs(() => {
  const track = createDefaultTrack()
  for (const s of [START_BANNER_DISTANCE, 600, 1000, track.getFinishDistance()]) {
    const banner = createRaceBanner(track, s, 'FINISH')
    banner.updateMatrixWorld(true)
    const frame = track.sampleAt(s)
    const mesh = banner.getObjectByName('raceBannerFrame')
    const vertices = mesh.geometry.getAttribute('position')
    let minRoadClearance = Infinity
    const footBottoms = [Infinity, Infinity]
    for (let i = 0; i < vertices.count; i++) {
      const local = new THREE.Vector3().fromBufferAttribute(vertices, i)
      const world = mesh.localToWorld(local.clone())
      if (Math.abs(local.x) < 7.8) {
        const d = track.toTrack(world).d
        minRoadClearance = Math.min(minRoadClearance, world.y - track.toWorld(s, d).y)
      } else {
        assert.ok(Math.abs(local.x) >= 7.95 - 1e-5, 'post and foot outside barrier and both cars')
        const side = local.x < 0 ? 0 : 1
        footBottoms[side] = Math.min(footBottoms[side], world.y)
      }
    }
    assert.ok(minRoadClearance > 4.5, `overhead clearance ${minRoadClearance}`)
    for (let i = 0; i < 2; i++) {
      const ground = track.toWorld(s, (i === 0 ? -1 : 1) * 8.3).y
      assert.ok(Math.abs(footBottoms[i] - ground) < 0.08, 'feet meet banked ground, not centreline height')
    }
    assert.ok(banner.position.distanceTo(frame.position) < 1e-9)
    assert.equal(banner.userData.visualOnly, true)
    // Drive-height rays through both lanes must never touch the gantry.
    for (const d of [-2, 2]) {
      const from = track.toWorld(s - 2, d, 1)
      const to = track.toWorld(s + 2, d, 1)
      const ray = new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to))
      assert.equal(ray.intersectObject(banner, true).length, 0)
    }
  }
}))

test('START at spawn and FINISH on approach are legible in the actual chase-camera framing', () => withStubs(() => {
  const track = createDefaultTrack()
  for (const aspect of [16 / 9, 4 / 3]) {
    for (const [station, playerS, label] of [
      [START_BANNER_DISTANCE, 0, 'START'],
      [track.getFinishDistance(), track.getFinishDistance() - 45, 'FINISH'],
      [track.getFinishDistance(), track.getFinishDistance() - 20, 'FINISH'],
    ]) {
      const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 200)
      const controller = new HighwayCarController(new THREE.Object3D(), camera, track)
      try {
        controller.placeAt(playerS, 2)
        controller.speed = label === 'START' ? 0 : 40
        for (let i = 0; i < 180; i++) controller.updateCamera(1 / 60)
        camera.updateMatrixWorld(true)
        const banner = createRaceBanner(track, station, label)
        banner.updateMatrixWorld(true)
        const face = banner.getObjectByName('raceBannerApproachFace')
        // The word occupies the central 72% width and about 69% height.
        const points = []
        for (const x of [-BANNER_WIDTH * 0.36, BANNER_WIDTH * 0.36]) {
          for (const y of [-BANNER_HEIGHT * 0.34, BANNER_HEIGHT * 0.34]) {
            const p = face.localToWorld(new THREE.Vector3(x, y, 0)).project(camera)
            assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z > -1 && p.z < 1,
              `${label} text inside camera frustum: ${p.toArray()}`)
            points.push(p)
          }
        }
        const height = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y))
        assert.ok(height * 720 / 2 > 12, `${label} letters exceed 12px at 720p on approach`)
      } finally {
        controller.dispose()
      }
    }
  }
}))
