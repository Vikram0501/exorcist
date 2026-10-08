import * as THREE from 'three'

export const CIRCUIT_FLOOD_POOL_SIZE = 2
export const CIRCUIT_FLOOD_INTENSITY = 180
const STATIONS = [
  { s: 81, d: -18, base: 4.1, height: 7, aimS: 86, aimD: -6 },
  { s: 565, d: 11.5, base: 0, height: 8, aimS: 590, aimD: 0 },
  { s: 625, d: 20.5, base: 0, height: 9, aimS: 630, aimD: 6 },
  { s: 975, d: -11.5, base: 0, height: 8, aimS: 1000, aimD: 0 },
  { s: 1035, d: -20.5, base: 0, height: 9, aimS: 1040, aimD: -6 },
]

// Five fixed fixtures share just two shadowless spotlights. Slot positions
// change only while dark; fade distances prevent popping at handovers.
export function createCircuitFloodlights(track, parent) {
  const group = new THREE.Group()
  group.name = 'circuitFloodlighting'
  parent.add(group)
  const stations = STATIONS.filter(station => station.s < track.totalLength).map(station => ({
    ...station,
    position: track.toWorld(station.s, station.d, station.height),
    target: track.toWorld(station.aimS, station.aimD, 0.8),
  }))
  const steel = new THREE.MeshStandardMaterial({ color: 0x38322c, roughness: 0.9, metalness: 0.25 })
  const lens = new THREE.MeshStandardMaterial({ color: 0xa89c80, emissive: 0xffd7a0, emissiveIntensity: 0.45, roughness: 0.6 })
  const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1, 0.14), steel, stations.length)
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.35, 0.22), lens, stations.length)
  poles.name = 'circuitFloodPoles'
  heads.name = 'circuitFloodHeads'
  const dummy = new THREE.Object3D()
  stations.forEach((station, i) => {
    const base = track.toWorld(station.s, station.d, station.base)
    dummy.position.copy(base).lerp(station.position, 0.5)
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), station.position.clone().sub(base).normalize())
    dummy.scale.set(1, station.position.distanceTo(base), 1)
    dummy.updateMatrix()
    poles.setMatrixAt(i, dummy.matrix)
    dummy.position.copy(station.position)
    dummy.scale.set(1, 1, 1)
    dummy.lookAt(station.target)
    dummy.updateMatrix()
    heads.setMatrixAt(i, dummy.matrix)
  })
  poles.computeBoundingSphere()
  heads.computeBoundingSphere()
  poles.instanceMatrix.needsUpdate = true
  heads.instanceMatrix.needsUpdate = true
  group.add(poles, heads)
  const slots = Array.from({ length: CIRCUIT_FLOOD_POOL_SIZE }, () => {
    const light = new THREE.SpotLight(0xffdfb5, 0, 65, Math.PI / 3, 0.75, 2)
    light.name = 'circuitFloodPool'
    light.castShadow = false
    group.add(light, light.target)
    return { light, station: null }
  })
  return { group, stations, slots }
}

export function updateCircuitFloodlights(handle, progress, dt) {
  const weight = station => 1 - THREE.MathUtils.smoothstep(Math.abs(station.s - progress), 35, 110)
  const alpha = 1 - Math.exp(-5 * Math.min(Math.max(dt || 0, 0), 0.1))
  for (const slot of handle.slots) {
    if (!slot.station || (weight(slot.station) === 0 && slot.light.intensity < 0.1)) {
      const available = handle.stations.filter(station => weight(station) > 0 &&
        !handle.slots.some(other => other !== slot && other.station === station))
      available.sort((a, b) => weight(b) - weight(a))
      slot.station = available[0] ?? null
      if (slot.station) {
        slot.light.position.copy(slot.station.position)
        slot.light.target.position.copy(slot.station.target)
      }
    }
    const target = slot.station ? weight(slot.station) * CIRCUIT_FLOOD_INTENSITY : 0
    slot.light.intensity += (target - slot.light.intensity) * alpha
  }
}
