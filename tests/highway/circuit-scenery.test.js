import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createDefaultTrack } from '../../src/levels/highway/track.js'
import {
  CIRCUIT_SITES, circuitSiteAt, createCircuitBarriers, createCircuitScenery,
} from '../../src/levels/highway/circuit-scenery.js'

function fixture() {
  const track = createDefaultTrack()
  const scenery = createCircuitScenery(track)
  const barriers = createCircuitBarriers(track)
  return { track, scenery, barriers }
}

test('concrete walls have a broad foot, battered face, visible joints and shared resources', () => {
  const { track, barriers } = fixture()
  const wall = barriers.find(mesh => mesh.userData.side === 1)
  wall.updateMatrixWorld(true)
  const ray = new THREE.Raycaster()
  const distanceAt = (s, height) => {
    ray.set(track.toWorld(s, 6, height), track.sampleAt(s).lateral)
    const hits = ray.intersectObject(wall)
    assert.ok(hits.length, 'front face renders toward the road')
    return hits[0].distance
  }
  assert.ok(distanceAt(2, 0.05) < distanceAt(2, 0.85), 'broad concrete foot tapers toward top')
  assert.ok(distanceAt(4, 0.5) > distanceAt(2, 0.5), 'recessed panel joints')
  assert.equal(new Set(barriers.map(mesh => mesh.material)).size, 1)
  assert.ok(wall.material.map.isDataTexture, 'procedural weathering')
  assert.ok(wall.material.roughness > 0.9)
  const colors = wall.geometry.getAttribute('color')
  assert.ok(new Set(colors.array).size > 5, 'module staining and dark seams')
})

test('grandstands, garages and every tire instance clear the complete curved racing surface', () => {
  const { track, scenery } = fixture()
  const matrix = new THREE.Matrix4()
  const point = new THREE.Vector3()
  let checked = 0
  scenery.traverse(mesh => {
    if (!mesh.isMesh) return
    const positions = mesh.geometry.getAttribute('position')
    const instances = mesh.isInstancedMesh ? mesh.count : 1
    for (let instance = 0; instance < instances; instance++) {
      if (mesh.isInstancedMesh) mesh.getMatrixAt(instance, matrix)
      else matrix.identity()
      // Footprint checks against the ENTIRE circuit, not just a local d.
      for (let i = 0; i < positions.count; i += 3) {
        point.fromBufferAttribute(positions, i).applyMatrix4(matrix)
        assert.ok(Number.isFinite(point.x + point.y + point.z))
        assert.ok(track.distanceToPath(point.x, point.z) > 9.7,
          `${mesh.name} stays outside road, curbs and concrete walls`)
        checked++
      }
    }
  })
  assert.ok(checked > 10000, 'checked actual geometry, including instanced tires')
})

test('tire walls sit on the outside of both major corners and ride banking', () => {
  const { track, scenery } = fixture()
  for (const [name, side] of [['leftCornerTires', 1], ['driftCornerTires', -1]]) {
    const mesh = scenery.getObjectByName(name)
    assert.ok(mesh.isInstancedMesh && mesh.count >= 60)
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < mesh.count; i += 3) {
      mesh.getMatrixAt(i, matrix)
      const point = new THREE.Vector3().setFromMatrixPosition(matrix)
      const solved = track.toTrack(point)
      const frame = track.sampleAt(solved.s)
      const offset = point.clone().sub(frame.position)
      assert.ok(Math.sign(frame.bank) === side, 'tires on outside of bend')
      assert.ok(Math.abs(offset.dot(frame.lateral) - side * 10.7) < 0.06)
      assert.ok(Math.abs(offset.dot(frame.up) - 0.16) < 0.005, 'bottom tires seated')
      const up = new THREE.Vector3().setFromMatrixColumn(matrix, 1).normalize()
      assert.ok(up.dot(frame.up) > 0.999, 'stack follows banked surface')
    }
  }
})

test('landmarks reserve space for city backdrops and remain cheap static scenery', () => {
  const { track, scenery, barriers } = fixture()
  for (const site of CIRCUIT_SITES) {
    const group = scenery.getObjectByName(site.name)
    assert.ok(group)
    assert.equal(circuitSiteAt((site.s0 + site.s1) / 2, site.side), site)
    assert.equal(circuitSiteAt((site.s0 + site.s1) / 2, -site.side), undefined)
    let low = Infinity, high = -Infinity
    group.traverse(mesh => {
      if (!mesh.isMesh) return
      const p = mesh.geometry.getAttribute('position')
      for (let i = 0; i < p.count; i += 13) {
        const point = new THREE.Vector3().fromBufferAttribute(p, i)
        const frame = track.sampleAt(track.toTrack(point).s)
        const height = point.sub(frame.position).dot(frame.up)
        low = Math.min(low, height)
        high = Math.max(high, height)
      }
    })
    assert.ok(low > -0.6 && low < -0.15, 'foundations meet the banked roadside ground')
    assert.ok(high > 3.5 && high < 4.3, 'structures retain their intended height above the track')
  }
  let draws = 0, triangles = 0, instances = 0
  scenery.traverse(mesh => {
    assert.ok(!mesh.isLight, 'no new lighting or shadow passes')
    if (!mesh.isMesh) return
    draws++
    const count = mesh.isInstancedMesh ? mesh.count : 1
    if (mesh.isInstancedMesh) instances += count
    triangles += mesh.geometry.index.count / 3 * count
    assert.equal(mesh.castShadow, false)
  })
  assert.ok(draws <= 14, `${draws} new landmark draw calls`)
  assert.ok(triangles < 60000, `${triangles} landmark triangles`)
  assert.ok(instances < 250, `${instances} tire instances`)
  assert.ok(barriers.length <= 80, 'barriers batched instead of hundreds of individual walls')
})
