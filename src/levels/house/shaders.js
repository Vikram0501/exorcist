import * as THREE from 'three'
import { findStoryAsset } from './story-assets.js'

const NO_RAYCAST = () => {}

function makeEffect(geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.frustumCulled = true
  mesh.raycast = NO_RAYCAST
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

function createPhoneSignal(level, model) {
  const phone = findStoryAsset(model, ['Phone'])
  if (!phone) return null
  phone.updateWorldMatrix(true, true)
  const bounds = new THREE.Box3().setFromObject(phone)
  if (bounds.isEmpty()) return null
  const signal = new THREE.Group()
  signal.name = 'phone-blood-signal'
  bounds.getCenter(signal.position)
  signal.position.y = bounds.max.y + 0.08
  const arcs = []
  for (let i = 0; i < 3; i++) {
    const arc = makeEffect(
      new THREE.RingGeometry(0.95, 1.02, 24, 1, 0, Math.PI),
      new THREE.MeshBasicMaterial({
        color: 0xd0192a, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
      `phone-signal-arc-${i}`,
    )
    signal.add(arc)
    arcs.push(arc)
  }
  signal.userData.arcs = arcs
  signal.visible = false
  level.add(signal)
  return signal
}

function createGhostSmoke(story) {
  if (!story.ghost) return null
  // Keep Elias dark, but leave the actor's own opacity and depth settings alone.
  const darkened = new Set()
  story.ghost.traverse(object => {
    if (!object.isMesh) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || darkened.has(material)) continue
      darkened.add(material)
      material.color?.multiplyScalar(0.12)
      material.emissive?.setHex(0x060102)
    }
  })
  const smoke = new THREE.Group()
  smoke.name = 'elias-black-smoke'
  smoke.visible = false
  const geometry = new THREE.PlaneGeometry(1, 1, 2, 4)
  const wisps = [
    { x: -0.28, y: 0.92, z: 0.13, width: 0.8, height: 1.7, phase: 0.3 },
    { x: 0.24, y: 1.08, z: -0.08, width: 0.72, height: 1.8, phase: 2.1 },
    { x: 0.02, y: 0.62, z: 0.22, width: 0.95, height: 1.35, phase: 4.2 },
  ]
  wisps.forEach((wisp, index) => {
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPhase: { value: wisp.phase } },
      vertexShader: `
        uniform float uTime;
        uniform float uPhase;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          vUv = uv;
          vWave = 0.5 + 0.5 * sin(uv.y * 9.0 + uv.x * 4.0 - uTime * 1.8 + uPhase);
          vec3 drifting = position;
          drifting.x += 0.15 * uv.y * (vWave * 2.0 - 1.0);
          drifting.y += 0.06 * vWave;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(drifting, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying float vWave;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float width = 0.43 + 0.25 * vWave;
          float feather = 1.0 - smoothstep(width - 0.28, width, abs(p.x));
          float ends = smoothstep(0.0, 0.36, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
          float breaks = 0.55 + 0.45 * vWave;
          float alpha = 0.38 * feather * ends * breaks;
          if (alpha < 0.01) discard;
          vec3 color = mix(vec3(0.008, 0.008, 0.01), vec3(0.075, 0.07, 0.08), 1.0 - feather);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    })
    const mesh = makeEffect(geometry, material, `elias-smoke-wisp-${index}`)
    mesh.position.set(wisp.x, wisp.y, wisp.z)
    mesh.scale.set(wisp.width, wisp.height, 1)
    mesh.renderOrder = 2
    smoke.add(mesh)
  })
  smoke.userData.geometry = geometry
  story.ghost.add(smoke)
  return smoke
}

export function createHouseShaderEffects({ level, model, story, camera }) {
  const phone = createPhoneSignal(level, model)
  const ghost = createGhostSmoke(story)
  let time = 0
  let phoneStrength = 0
  const ghostRotation = new THREE.Quaternion()
  const cameraRotation = new THREE.Quaternion()

  return {
    phone,
    ghost,
    update(dt, viewCamera = camera) {
      time += dt
      if (phone) {
        const ringing = story.isPhoneRinging() && !story.phoneAnswered
        const target = ringing ? 1 : 0
        phoneStrength += (target - phoneStrength) * Math.min(1, dt * 8)
        phone.visible = phoneStrength > 0.01
        if (phone.visible) {
          phone.quaternion.copy(viewCamera.quaternion)
          phone.userData.arcs.forEach((arc, index) => {
            const phase = (time * 0.65 + index / 3) % 1
            const scale = 0.18 + phase * 0.95
            const fade = phoneStrength * (1 - phase) ** 1.5
            arc.scale.setScalar(scale)
            arc.material.opacity = fade * 0.8
          })
        }
      }
      if (ghost) {
        const chasing = story.ghost.visible && story.pursuit.state === 'chasing'
        ghost.visible = chasing
        if (chasing) {
          story.ghost.getWorldQuaternion(ghostRotation).invert()
          viewCamera.getWorldQuaternion(cameraRotation)
          ghostRotation.multiply(cameraRotation)
          for (const wisp of ghost.children) {
            wisp.quaternion.copy(ghostRotation)
            wisp.material.uniforms.uTime.value = time
          }
        }
      }
    },
    dispose() {
      if (phone) {
        phone.traverse(object => {
          if (!object.isMesh) return
          object.geometry.dispose()
          object.material.dispose()
        })
        phone.removeFromParent()
      }
      if (ghost) {
        ghost.removeFromParent()
        for (const wisp of ghost.children) wisp.material.dispose()
        ghost.userData.geometry.dispose()
      }
    },
  }
}
