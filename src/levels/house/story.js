import * as THREE from 'three'
import { HousePursuit } from './pursuit.js'
import { findStoryAsset, createAuthoredGhost, createJumpScareGhost, darkenGraves, setGhostAppearance } from './story-assets.js'

export const HOUSE_EVIDENCE = [
  {
    id: 'evelyn-diary', title: "Evelyn's diary", foundAt: "Upstairs, Daniel's bedroom",
    position: [-1.25, 5.72, 1.45], label: 'E. VALE',
    storyNote: 'September 12. The man stands where Mother used to stand. He knows her words, but not the tune. Father says grief makes us hear things. I hid the little key inside this diary. Father took it and locked the diary in his room. My music box is still in my bedroom.',
    riteNote: 'The voice that sounds like Margaret belongs to someone else. Find Evelyn\'s music box in her bedroom.',
    response: 'EVELYN · “He knows her words. He never knows the tune.”',
  },
  {
    id: 'annex-message', title: 'The wall engraving', foundAt: 'Upstairs, the locked room',
    position: [-1.65, 5.72, 3.65], label: 'HE IS NOT MOTHER', kind: 'engraving',
    storyNote: 'Words are scratched into the wall: HE IS NOT MOTHER. Beneath them, smaller: Father shut the door from outside. I can hear him leaving. My name is Evelyn. I was here.',
    riteNote: 'Evelyn died confined in the upstairs annex. She did not run away.',
    response: 'EVELYN · “I was here. I was here the whole time.”',
  },
  {
    id: 'music-box', title: "Margaret's music box", foundAt: "Upstairs, Evelyn's bedroom",
    position: [1, 5.72, 4.3], label: 'M. V. / E. V.', kind: 'box',
    storyNote: 'The key from Evelyn\'s diary fits. A fragile melody starts, pauses, then finds its final note. Under the velvet is an estate record: ELIAS WREN, CARETAKER. DIED IN THE BARN, 1931. In another hand: He still counts this house as his. The box smells of lavender, not earth.',
    riteNote: 'The music box is Evelyn\'s anchor. Elias Wren is the older presence. Daniel\'s letter may reveal where Evelyn lies.',
    response: 'ELIAS · “Leave what belongs to this house.”',
  },
  {
    id: 'daniel-confession', title: "Daniel's unsent confession", foundAt: 'Kitchen, beside the lone place setting',
    position: [0, 2, 0], label: 'FORGIVE ME', kind: 'confession',
    storyNote: 'I locked Evelyn in that room. I told myself she would be safe until morning. When the house went quiet, I left. I buried my daughter in the unmarked grave beside the other grave behind the house. I told the sheriff she had run away. There is no forgiveness in that sentence.',
    riteNote: 'Daniel confined and abandoned Evelyn, then concealed her death. Take her music box to the unmarked grave beside the other grave.',
    response: 'THE HOUSE · Something is standing right in front of you.',
  },
]

export const RITE_QUESTIONS = [
  { title: 'Call the person who needs your help.', choices: ['Evelyn Vale', 'Margaret Vale', 'Elias Wren'], answer: 0, line: 'Evelyn Vale. You have been found.' },
  { title: 'Speak the truth that was concealed.', choices: ['You left this house of your own will.', 'Daniel locked you away and abandoned you.', 'You died in the old barn.'], answer: 1, line: 'You were confined and abandoned. This was not your fault.' },
  { title: 'Give her back the memory that holds her.', choices: ['The fourth place at supper', "The caretaker's estate record", "Margaret's music box"], answer: 2, line: 'Take the song your mother left you. You do not have to stay.' },
]

export class HouseStory {
  constructor({ model, level, items, camera, audio, onMessage }) {
    this.model = model
    this.camera = camera
    this.audio = audio
    this.onMessage = onMessage
    this.found = new Set()
    this.time = 0
    this.disturbance = 0
    this.riteStep = 0
    this.released = false
    this.complete = false
    this.releaseTime = 0
    this.nextApparitionAt = Infinity
    this.nextScareAllowedAt = 0
    this.pendingLetterScare = false
    this.pendingEvidenceScare = null
    this.chaseAfterScare = false
    this.jumpScareTime = 0
    this.phoneAnswered = false
    this.nextRing = 0
    this.phoneRingStartsAt = Infinity
    this.pursuit = new HousePursuit()
    this.endingTime = null
    this.root = new THREE.Group()
    this.root.name = 'vale-story'
    level.add(this.root)
    this.lights = []
    level.traverse(object => {
      if (object.isPointLight) this.lights.push({ light: object, intensity: object.intensity })
    })
    this.markers = []
    darkenGraves(this.model)
    for (const evidence of HOUSE_EVIDENCE) {
      const object = this.createEvidence(evidence)
      items.push({ ...evidence, object, inspectionMesh: object.userData.inspectionMesh || object.children[1], story: true, prompt: `E · Inspect ${evidence.title.toLowerCase()}` })
    }
    const grave = this.createGrave()
    this.gravePosition = this.authoredGravePosition?.clone() || grave.position.clone()
    items.push({ id: 'evelyn-grave', object: grave, story: true, title: "Evelyn's unmarked grave" })
    this.ghost = this.createGhost()
    this.root.add(this.ghost)
    this.ghost.visible = false
    this.jumpScareGhost = createJumpScareGhost(this.ghost, camera)
    this.flashlight = new THREE.SpotLight(0xffebcf, 5, 15, 0.48, 0.75, 1.5)
    this.flashlight.position.set(0.18, -0.18, -0.1)
    this.flashlight.target.position.set(0, 0, -8)
    camera.add(this.flashlight, this.flashlight.target)
    this.root.updateMatrixWorld(true)
  }

  startHouseApparition() {
    return this.triggerJumpScare(false)
  }

  ground(position) {
    const start = new THREE.Vector3(position[0], position[1] + 0.35, position[2])
    const ray = new THREE.Raycaster(start, new THREE.Vector3(0, -1, 0), 0, 12)
    const surfaces = []
    this.model.traverse(object => {
      if (object.isMesh && object.visible && /floor|yard|ground|garden|backyard/i.test(object.name)) surfaces.push(object)
    })
    const hit = ray.intersectObjects(surfaces, false)[0]
    return new THREE.Vector3(position[0], hit ? hit.point.y + 0.025 : position[1], position[2])
  }

  createEvidence(data) {
    if (data.kind === 'engraving') return this.createEngraving(data)
    const group = new THREE.Group()
    group.name = data.id
    if (data.kind === 'confession') {
      const phone = findStoryAsset(this.model, ['Phone'])
      const plateSource = findStoryAsset(this.model, ['Plate'])
      if (phone && plateSource) {
        const phoneBounds = new THREE.Box3().setFromObject(phone)
        const phoneCentre = phoneBounds.getCenter(new THREE.Vector3())
        const plateCentre = new THREE.Vector3(phoneCentre.x + 0.42, phoneBounds.min.y - 0.005, phoneCentre.z + 0.05)
        plateSource.updateWorldMatrix(true, false)
        const plate = plateSource.clone()
        plate.name = 'Kitchen_Single_Plate'
        plateSource.matrixWorld.decompose(plate.position, plate.quaternion, plate.scale)
        this.root.add(plate)
        plate.position.add(plateCentre.sub(new THREE.Box3().setFromObject(plate).getCenter(new THREE.Vector3())))
        const plateBounds = new THREE.Box3().setFromObject(plate)
        group.position.set(plateBounds.max.x + 0.25, plateBounds.min.y - 0.015, plateBounds.getCenter(new THREE.Vector3()).z)
      } else group.position.copy(this.ground(data.position))
    } else group.position.copy(this.ground(data.position))
    const box = data.kind === 'box'
    const base = new THREE.Mesh(new THREE.BoxGeometry(box ? 0.48 : 0.38, box ? 0.26 : 0.055, box ? 0.34 : 0.48), new THREE.MeshStandardMaterial({ color: box ? 0x492923 : 0x453932, roughness: 0.85 }))
    base.position.y = box ? 0.14 : 0.055
    group.add(base)
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = box ? '#4b3028' : '#d5c6a3'
    ctx.fillRect(0, 0, 512, 512)
    ctx.strokeStyle = box ? '#b4a06e' : '#847458'
    ctx.lineWidth = 4
    ctx.strokeRect(25, 25, 462, 462)
    ctx.fillStyle = box ? '#e1c998' : '#382d25'
    ctx.textAlign = 'center'
    ctx.font = '30px Georgia'
    ctx.fillText(data.label, 256, 190)
    ctx.font = '18px Georgia'
    ctx.fillText('VALE HOUSE', 256, 240)
    for (let i = 0; i < 5; i++) ctx.fillRect(75, 290 + i * 24, 330 - i * 17, 2)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const page = new THREE.Mesh(new THREE.PlaneGeometry(box ? 0.43 : 0.34, box ? 0.3 : 0.44), new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide }))
    page.rotation.x = -Math.PI / 2
    page.position.y = box ? 0.275 : 0.085
    group.add(page)
    this.root.add(group)
    this.addClueLight(group.position.clone().add(new THREE.Vector3(0.34, 0, 0)), data.id)
    return group
  }

  createEngraving(data) {
    const group = new THREE.Group()
    group.name = data.id
    const roomCentre = this.ground(data.position).add(new THREE.Vector3(0, 1.35, 0))
    const walls = []
    this.model.traverse(object => {
      if (object.isMesh && object.visible && /wall|structure/i.test(object.name)) walls.push(object)
    })
    let nearest = null
    for (const direction of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      const hit = new THREE.Raycaster(roomCentre, new THREE.Vector3(...direction), 0, 2.5)
        .intersectObjects(walls, false)[0]
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit
    }
    group.position.copy(nearest
      ? nearest.point.clone().add(roomCentre.clone().sub(nearest.point).normalize().multiplyScalar(0.04))
      : roomCentre.clone().add(new THREE.Vector3(0, 0, -0.8)))
    group.lookAt(roomCentre)
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 1024, 512)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#5b2822'
    ctx.shadowColor = '#1a0908'
    ctx.shadowBlur = 6
    ctx.font = 'bold 76px Georgia'
    ctx.fillText('HE IS NOT MOTHER', 512, 185)
    ctx.font = '42px Georgia'
    ctx.fillText('FATHER LOCKED THE DOOR', 512, 275)
    ctx.fillText('MY NAME IS EVELYN', 512, 345)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const inscription = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.7),
      new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 1, side: THREE.DoubleSide }),
    )
    group.add(inscription)
    group.userData.inspectionMesh = inscription
    this.root.add(group)
    return group
  }

  addClueLight(position, id) {
    const graveMarker = id === 'evelyn-grave'
    const intensity = graveMarker ? 0.006 : 0.7
    const settledIntensity = graveMarker ? 0.002 : 0.25
    const light = new THREE.PointLight(0xffbd79, intensity, graveMarker ? 0.4 : 2, 1.5)
    light.name = `${id}-clue-light`
    light.position.copy(position).add(new THREE.Vector3(0, 0.25, 0))
    this.root.add(light)
    this.markers.push({ id, light, intensity, settledIntensity })
  }

  createGrave() {
    const authored = findStoryAsset(this.model, ['grave.001', 'Grave_Evelyn_Unmarked', 'Evelyn_Grave'])
    if (authored) {
      const bounds = new THREE.Box3().setFromObject(authored)
      const position = bounds.getCenter(new THREE.Vector3())
      position.y = bounds.min.y
      // Attach without changing the placement in the artist's scene.
      this.root.attach(authored)
      this.authoredGravePosition = position
      for (const x of [-0.6, 0.6]) this.addClueLight(position.clone().add(new THREE.Vector3(x, 0, 0.6)), 'evelyn-grave')
      return authored
    }
    const group = new THREE.Group()
    group.name = 'evelyn-grave'
    group.position.copy(this.ground([7.7, 12, -15]))
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 7), new THREE.MeshStandardMaterial({ color: 0x302b25, roughness: 1 }))
    earth.scale.set(0.44, 0.09, 0.86)
    group.add(earth)
    const outline = new THREE.Shape()
    outline.moveTo(-0.24, 0)
    outline.lineTo(0.24, 0)
    outline.lineTo(0.24, 0.36)
    outline.quadraticCurveTo(0, 0.65, -0.24, 0.36)
    outline.closePath()
    const stone = new THREE.MeshStandardMaterial({ color: 0x33332f, roughness: 1 })
    const marker = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.12, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1, steps: 1 }), stone)
    marker.position.set(0, -0.05, -0.78)
    marker.rotation.z = -0.12
    group.add(marker)
    for (let index = 0; index < 12; index++) {
      const angle = index * Math.PI / 6
      const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), stone)
      pebble.position.set(Math.sin(angle) * 0.46, 0.015, Math.cos(angle) * 0.86)
      pebble.scale.set(1.1, 0.45, 0.85)
      pebble.rotation.y = index * 1.7
      group.add(pebble)
    }
    this.root.add(group)
    for (const x of [-0.58, 0.58]) this.addClueLight(group.position.clone().add(new THREE.Vector3(x, 0, -0.5)), 'evelyn-grave')
    return group
  }

  createGhost() {
    const authored = findStoryAsset(this.model, ['Ghost', 'Ghost_Evelyn', 'Evelyn', 'Ghost_Elias', 'Elias'])
    if (authored) return createAuthoredGhost(authored)
    const ghost = new THREE.Group()
    const material = new THREE.MeshBasicMaterial({ color: 0x9aafb2, transparent: true, opacity: 0.3, depthWrite: false })
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.31, 1.4, 10), material)
    torso.position.y = 0.85
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), material)
    head.scale.y = 1.3
    head.position.y = 1.74
    ghost.add(torso, head)
    for (const x of [-0.24, 0.24]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.035, 0.85, 6), material)
      arm.position.set(x, 0.92, 0)
      ghost.add(arm)
    }
    return ghost
  }

  canInspect(id) {
    if (!this.phoneAnswered) return false
    if (id === 'evelyn-grave') return HOUSE_EVIDENCE.every(item => this.found.has(item.id)) && this.pursuit?.state === 'safe'
    if (!HOUSE_EVIDENCE.some(item => item.id === id)) return false
    if (id === 'music-box') return this.found.has('evelyn-diary')
    if (id === 'daniel-confession') return ['evelyn-diary', 'annex-message', 'music-box'].every(item => this.found.has(item))
    return true
  }

  prompt(item) {
    if (item.id === 'evelyn-grave') {
      if (this.released) return 'Evelyn is at rest. Return to the front road.'
      return this.canInspect(item.id) ? 'E · Begin the release rite' : 'An unmarked grave. Find Daniel’s letter and survive the chase.'
    }
    if (this.found.has(item.id)) return `E · Revisit ${item.title.toLowerCase()}`
    if (!this.phoneAnswered) return 'The house is silent. Investigate the kitchen telephone.'
    if (!this.canInspect(item.id)) return item.id === 'music-box'
      ? 'Find the key in Evelyn’s diary in Daniel’s room.'
      : 'Find the diary, wall engraving and music box first.'
    return item.prompt
  }

  inspect(id) {
    if (!HOUSE_EVIDENCE.some(item => item.id === id) || !this.canInspect(id) || this.found.has(id)) return false
    this.found.add(id)
    this.disturbance = 4
    if (id === 'evelyn-diary' || id === 'annex-message') this.pendingEvidenceScare = id
    const evidence = HOUSE_EVIDENCE.find(item => item.id === id)
    this.onMessage(evidence.response)
    this.audio.playCue(id === 'music-box' ? 'ghostTwo' : 'ghostFootsteps')
    if (id === 'music-box') {
      this.audio.playMelody()
    }
    if (id === 'daniel-confession') {
      this.pendingLetterScare = true
    }
    return true
  }

  triggerLetterScare() {
    if (!this.pendingLetterScare || !this.camera) return false
    if (this.jumpScareTime > 0) {
      this.pendingLetterScare = false
      this.chaseAfterScare = true
      return true
    }
    if (!this.triggerJumpScare(true)) return false
    this.pendingLetterScare = false
    return true
  }

  finishInspection(id) {
    if (id === 'daniel-confession') return this.triggerLetterScare()
    if (id !== this.pendingEvidenceScare) return false
    this.pendingEvidenceScare = null
    return this.triggerJumpScare(false)
  }

  triggerJumpScare(startChase = false) {
    if (!this.camera || this.jumpScareTime > 0 || this.released) return false
    // Ambient and clue scares share a cooldown. The confession is the
    // deliberate final scare and must still start the story's chase.
    if (!startChase && this.time < this.nextScareAllowedAt) return false
    this.chaseAfterScare = startChase
    this.jumpScareTime = 0.95
    this.jumpScareEndsAt = performance.now() + 950
    this.nextScareAllowedAt = this.time + 35
    this.nextApparitionAt = this.time + 35 + Math.random() * 25
    this.audio.playJumpScare?.()
    this.ghost.visible = false
    this.jumpScareGhost.visible = true
    return true
  }

  // Runs every rendered frame, including the pointer-lock handoff after
  // inspection. Pausing gameplay cannot leave the face stuck on screen.
  updateJumpScare(dt, player) {
    if (!(this.jumpScareTime > 0)) return
    this.jumpScareTime = Math.max(0, Math.min(
      this.jumpScareTime - dt,
      (this.jumpScareEndsAt - performance.now()) / 1000,
    ))
    this.jumpScareGhost.visible = this.jumpScareTime > 0
    if (this.jumpScareTime === 0 && this.chaseAfterScare) {
      this.chaseAfterScare = false
      this.pursuit.start(player.position)
      this.onMessage('EVELYN · “Run to the two graves behind the house!” Hold Shift to sprint.', 10)
    }
  }

  schedulePhoneRing(delay = 3) {
    this.phoneRingStartsAt = this.time + delay
    this.nextRing = this.phoneRingStartsAt
  }

  isPhoneRinging() {
    return !this.phoneAnswered && this.time >= this.phoneRingStartsAt
  }

  answerPhone() {
    if (this.phoneAnswered) return
    this.audio.stopPhoneRing?.()
    this.phoneAnswered = true
    this.disturbance = 3
    this.nextApparitionAt = this.time + 20 + Math.random() * 10
    this.nextScareAllowedAt = this.nextApparitionAt
    this.onMessage('TELEPHONE · “Upstairs. Read what I left. If you hear Mother… it is not her.”', 10)
    this.audio.playCue('ghostOne')
  }

  answerRite(choice) {
    if (!this.canInspect('evelyn-grave') || this.released) return false
    if (choice !== RITE_QUESTIONS[this.riteStep].answer) {
      this.disturbance = 4
      this.audio.playCue('ghostBreath')
      return false
    }
    this.onMessage(RITE_QUESTIONS[this.riteStep].line, 7)
    this.riteStep++
    if (this.riteStep === RITE_QUESTIONS.length) {
      this.released = true
      this.releaseTime = this.time
      this.audio.setCalm(true)
      this.audio.playMelody()
      this.onMessage('EVELYN · “Tell them I did not run away.” The music box closes. For the first time, the yard is still.', 12)
    }
    return true
  }

  objective() {
    if (!this.phoneAnswered) return null
    if (this.complete) return 'CASE CLOSED · EVELYN RELEASED / SECOND PRESENCE UNRESOLVED'
    if (this.released) return 'RETURN TO THE FRONT ROAD · EVELYN IS AT REST'
    if (this.pendingLetterScare || this.chaseAfterScare || this.pursuit?.state === 'chasing') return 'RUN TO THE BACKYARD · REACH THE TWO GRAVES'
    if (!this.found.has('evelyn-diary')) return "UPSTAIRS · FIND EVELYN'S DIARY IN DANIEL'S ROOM"
    if (!this.found.has('annex-message')) return 'UPSTAIRS · READ THE ENGRAVING IN THE LOCKED ROOM'
    if (!this.found.has('music-box')) return "UPSTAIRS · FIND THE MUSIC BOX IN EVELYN'S ROOM"
    if (!this.found.has('daniel-confession')) return "KITCHEN · READ DANIEL'S LETTER BESIDE THE LONE PLATE"
    return 'BACKYARD · FIND EVELYN’S GRAVE BESIDE THE OTHER GRAVE'
  }

  update(dt, player, ringing) {
    this.time += dt
    this.disturbance = Math.max(0, this.disturbance - dt)
    if (ringing && this.isPhoneRinging() && this.time >= this.nextRing) {
      this.audio.playPhoneRing()
      this.nextRing = this.time + 6
    }
    for (const { light, intensity } of this.lights) {
      light.intensity = intensity * (this.disturbance > 0 ? 0.55 + 0.45 * Math.sin(this.time * 15) ** 2 : 1)
    }
    for (const { id, light, intensity, settledIntensity } of this.markers) {
      const settled = this.found.has(id) || this.released
      light.intensity = (settled ? settledIntensity : intensity) *
        (0.9 + 0.1 * Math.sin(this.time * 7 + light.id))
    }
    if (this.jumpScareTime > 0) return
    const haunting = this.found.has('daniel-confession') && this.pursuit.state !== 'idle' && !this.released
    if (this.phoneAnswered && !haunting && !this.released &&
        this.audio.isInside?.(player.position) && this.time >= this.nextApparitionAt) {
      if (this.startHouseApparition()) return
    }
    this.ghost.visible = haunting
    if (haunting) {
      const previous = this.pursuit.state
      this.pursuit.update(dt, player.position, this.gravePosition)
      if (previous === 'chasing' && this.pursuit.state === 'safe') {
        this.onMessage('EVELYN · “He cannot reach you here.” Face the grave and press E to begin the release.', 10)
        this.audio.playMelody()
      }
      this.ghost.position.copy(this.pursuit.state === 'chasing' || this.pursuit.state === 'caught'
        ? this.pursuit.position.clone().add(new THREE.Vector3(0, -1, 0))
        : this.gravePosition.clone().add(new THREE.Vector3(-3, 0, -2)))
      this.ghost.visible = this.pursuit.grace <= 0
      this.ghost.lookAt(player.position.x, this.ghost.position.y, player.position.z)
    }
    if (this.released && !this.complete) {
      const farewell = this.time - this.releaseTime
      this.ghost.visible = farewell < 12
      this.ghost.scale.setScalar(0.8)
      this.ghost.position.copy(this.gravePosition).add(new THREE.Vector3(0, farewell * 0.035, -0.25))
      this.ghost.lookAt(player.position.x, this.ghost.position.y, player.position.z)
      setGhostAppearance(this.ghost, Math.max(0, 0.65 * (1 - farewell / 12)), 0xf2dfb7)
    }
    if (this.released && !this.complete && player.position.z > 18) {
      this.complete = true
      this.endingTime = this.time
      this.ghost.position.set(-0.8, 5.7, 5.5)
      this.ghost.scale.setScalar(1.2)
      setGhostAppearance(this.ghost, 0.65, 0x7f9097)
      this.onMessage('CASE CLOSED · Evelyn Vale has been released. In the upstairs window, a tall man watches you leave. Elias Wren is still here.', 18)
      this.audio.playCue('ghostBreath')
    }
    if (this.complete) this.ghost.visible = true
  }

  retryPursuit(player) {
    if (this.pursuit.state !== 'caught') return false
    player.reset(this.pursuit.retry(), player.input.yaw)
    this.onMessage('EVELYN · “Keep moving. My grave is beyond the outbuildings.”', 8)
    return true
  }

  dispose() {
    for (const { light, intensity } of this.lights) light.intensity = intensity
    this.camera.remove(this.flashlight, this.flashlight.target)
    this.camera.remove(this.jumpScareGhost)
    this.jumpScareGhost.traverse(object => {
      if (!object.isMesh) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
    })
    this.flashlight.dispose()
  }
}
