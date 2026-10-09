import * as THREE from 'three'
import { checkPlayerObstacleCollision }
  from './obstacles.js'
import { asTrack } from './track.js'


// Driving keys must never be consumed while the user is typing. The car
// controller owns window-level key listeners (needed for Space
// preventDefault during racing), so it explicitly yields whenever the
// event target is an editable element: text inputs, textareas, selects
// and contenteditable regions. Key releases are still honoured so a key
// held while focus moves into a field cannot stick on.
export function isTypingTarget(target) {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}


// Closer detail framing, with track clearance and restrained corner preview.
export const CAMERA_DISTANCE = 6.0
export const CAMERA_HEIGHT = 3.05

// ============================================
// ARCADE CHASE-CAMERA TUNING
// ============================================
//
// The camera keeps its third-person chase concept: behind + above the car,
// looking ahead down the road. Speed gently widens the framing (distance,
// height, FOV) while drifting blends a restrained amount of velocity
// direction into the follow orientation so the slide reads visually.
//
// Distance: 6.0 (standstill) -> 7.1 (top speed).
// Height: 3.05 -> 3.55. Stays a chase view, never overhead.
// FOV: baseline (whatever the camera was constructed with, e.g. 75 in
// game) + up to CAMERA_FOV_GAIN degrees at top speed. Subtle, no tunnel.
// Drift blend: 100% heading normally, up to 25% velocity direction at full
// slide. Never swings around the car.
export const CAMERA_MAX_DISTANCE = 7.1
export const CAMERA_MAX_HEIGHT = 3.55
export const CAMERA_FOV_GAIN = 8
export const CAMERA_DRIFT_MAX_INFLUENCE = 0.25
export const CAMERA_LOOK_AHEAD_NEAR = 8
export const CAMERA_LOOK_AHEAD_FAR = 11
// Exponential smoothing responses (1/s). Frame-rate independent via
// alpha = 1 - exp(-response * dt); consistent at 30/60/120 FPS.
export const CAMERA_POSITION_RESPONSE = 6.5
export const CAMERA_YAW_RESPONSE = 8.0
export const CAMERA_LOOK_RESPONSE = 8.0
export const CAMERA_FOV_RESPONSE = 4.0
// Camera integration never steps more than this per update so a frame
// hitch cannot teleport or swing the camera.
export const CAMERA_MAX_DT = 0.05
// Velocity-direction influence needs genuine forward motion; disabled in
// reverse/standstill so the camera never flips.
export const CAMERA_MIN_FORWARD_SPEED = 3
export const CAMERA_MIN_SPEED_2D = 4
// Slip angle (rad) that counts as a "full" slide for the camera blend.
export const CAMERA_FULL_SLIP_ANGLE = 0.35


// ============================================
// ARCADE VEHICLE TUNING
// ============================================
//
// World-space arcade model with a layered drift state. The car owns its
// position, heading and velocity; track coordinates (s/d) are derived
// telemetry via track.toTrack(), never the source of motion.
//
// Normal driving (Space released) is the planted baseline; drifting
// interpolates grip/yaw/drag on top of it and recovers progressively.

// +14.3% over the original 35 m/s: matches the ghost's catch-up cap.
// Existing acceleration reaches this naturally in about 2.22 seconds.
export const MAX_FORWARD_SPEED = 40
export const MAX_REVERSE_SPEED = 10
export const ENGINE_ACCELERATION = 18
export const BRAKE_DECELERATION = 28
export const ROLLING_DRAG = 8

// Exponential lateral damping rate (1/s). High grip: planted, but finite
// so a real lateral component exists for the future drift phase.
export const NORMAL_GRIP = 10

// Fastest heading change at full steering authority (rad/s). At 40 m/s
// the tapered authority allows ~38 m turn radius, inside the ~95.7 m minimum,
// so the strongest corner stays comfortable.
export const MAX_YAW_RATE = 1.9

// How fast yawRate converges to its target (1/s). Snappy but smooth.
export const STEERING_RESPONSE = 10

// Full authority reached by this forward speed; scales down at standstill.
export const STEER_FULL_AUTHORITY_SPEED = 8

// Above this speed, steering tapers to HIGH_SPEED_STEER_FACTOR to avoid
// twitchiness at top speed.
export const STEER_TAPER_START_SPEED = 22
export const HIGH_SPEED_STEER_FACTOR = 0.55

// Driveable half-width: road half (7) minus car half-width (0.9) minus a
// small safety margin. Matches the historical ±5.5 lateral clamp.
export const BOUNDARY_D = 5.5

// Ride height: car-origin height above the track centre surface. The
// visual body is seated so its lowest point rests on the asphalt
// (surface offset +0.05 handled by seatCarVisuals); physics never uses Y.
export const CAR_RIDE_HEIGHT = 0.2

// Speed scrubbed while touching the boundary (per second of contact).
export const BOUNDARY_SCRUB = 0.8

// Physics never steps more than this per substep; large frame deltas are
// subdivided so hitches cannot tunnel the car through obstacles.
export const MAX_PHYSICS_STEP = 1 / 60

// Nearest-s solver guard: a single substep may never move progress more
// than this beyond its physical expectation before we distrust the solver.
export const PROGRESS_JUMP_TOLERANCE = 20


// ============================================
// ARCADE DRIFT TUNING
// ============================================
//
// Drift is a [0, 1] handling state layered over normal driving. Space
// (handbrake) drives driftFactor up while moving fast; releasing Space
// lets it fall gradually so the tyres "bite" again instead of snapping.

// Reduced lateral damping while drifting. Still real tyre control: too
// low spins forever, too high feels like nothing changed.
export const DRIFT_GRIP = 2.8

// Meaningful sliding needs rolling speed; below this Space only drags.
export const MIN_DRIFT_SPEED = 10

// Drift state transitions (per second). Entry is quick, recovery is
// deliberately progressive (~0.4 s to fully bite again).
export const DRIFT_ENTER_RATE = 6
export const DRIFT_RECOVERY_RATE = 2.5

// Oversteer: steering authority multiplier while drifting. Reduced grip
// alone feels icy; this rotates the rear out so slides are controllable.
// Kept modest: full-lock handbrake must slide, never spin on its own.
export const DRIFT_YAW_MULTIPLIER = 1.15

// Hard safety cap on yaw rate while sliding (normal max is 1.9).
export const MAX_DRIFT_YAW_RATE = 2.2

// Forward-speed penalty while sliding: long drifts cost pace so holding
// Space forever is never optimal. Sized above engine power so a powered
// drift slowly bleeds speed (~4 m/s per second at full throttle).
export const DRIFT_FORWARD_DRAG = 22

// Soft stabilization: past this slip angle extra grip blends back in so
// abuse slides toward recovery instead of spinning.
export const DRIFT_STABILIZE_ANGLE = 0.7
export const DRIFT_STABILIZE_GRIP = 12

// Telemetry thresholds for "actually drifting" (not just holding Space).
export const DRIFT_FACTOR_THRESHOLD = 0.35
export const DRIFT_SLIP_THRESHOLD = 0.12

// Subtle visual body roll gain (presentation only; heading stays physical).
// Roll per radian of drifted slip, plus a small steering lean.
export const DRIFT_ROLL_GAIN = 0.04
export const DRIFT_ROLL_MAX = 0.06


export class HighwayCarController {

  constructor(
    car,
    camera,
    roadPathOrTrack,
    arcLengths
  ) {

    this.car = car
    this.camera = camera
    // Single source of truth for track geometry. Accepts either a Track
    // instance or legacy (roadPath, arcLengths) so existing tests/game.js
    // keep working while migration completes.
    this.track = asTrack(roadPathOrTrack, arcLengths)
    // Legacy compat refs (tests + game.js may still read these).
    this.roadPath = this.track.points
    this.arcLengths = this.track.arcLengths

    // Car movement values (legacy names preserved for consumers).
    this.speed = 0
    this.maxSpeed = MAX_FORWARD_SPEED
    this.acceleration = ENGINE_ACCELERATION
    this.braking = BRAKE_DECELERATION
    this.friction = ROLLING_DRAG
    // Legacy: A/D no longer slew lateralOffset directly.
    this.steerSpeed = 7

    // Temporary road-boundary half-width (legacy clamp names preserved).
    this.minX = -BOUNDARY_D
    this.maxX = BOUNDARY_D

    // World-space vehicle state: heading owns orientation, velocity owns
    // motion. Spawn aligned to the track tangent at s = 0, offset +2.
    this.heading = this.track.sampleAt(0).angle
    this.velocity = new THREE.Vector3()
    this.yawRate = 0
    this.steerInput = 0
    this.throttleInput = false
    this.brakeInput = false
    this.driftInput = false

    // Drift/handbrake state (see DRIFT TUNING above). driftFactor blends
    // the handling model; slipAngle/isDrifting are derived telemetry for
    // gameplay and future polish (smoke, skids, audio, camera).
    this.driftFactor = 0
    this.slipAngle = 0
    this.isDrifting = false

    // Track telemetry, derived from world position (see refreshTelemetry).
    // pathProgress = s (distance along track, authoritative for race
    // logic); lateralOffset = d (lateral distance from centre).
    this.pathProgress = 0
    this.lateralOffset = 2

    // Keyboard state
    this.keys = {}

    this.canDrive = false;

    this.brakesWorking = true;

    this.obstacles = null;
    this.onCrash = null;
    this.hasCrashed = false;


    this.onKeyDown = (event) => {

      // Never steal keystrokes from text entry (ghost-name puzzle, chat,
      // any form field): no driving state, no Space interception, so a
      // typed Space stays a Space.
      if (isTypingTarget(event?.target)) {
        return
      }

      // Stop the browser from scrolling/activating UI on Space; the game
      // canvas owns this key while driving.
      if (event.code === 'Space') {
        event.preventDefault?.()
      }

      this.keys[event.code] = true

    }


    this.onKeyUp = (event) => {

      // Releases always clear, even from a text field, so holding a key
      // across a focus change cannot leave it stuck on.
      this.keys[event.code] = false

    }


    window.addEventListener(
      'keydown',
      this.onKeyDown
    )


    window.addEventListener(
      'keyup',
      this.onKeyUp
    )


    // Chase-camera smoothed state. cameraForward is the lagged follow
    // orientation (unit XZ vector); smoothedLook is the lagged look
    // target. Both are seeded from the spawn heading below via placeAt.
    this.cameraForward = new THREE.Vector3(
      Math.sin(this.heading), 0, Math.cos(this.heading)
    )
    this.smoothedLook = new THREE.Vector3()
    // Baseline FOV is captured lazily on the first updateCamera so both
    // the game camera (75) and test cameras (defaults) keep their own
    // baseline and only gain CAMERA_FOV_GAIN at top speed.
    this.baseCameraFov = null
    this.currentCameraDistance = CAMERA_DISTANCE
    this.currentCameraHeight = CAMERA_HEIGHT
    this.currentCameraFov =
      Number.isFinite(this.camera?.fov) ? this.camera.fov : 75
    this.currentLookAhead = CAMERA_LOOK_AHEAD_NEAR
    this.cameraDriftInfluence = 0

    // Place the car at spawn and put the camera behind it immediately
    // (opposite the car's own heading so spawn orientation is correct on
    // curves, not just +Z).
    this.placeAt(0, 2)
    this.camera.position.set(
      this.car.position.x -
        Math.sin(this.heading) * CAMERA_DISTANCE,
      this.car.position.y + CAMERA_HEIGHT,
      this.car.position.z -
        Math.cos(this.heading) * CAMERA_DISTANCE
    )

  }



  // Teleport-free placement helper: sets world position from track
  // coordinates, aligns heading to the local tangent and refreshes
  // telemetry. Used for spawn, tests and any future respawn flow.
  placeAt(s, d, headingAngle = null) {
    const frame = this.track.sampleAt(s)
    // Banked seating: toWorld rides the cross-slope, so the car sits on
    // the banked surface at its lateral offset, not at centreline height.
    this.car.position.copy(
      this.track.toWorld(s, d, CAR_RIDE_HEIGHT)
    )
    this.heading = headingAngle ?? frame.angle
    this.car.rotation.y = this.heading
    // Teleports are level: visual pitch re-derives on the next applyPose
    // (keeps bounding-box ground checks exact right after placement).
    const placedVisual = this.car.children[0]
    if (placedVisual) placedVisual.rotation.x = 0
    this.velocity.set(0, 0, 0)
    this.yawRate = 0
    this.speed = 0
    this.driftFactor = 0
    this.slipAngle = 0
    this.isDrifting = false
    // Teleports own the camera orientation state too: re-seed the lagged
    // follow vector and look target so the camera never sweeps across the
    // scene after a placement.
    if (this.cameraForward) {
      this.cameraForward.set(
        Math.sin(this.heading), 0, Math.cos(this.heading)
      )
    }
    if (this.smoothedLook) {
      this.smoothedLook.set(
        this.car.position.x + Math.sin(this.heading) *
          CAMERA_LOOK_AHEAD_NEAR,
        this.car.position.y + 1,
        this.car.position.z + Math.cos(this.heading) *
          CAMERA_LOOK_AHEAD_NEAR
      )
    }
    this.cameraDriftInfluence = 0
    this.refreshTelemetry()
  }


  forwardVector(into) {
    const out = into || new THREE.Vector3()
    return out.set(
      Math.sin(this.heading), 0, Math.cos(this.heading)
    )
  }


  rightVector(into) {
    const out = into || new THREE.Vector3()
    // Driver's right on the ground plane (forward × up).
    return out.set(
      -Math.cos(this.heading), 0, Math.sin(this.heading)
    )
  }


  // Speed-sensitive steering authority in [0, 1]: no yaw at standstill,
  // full authority through normal racing speeds, tapered at top speed.
  steeringAuthority(forwardSpeed) {
    const absSpeed = Math.abs(forwardSpeed)
    const lowAuthority =
      Math.min(1, absSpeed / STEER_FULL_AUTHORITY_SPEED)
    const taper = THREE.MathUtils.clamp(
      (absSpeed - STEER_TAPER_START_SPEED) /
        Math.max(
          1e-6,
          MAX_FORWARD_SPEED - STEER_TAPER_START_SPEED
        ),
      0,
      1
    )
    return lowAuthority *
      (1 - taper * (1 - HIGH_SPEED_STEER_FACTOR))
  }


  update(dt) {

    if (this.canDrive) {

        this.updateMovement(dt)

    }

    this.applyPose()
    this.refreshTelemetry()
    this.updateCamera(dt)

  }



  updateMovement(dt) {
    // Subdivide hitches so no single step tunnels through obstacles or
    // boundaries. dt is already clamped to 0.05 by game.js; NaN/negatives
    // are treated as zero.
    if (!Number.isFinite(dt) || dt <= 0) return
    const steps = Math.max(
      1,
      Math.ceil(dt / MAX_PHYSICS_STEP)
    )
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      this.stepPhysics(h)
      if (!this.canDrive) break
    }
  }


  stepPhysics(dt) {
    this.readInputs()

    const forward = this.forwardVector(new THREE.Vector3())

    // Longitudinal inputs work on the forward component in the current
    // frame; the resulting delta is applied to the world velocity vector
    // itself (which steering below must preserve, not drag along).
    const preForwardSpeed = this.velocity.dot(forward)
    let forwardSpeed = preForwardSpeed

    // --- Drift state: quick in, progressive out ---
    // Meaningful sliding needs forward rolling speed; otherwise Space only
    // drags (reverse/stopped behaviour below).
    const wantDrift =
      this.driftInput && forwardSpeed > MIN_DRIFT_SPEED
    if (wantDrift) {
      this.driftFactor = Math.min(
        1, this.driftFactor + DRIFT_ENTER_RATE * dt
      )
    } else {
      this.driftFactor = Math.max(
        0, this.driftFactor - DRIFT_RECOVERY_RATE * dt
      )
    }

    // --- Longitudinal: throttle / brake / reverse / drag ---
    if (this.throttleInput) {
      forwardSpeed += this.acceleration * dt
    }

    if (this.brakeInput && this.brakesWorking) {
      if (forwardSpeed > 0.5) {
        // Strong braking while moving forward.
        forwardSpeed -= this.braking * dt
      } else {
        // Controlled reverse once almost stopped.
        forwardSpeed -= this.acceleration * 0.6 * dt
      }
    }

    // Rolling drag only while the brakes work: preserves the scripted
    // brake-cut contract (a cut car keeps rolling instead of coasting
    // down, exactly like the previous scalar model).
    if (!this.throttleInput && this.brakesWorking) {
      const drag = this.friction * dt
      if (Math.abs(forwardSpeed) <= drag) {
        forwardSpeed = 0
      } else {
        forwardSpeed -= Math.sign(forwardSpeed) * drag
      }
    }

    // Handbrake forward penalty: long drifts cost pace. Disabled while the
    // scripted brake-cut holds (brakesWorking === false) so Space cannot
    // become a loophole substitute brake; sliding itself stays available.
    if (this.driftFactor > 0 && this.brakesWorking) {
      const bite = DRIFT_FORWARD_DRAG * this.driftFactor * dt
      if (Math.abs(forwardSpeed) <= bite) {
        forwardSpeed = 0
      } else {
        forwardSpeed -= Math.sign(forwardSpeed) * bite
      }
    } else if (this.driftInput && this.brakesWorking) {
      // Space at low speed / in reverse: plain extra drag toward stop.
      const bite = DRIFT_FORWARD_DRAG * dt
      if (Math.abs(forwardSpeed) <= bite) {
        forwardSpeed = 0
      } else {
        forwardSpeed -= Math.sign(forwardSpeed) * bite
      }
    }

    forwardSpeed = THREE.MathUtils.clamp(
      forwardSpeed,
      -MAX_REVERSE_SPEED,
      this.maxSpeed
    )

    // Commit the longitudinal change to the world velocity along the
    // pre-steer forward direction.
    this.velocity.addScaledVector(
      forward, forwardSpeed - preForwardSpeed
    )

    // --- Grip: interpolate normal -> drift damping ---
    // Extreme slip blends stabilizing grip back in (soft anti-spin).
    const stabilize = Math.max(
      0,
      Math.abs(this.slipAngle) - DRIFT_STABILIZE_ANGLE
    ) * DRIFT_STABILIZE_GRIP
    const effectiveGrip =
      NORMAL_GRIP +
      (DRIFT_GRIP - NORMAL_GRIP) * this.driftFactor +
      stabilize

    // --- Steering: arcade yaw-rate toward a speed-scaled target ---
    // Drifting adds oversteer authority so the rear rotates out instead
    // of the car merely feeling icy. Heading rotates first; world
    // velocity is preserved below, so genuine sideslip develops.
    const yawMultiplier =
      1 + (DRIFT_YAW_MULTIPLIER - 1) * this.driftFactor
    let targetYawRate =
      this.steerInput *
      MAX_YAW_RATE *
      this.steeringAuthority(forwardSpeed) *
      yawMultiplier
    targetYawRate = THREE.MathUtils.clamp(
      targetYawRate,
      -MAX_DRIFT_YAW_RATE,
      MAX_DRIFT_YAW_RATE
    )
    const blend = Math.min(1, STEERING_RESPONSE * dt)
    this.yawRate += (targetYawRate - this.yawRate) * blend
    this.heading += this.yawRate * dt

    // --- Grip: decompose the PRESERVED world velocity in the new frame.
    // The heading rotation above must not drag velocity with it; only
    // tyre damping turns velocity toward the heading.
    const newForward = this.forwardVector(new THREE.Vector3())
    const newRight = this.rightVector(new THREE.Vector3())
    // Re-decompose the preserved world velocity: this is where genuine
    // sideslip survives (heading rotated, velocity did not).
    forwardSpeed = this.velocity.dot(newForward)
    let lateralSpeed = this.velocity.dot(newRight)
    lateralSpeed *= Math.exp(-effectiveGrip * dt)

    // Recompose world velocity in the new heading frame.
    this.velocity
      .copy(newForward)
      .multiplyScalar(forwardSpeed)
      .addScaledVector(newRight, lateralSpeed)

    // --- Slip telemetry: signed angle between heading and velocity ---
    this.slipAngle = Math.atan2(
      lateralSpeed,
      Math.abs(forwardSpeed) + 1e-6
    )
    this.isDrifting =
      this.driftFactor > DRIFT_FACTOR_THRESHOLD &&
      Math.abs(forwardSpeed) > MIN_DRIFT_SPEED * 0.8 &&
      Math.abs(this.slipAngle) > DRIFT_SLIP_THRESHOLD

    // --- Integrate ---
    const oldS = this.pathProgress
    const oldD = this.lateralOffset
    this.car.position.x += this.velocity.x * dt
    this.car.position.z += this.velocity.z * dt

    // --- Temporary road boundary: soft containment ---
    this.applyBoundary(dt)

    // --- Track telemetry (derived, never integrated) ---
    this.refreshTelemetry(oldS, oldD)

    // --- Obstacle collision: swept (s, d) preserved from before ---
    if (
      this.obstacles &&
      this.obstacles.length > 0
    ) {
      // Swept open interval between the pre- and post-step progress, in
      // whichever direction the car moved. Skipped when stationary.
      // Padded by a solver epsilon so landing exactly on an obstacle's
      // progress cannot slip through the strict interval comparison.
      const fromS = Math.min(oldS, this.pathProgress) - 1e-6
      const toS = Math.max(oldS, this.pathProgress) + 1e-6
      if (toS - fromS > 1e-9) {
        const hit =
          checkPlayerObstacleCollision(
            this.obstacles,
            fromS,
            toS,
            this.lateralOffset
          )

        if (hit) {
          this.crashAt(hit)
          // crashAt zeroes speed/velocity: do not fall through to the
          // compat write below.
          return
        }
      }
    }

    // Compat scalar: signed forward speed for audio/UI consumers.
    this.speed = forwardSpeed
  }


  readInputs() {
    // Opposite steering inputs neutralize; key state (not keydown
    // frequency) drives physics. Positive steerInput yaws toward the
    // driver's left: d(forward)/d(heading) points left, so A (left) must
    // increase heading.
    const left = this.keys['KeyA'] ? 1 : 0
    const right = this.keys['KeyD'] ? 1 : 0
    this.steerInput = left - right
    this.throttleInput = Boolean(this.keys['KeyW'])
    this.brakeInput = Boolean(this.keys['KeyS'])
    this.driftInput = Boolean(this.keys['Space'])
  }


  applyBoundary(dt) {
    const info = this.track.toTrack(this.car.position)
    if (Math.abs(info.d) <= BOUNDARY_D) return

    const clampedD = THREE.MathUtils.clamp(
      info.d, -BOUNDARY_D, BOUNDARY_D
    )
    // Pull back inside by the penetration depth only (no teleport).
    this.car.position.x +=
      this.track.sampleAt(info.s).lateral.x * (clampedD - info.d)
    this.car.position.z +=
      this.track.sampleAt(info.s).lateral.z * (clampedD - info.d)

    // Remove outward lateral velocity; scrub a little forward speed.
    const frame = this.track.sampleAt(info.s)
    const outward = Math.sign(info.d)
    const lateralVel =
      this.velocity.x * frame.lateral.x +
      this.velocity.z * frame.lateral.z
    if (lateralVel * outward > 0) {
      this.velocity.x -= frame.lateral.x * lateralVel
      this.velocity.z -= frame.lateral.z * lateralVel
    }
    this.velocity.multiplyScalar(Math.max(0, 1 - BOUNDARY_SCRUB * dt))
  }


  refreshTelemetry(expectedS = null, expectedD = null) {
    const totalLength = this.track.totalLength
    const info = this.track.toTrack(this.car.position)

    let s = info.s
    if (
      expectedS !== null &&
      Math.abs(s - expectedS) > PROGRESS_JUMP_TOLERANCE &&
      Math.abs(expectedS) <= totalLength + PROGRESS_JUMP_TOLERANCE
    ) {
      // Nearest-s solver jumped implausibly far for one step: distrust
      // this sample and keep continuity instead.
      s = THREE.MathUtils.clamp(expectedS, 0, totalLength)
    } else {
      s = THREE.MathUtils.clamp(s, 0, totalLength)
    }

    this.pathProgress = s
    // Clamp lateral telemetry to the road half-width so consumers never
    // see escape values during the correction step itself.
    void expectedD
    this.lateralOffset = THREE.MathUtils.clamp(info.d, -7, 7)
  }


  crashAt(hit) {
    // Stop on the spot in world space, then re-seat just behind the
    // obstacle on the track so race/obstacle logic keeps working.
    this.velocity.set(0, 0, 0)
    this.yawRate = 0
    this.speed = 0
    this.driftFactor = 0
    this.slipAngle = 0
    this.isDrifting = false
    this.pathProgress = hit.progress - 2.5
    const frame = this.track.sampleAt(this.pathProgress)
    const d = THREE.MathUtils.clamp(this.lateralOffset, -7, 7)
    this.car.position.copy(
      this.track.toWorld(this.pathProgress, d, CAR_RIDE_HEIGHT)
    )
    this.heading = frame.angle
    this.lateralOffset = d
    this.canDrive = false

    if (!this.hasCrashed) {

      this.hasCrashed = true

      if (this.onCrash) {
        this.onCrash(hit)
      }

    }
  }


  applyPose() {
    // The car root owns physics: XZ + yaw heading only, never pitched or
    // rolled. Ride height follows the banked cross-section at the car's
    // current lateral offset; the visual child additionally pitches with
    // the road slope and rolls with banking so the car sits on the road
    // instead of pointing through it. Drift body roll adds on top.
    const frame = this.track.sampleAt(this.pathProgress)
    this.car.position.y = this.track.toWorld(
      this.pathProgress,
      this.lateralOffset,
      CAR_RIDE_HEIGHT
    ).y
    this.car.rotation.set(0, this.heading, 0)
    const visual = this.car.children[0]
    if (visual) {
      // Alignment of the nose with the track frame: bank/pitch fade out
      // as the car yaws away (spins, hard drifts), so they never fight
      // the drift presentation or flip-flop at standstill.
      const align = Math.cos(this.heading - frame.angle)
      const roll = THREE.MathUtils.clamp(
        -this.steerInput * 0.02 -
          this.slipAngle * this.driftFactor * DRIFT_ROLL_GAIN,
        -DRIFT_ROLL_MAX,
        DRIFT_ROLL_MAX
      )
      visual.rotation.z = roll + frame.bank * align
      const slope = THREE.MathUtils.clamp(
        frame.tangent.y * align,
        -1,
        1
      )
      visual.rotation.x = -Math.asin(slope)
    }
    // Effect telemetry for the environment pass (drift smoke, speed dust).
    // Plain values on userData: no coupling between car and environment.
    this.car.userData.driftFactor = this.driftFactor
    this.car.userData.slipAngle = this.slipAngle
    this.car.userData.speed = this.speed
  }


  // Legacy compat: delegates to Track. Kept because tests and callers use
  // these helpers; Track is authoritative for the actual mathematics.
  getSampleAtDistance(distance) {
    return this.track.sampleAt(distance)
  }


  computeSample(points, index) {
    // Legacy compat delegate: index-based sample via authoritative Track.
    const s = this.track.arcLengths[
      Math.max(0, Math.min(index, this.track.arcLengths.length - 1))
    ] ?? 0
    return this.track.sampleAt(s)
  }


  getDirectionAt(points, index) {
    // Legacy compat delegate: central-difference direction matches Track.
    const clamped = Math.max(
      0,
      Math.min(index, this.track.points.length - 1)
    )
    const p0 =
      this.track.points[Math.max(0, clamped - 1)]
    const p2 =
      this.track.points[
        Math.min(
          this.track.points.length - 1,
          clamped + 1
        )
      ]

    const dx = p2.x - p0.x
    const dz = p2.z - p0.z
    const len = Math.sqrt(dx * dx + dz * dz)

    if (len < 0.001) {
      return new THREE.Vector2(0, -1)
    }

    return new THREE.Vector2(
      dx / len,
      dz / len
    )
  }


  updateCamera(dt = 1 / 60) {
    // Frame-rate-independent chase camera with speed-sensitive framing
    // and a restrained drift blend. dt defaults to 1/60 so legacy
    // no-arg callers (tests) keep working; hitches are clamped so the
    // camera can never teleport, swing, or produce NaNs.
    let step = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60
    step = Math.min(step, CAMERA_MAX_DT)

    // Capture the camera's own baseline FOV once; never assume a value.
    if (this.baseCameraFov === null) {
      this.baseCameraFov = Number.isFinite(this.camera.fov)
        ? this.camera.fov
        : 75
      this.currentCameraFov = this.baseCameraFov
    }

    const headingDir = this.forwardVector(new THREE.Vector3())

    // --- Speed-sensitive framing (smooth: speed itself is continuous) ---
    const speedRatio = THREE.MathUtils.clamp(
      Math.abs(this.speed) / MAX_FORWARD_SPEED,
      0,
      1
    )
    this.currentCameraDistance =
      CAMERA_DISTANCE +
      (CAMERA_MAX_DISTANCE - CAMERA_DISTANCE) * speedRatio
    this.currentCameraHeight =
      CAMERA_HEIGHT +
      (CAMERA_MAX_HEIGHT - CAMERA_HEIGHT) * speedRatio
    this.currentLookAhead =
      CAMERA_LOOK_AHEAD_NEAR +
      (CAMERA_LOOK_AHEAD_FAR - CAMERA_LOOK_AHEAD_NEAR) * speedRatio
    const targetFov = this.baseCameraFov + CAMERA_FOV_GAIN * speedRatio
    const fovAlpha = 1 - Math.exp(-CAMERA_FOV_RESPONSE * step)
    this.currentCameraFov += (targetFov - this.currentCameraFov) * fovAlpha
    if (
      Number.isFinite(this.currentCameraFov) &&
      Math.abs(this.camera.fov - this.currentCameraFov) > 0.01
    ) {
      this.camera.fov = this.currentCameraFov
      this.camera.updateProjectionMatrix()
    }

    // --- Drift blend: heading vs velocity direction ---
    // Normal driving stays 100% heading. A genuine forward slide blends
    // in a capped share of velocity direction so the car's rotation
    // relative to travel reads visually. Disabled reversing/standing.
    const forwardSpeed = this.velocity.dot(headingDir)
    const speed2d = Math.hypot(this.velocity.x, this.velocity.z)
    let driftWeight = 0
    if (
      forwardSpeed > CAMERA_MIN_FORWARD_SPEED &&
      speed2d > CAMERA_MIN_SPEED_2D
    ) {
      const slipGate = THREE.MathUtils.clamp(
        Math.abs(this.slipAngle) / CAMERA_FULL_SLIP_ANGLE,
        0,
        1
      )
      driftWeight =
        CAMERA_DRIFT_MAX_INFLUENCE *
        THREE.MathUtils.clamp(this.driftFactor, 0, 1) *
        slipGate
    }
    if (!Number.isFinite(driftWeight)) driftWeight = 0
    this.cameraDriftInfluence = driftWeight

    const desired = new THREE.Vector3().copy(headingDir)
    if (driftWeight > 0) {
      const velDir = new THREE.Vector3(
        this.velocity.x, 0, this.velocity.z
      )
      if (velDir.lengthSq() > 1e-8) {
        velDir.normalize()
        desired.multiplyScalar(1 - driftWeight)
          .addScaledVector(velDir, driftWeight)
        if (desired.lengthSq() > 1e-8) desired.normalize()
        else desired.copy(headingDir)
      }
    }

    // Lagged follow orientation: the slight delay (plus the blend above)
    // is what exposes the drift angle instead of rigidly copying yaw.
    if (
      !Number.isFinite(this.cameraForward.x) ||
      this.cameraForward.lengthSq() < 1e-8
    ) {
      this.cameraForward.copy(headingDir)
    }
    const yawAlpha = 1 - Math.exp(-CAMERA_YAW_RESPONSE * step)
    this.cameraForward.lerp(desired, yawAlpha)
    if (this.cameraForward.lengthSq() > 1e-8) {
      this.cameraForward.normalize()
    } else {
      this.cameraForward.copy(headingDir)
    }
    this.cameraForward.y = 0

    // --- Position: behind the (lagged) follow direction ---
    const targetPosition = new THREE.Vector3(
      this.car.position.x -
        this.cameraForward.x * this.currentCameraDistance,
      this.car.position.y + this.currentCameraHeight,
      this.car.position.z -
        this.cameraForward.z * this.currentCameraDistance
    )
    if (
      !Number.isFinite(targetPosition.x) ||
      !Number.isFinite(targetPosition.y) ||
      !Number.isFinite(targetPosition.z)
    ) {
      targetPosition.set(
        this.car.position.x - headingDir.x * this.currentCameraDistance,
        this.car.position.y + this.currentCameraHeight,
        this.car.position.z - headingDir.z * this.currentCameraDistance
      )
    }
    const posAlpha = 1 - Math.exp(-CAMERA_POSITION_RESPONSE * step)
    this.camera.position.lerp(targetPosition, posAlpha)
    if (!Number.isFinite(this.camera.position.lengthSq())) {
      this.camera.position.copy(targetPosition)
    }
    this.constrainCameraPosition()

    // --- Look target: forward point along the follow direction ---
    // Uses the lagged orientation (not raw heading) so the target never
    // jumps sideways mid-drift; smoothed again for recovery without snap.
    const desiredLook = new THREE.Vector3(
      this.car.position.x +
        this.cameraForward.x * this.currentLookAhead,
      this.car.position.y + 1,
      this.car.position.z +
        this.cameraForward.z * this.currentLookAhead
    )
    // A small track preview helps reveal S-bends without making steering
    // feel track-locked. Keep the vehicle heading dominant, including drift.
    const ahead = this.track.sampleAt(this.pathProgress + this.currentLookAhead)
    const alignment = headingDir.dot(ahead.tangent)
    const preview = 0.22 * THREE.MathUtils.clamp((alignment - 0.4) / 0.6, 0, 1)
    const roadLook = this.track.toWorld(this.pathProgress + this.currentLookAhead,
      this.lateralOffset * 0.5, 1)
    desiredLook.lerp(roadLook, preview)
    // Follow uphill/downhill sightlines without changing horizontal framing.
    desiredLook.y = THREE.MathUtils.lerp(desiredLook.y, roadLook.y, 0.65)
    if (
      !Number.isFinite(this.smoothedLook.x) ||
      this.smoothedLook.lengthSq() < 1e-8
    ) {
      this.smoothedLook.copy(desiredLook)
    }
    const lookAlpha = 1 - Math.exp(-CAMERA_LOOK_RESPONSE * step)
    this.smoothedLook.lerp(desiredLook, lookAlpha)
    if (!Number.isFinite(this.smoothedLook.lengthSq())) {
      this.smoothedLook.copy(desiredLook)
    }
    this.camera.lookAt(this.smoothedLook)
  }

  constrainCameraPosition() {
    // Cheap local search: the camera is always near this car's station, so
    // no scene-wide raycasts or repeated full-track nearest-point scans.
    // After a teleport the camera is still converging from far away; leave
    // it to the smoothing pass that frame instead of clamping to a wrong
    // local section.
    const camera = this.camera.position
    let nearest = this.track.sampleAt(this.pathProgress)
    let best = Infinity
    for (let offset = -24; offset <= 16; offset += 4) {
      const frame = this.track.sampleAt(this.pathProgress + offset)
      const distance = Math.hypot(camera.x - frame.position.x, camera.z - frame.position.z)
      if (distance < best) {
        best = distance
        nearest = frame
      }
    }
    if (!(best <= 25)) return
    const delta = camera.clone().sub(nearest.position)
    const along = delta.x * nearest.tangent.x + delta.z * nearest.tangent.z
    const frame = this.track.sampleAt(nearest.progress + along)
    const dx = camera.x - frame.position.x
    const dz = camera.z - frame.position.z
    const lateralLength = Math.hypot(frame.lateral.x, frame.lateral.z)
    const rightX = frame.lateral.x / lateralLength
    const rightZ = frame.lateral.z / lateralLength
    const d = dx * rightX + dz * rightZ
    // The near plane remains inside the barriers, while stands/pits begin
    // beyond |d|=10. This also keeps extreme drift/reverse views out of props.
    const safeD = THREE.MathUtils.clamp(d, -5.8, 5.8)
    camera.x += rightX * (safeD - d)
    camera.z += rightZ * (safeD - d)
    const ground = frame.position.y - (frame.up.x * (camera.x - frame.position.x) +
      frame.up.z * (camera.z - frame.position.z)) / frame.up.y
    camera.y = Math.max(camera.y, ground + 1.5)
    const relative = camera.clone().sub(this.car.position)
    const forward = this.forwardVector(new THREE.Vector3())
    const alongCar = relative.dot(forward)
    const acrossCar = relative.x * -forward.z + relative.z * forward.x
    if (Math.abs(alongCar) < 3.1 && Math.abs(acrossCar) < 1.7) {
      camera.y = Math.max(camera.y, this.car.position.y + 2.4)
    }
  }

  setDrivingEnabled(enabled) {

    this.canDrive = enabled

    if (!enabled) {

        this.speed = 0
        this.velocity.set(0, 0, 0)
        this.yawRate = 0
        this.driftFactor = 0
        this.slipAngle = 0
        this.isDrifting = false

    }

    if (enabled) {

        this.brakesWorking = true
        this.hasCrashed = false;

    }

}



  dispose() {

    window.removeEventListener(
      'keydown',
      this.onKeyDown
    )


    window.removeEventListener(
      'keyup',
      this.onKeyUp
    )

  }

}
