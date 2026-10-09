import * as THREE from 'three'
import { removeGhostNameUI }
  from './index.js'
import { checkPlayerObstacleCollision }
  from './obstacles.js'
import { CAR_RIDE_HEIGHT, BOUNDARY_D }
  from './car.js'
import { asTrack, FINISH_DISTANCE_BUFFER, LEGACY_TOTAL_ROAD_LENGTH }
  from './track.js'

// Visual road attitude for the ghost: the root keeps yaw-only rotation
// (physics/avoidance heading), while the visual child pitches with the
// track grade and rolls with banking so the car sits on the road. The
// ghost always aligns with the track frame, so no alignment fade is
// needed. No-op for test/object doubles without a visual child.
function seatGhostPitch(ghostCar, sample) {
  const visual = ghostCar?.children?.[0]
  if (!visual || !sample) return
  const slope = THREE.MathUtils.clamp(sample.tangent?.y ?? 0, -1, 1)
  visual.rotation.x = -Math.asin(slope)
  visual.rotation.z = sample.bank ?? 0
}

// Legacy absolute brake-cut stations on the previous ~952.66 m highway,
// normalized to progress fractions so the story beat keeps its pacing on
// new geometry: warning ~24.1%, trigger ~26.2% of the track.
const LEGACY_BRAKE_CUT_WARNING_PROGRESS = 230
const LEGACY_BRAKE_CUT_TRIGGER_PROGRESS = 250

// Brake-cut timing: 1.5 s warning, then 5.0 s of disabled brakes (within
// the 4-6 s design window) with the failure message visible throughout,
// then automatic restore. The restore is explicit so controls can never
// be left permanently disabled.
export const BRAKE_CUT_WARNING_DURATION = 1.5
export const BRAKE_CUT_DISABLED_DURATION = 5.0


// ============================================
// GHOST RUBBER-BAND TUNING
// ============================================
//
// Fair-rival values (player max is 40 m/s). The ghost drives the racing
// line automatically, so its cruise sits below the player's top
// speed and its catch-up maximum matches it; obstacle hits and the
// rubber-band easing give a clean player the edge, while mistakes let
// the ghost through. See GHOST TUNING in the constructor.
export const GHOST_CRUISE_SPEED = 35
export const GHOST_MIN_SPEED = 23
export const GHOST_MAX_SPEED = 40
export const GHOST_ACCELERATION = 12
export const GHOST_BRAKING = 12
export const GHOST_TARGET_LEAD = 6
export const GHOST_RUBBER_BAND_GAIN = 0.9
// The ghost's preferred racing lane (lateral offset from centre).
export const GHOST_PREFERRED_LANE = -2
// How fast the ghost eases back toward its lane after contact (1/s).
// (Superseded by the velocity-based lateral controller below, kept for
// compat; the controller's arrival behaviour covers lane recovery.)
export const GHOST_LANE_RECOVERY = 1.2
// Widest the ghost may be shoved (road half 7 minus car half-width).
export const GHOST_LATERAL_LIMIT = 6


// ============================================
// GHOST OBSTACLE AVOIDANCE TUNING
// ============================================
//
// The ghost reads real obstacle data in track space, picks a safe lane
// around each threat, commits until it clears it, then chains or
// recovers. No phasing: obstacles stay solid; a short per-obstacle
// cooldown only covers the separation moment after a real hit.
// Ghost car body: half-width 0.9, half-depth 2.0 (matches obstacles.js).
export const GHOST_BODY_HALF_WIDTH = 0.9
export const GHOST_BODY_HALF_DEPTH = 2.0
// Look-ahead window (m): NEAR at standstill, FAR at top speed.
export const GHOST_AVOID_LOOKAHEAD_NEAR = 25
export const GHOST_AVOID_LOOKAHEAD_FAR = 45
// Extra lateral clearance beyond the physical touch boundary.
export const GHOST_AVOID_SAFETY_MARGIN = 0.6
// Lateral targets are clamped inside this bound (road half 6.5/7 minus
// car half-width and a margin).
export const GHOST_AVOID_LANE_BOUND = 4.5
// Lateral servo: max speed, max accel, position gain.
export const GHOST_LATERAL_MAX_SPEED = 7
export const GHOST_LATERAL_ACCEL = 16
export const GHOST_LATERAL_GAIN = 3.0
// Rear clearance after the obstacle centre before avoidance ends.
export const GHOST_AVOID_REAR_MARGIN = 1.0
// Per-obstacle collision cooldown (s): covers the separation instant
// only, then the obstacle is fully solid again. Kept shorter than the
// knockback gap so the ghost can never slip past during the grace
// itself; escape comes from lateral separation + forced avoidance.
// Ghost lateral separation on impact (m): immediate footprint exit
// toward the escape side (collision response, not navigation).
export const GHOST_OBSTACLE_COOLDOWN = 0.15
export const GHOST_HIT_LATERAL_SEPARATION = 1.0
export const GHOST_HIT_LATERAL_KICK = 4.0
// Desired-speed cap while both escape routes are blocked.
export const GHOST_AVOID_BLOCKED_SPEED = 16
// Cost weights for lane choice.
export const GHOST_AVOID_PLAYER_PENALTY = 8
export const GHOST_AVOID_BOUNDARY_WEIGHT = 2.0
export const GHOST_AVOID_LANE_WEIGHT = 0.15


// ============================================
// CAR-TO-CAR COLLISION TUNING
// ============================================
//
// Arcade two-circle footprint per car (length 4, width 1.8): circles of
// CAR_COLLISION_RADIUS at ±CAR_COLLISION_CIRCLE_OFFSET along each car's
// forward axis. Both cars have equal mass; restitution is soft so bumps
// cost pace instead of launching cars.
export const CAR_COLLISION_RADIUS = 1.2
export const CAR_COLLISION_CIRCLE_OFFSET = 1.0
export const CAR_COLLISION_RESTITUTION = 0.35
// Below this closing speed (m/s) contact only separates positions; no
// velocity kick, so side-by-side rubbing never jitters or stacks damage.
export const CAR_COLLISION_MIN_IMPACT = 0.8
// Kick cooldown after an impulse (s). Separation runs every frame.
export const CAR_COLLISION_COOLDOWN = 0.25
// Hardest single impulse (m/s). Bounds hitch-speed artefacts.
export const CAR_COLLISION_MAX_IMPULSE = 14
// Ghost slowdown per hit scales with impact, clamped to this band
// (MIN = strongest slowdown). Sized so a rear-end nets the ghost a
// small loss even after the forward momentum exchange.
export const GHOST_HIT_SLOW_MIN = 0.92
export const GHOST_HIT_SLOW_MAX = 0.65
// Player heading disturbance per hit is capped (rad).
export const PLAYER_HIT_MAX_YAW_KICK = 0.35

// Occasional side-by-side racecraft, never a speed boost or a rear-end attack.
// The slow setup is a visible cue; a dodge, bend or obstacle cancels the move.
export const GHOST_BUMP_COOLDOWN = 10
export const GHOST_BUMP_INITIAL_DELAY = 6
export const GHOST_BUMP_SETUP_TIME = 0.45
export const GHOST_BUMP_DURATION = 1.4
export const GHOST_BUMP_LATERAL_SPEED = 1.8
export const GHOST_BUMP_MAX_IMPULSE = 2
export const GHOST_BUMP_SPEED_LOSS = 0.03

// Player-initiated contact must cost the ghost pace even when a rear-end
// transfers forward momentum. A short recovery window and longer damage
// cooldown reward one clean bump without allowing a chain of stunlock hits.
export const GHOST_PLAYER_HIT_MIN_LOSS = 0.06
export const GHOST_PLAYER_HIT_MAX_LOSS = 0.18
export const GHOST_PLAYER_HIT_COOLDOWN = 3
export const GHOST_HIT_RECOVERY_DURATION = 1.25
export const GHOST_HIT_RECOVERY_ACCELERATION = 4


export class HighwayRaceController {

  constructor(
    carController,
    ghostCar,
    finishZ,
    ghostName,
    ghostNameUI,
    scene,
    roadPathOrTrack,
    arcLengths,
    totalRoadLength
  ) {

    this.carController =
      carController

    this.ghostCar =
      ghostCar

    this.finishZ =
        finishZ

    this.ghostName =
      ghostName

    this.ghostNameUI =
      ghostNameUI

    this.scene =
      scene

    // Single source of truth for ghost sampling. Accepts a Track or
    // legacy (roadPath, arcLengths); rubber-band AI behaviour unchanged.
    this.track = asTrack(roadPathOrTrack, arcLengths)
    // Legacy compat refs (kept for existing readers/tests).
    this.roadPath = this.track.points
    this.arcLengths = this.track.arcLengths
    this.totalRoadLength = totalRoadLength ??
      this.track.totalLength

    this.obstacles = null

    this.raceFinished = false

    this.winner = null

    this.time = 0

    this.raceStarted = false

    this.finishedCountdown = false

    this.ghostSpeed = 5

    // Fair-rival rubber band (defaults are the named constants above).
    // Normal speed the ghost tries to drive at
    this.ghostCruiseSpeed = GHOST_CRUISE_SPEED

    // Slowest it is allowed to drive
    this.ghostMinSpeed = GHOST_MIN_SPEED

    // Fastest it can drive when catching up
    this.ghostMaxSpeed = GHOST_MAX_SPEED

    // How quickly it speeds up
    this.ghostAcceleration = GHOST_ACCELERATION

    // How quickly it slows down
    this.ghostBraking = GHOST_BRAKING

    // The ghost aims to race near the player, holding roughly this
    // many metres of its own lead. Smaller than before so the duel
    // stays visual instead of the ghost vanishing up the road.
    this.ghostTargetLead = GHOST_TARGET_LEAD

    // Rubber-band response: how strongly the desired speed reacts to
    // the lead error (m/s of target speed per metre of lead error).
    this.ghostRubberBandGain = GHOST_RUBBER_BAND_GAIN

    // Ghost path progress
    this.ghostPathProgress = 0

    // Per-obstacle collision cooldowns (obstacle -> seconds left). After
    // a real hit the ghost gets a SHORT separation window for that one
    // obstacle only; then it is fully solid again. Nothing here is ever
    // permanent: the ghost must navigate around, never phase through.
    this.ghostObstacleCooldowns = new Map()

    // Obstacle-avoidance state. The ghost commits to a side around its
    // current threat until it clears it (then chains to the next threat
    // or recovers to its preferred lane). Telemetry for tests/debug.
    this.ghostAvoiding = false
    this.ghostAvoidanceTargetD = GHOST_PREFERRED_LANE
    this.ghostAvoidanceSide = 0
    this.ghostAvoidanceObstacle = null
    this.ghostAvoidBlocked = false

    // Lateral collision state: the ghost prefers GHOST_PREFERRED_LANE
    // but car-to-car contact can shove it sideways; it then eases back
    // toward its lane instead of snapping. See updateCarCollision.
    this.ghostLateralOffset = GHOST_PREFERRED_LANE
    this.ghostLateralVelocity = 0

    // Contact cooldown so one overlap cannot stack impulses every frame.
    // Positional separation still runs every frame; only the velocity
    // kick is gated. Also stores the previous-frame centres so the
    // overlap test is swept along both cars' motion (no tunnelling).
    this.carCollisionCooldown = 0
    this.lastPlayerCollisionPos = null
    this.lastGhostCollisionPos = null
    // Latch only after an actual impulse. Touching gently can still become
    // one impact, but sustained rubbing cannot re-arm it on a 0.25 s timer.
    // Cleared only after the swept footprints separate by a small margin.
    this.carContactActive = false

    this.ghostBumpPhase = 'idle'
    this.ghostBumpCooldown = GHOST_BUMP_INITIAL_DELAY
    this.ghostBumpTimer = 0
    this.ghostBumpSide = 0
    this.ghostBumpStartD = GHOST_PREFERRED_LANE
    this.ghostBumpPlayerD = 0
    this.ghostBumpTargetD = GHOST_PREFERRED_LANE
    this.ghostPlayerHitCooldown = 0
    this.ghostHitRecoveryTimer = 0

    // Finish distance along path (authoritative: track progress).
    this.finishDistance = (totalRoadLength ??
      this.track.totalLength) - FINISH_DISTANCE_BUFFER


    // ============================================
    // BRAKE CUT SEQUENCE
    // ============================================

    this.brakeCutTriggered = false

    this.brakeCutPhase = 'none'

    this.brakeCutTimer = 0

    this.brakeCutTriggerProgress =
      (LEGACY_BRAKE_CUT_TRIGGER_PROGRESS / LEGACY_TOTAL_ROAD_LENGTH) *
      this.track.totalLength

    this.brakeCutWarningProgress =
      (LEGACY_BRAKE_CUT_WARNING_PROGRESS / LEGACY_TOTAL_ROAD_LENGTH) *
      this.track.totalLength

    this.brakeCutGhostSavedPos =
      new THREE.Vector3()


    // Make sure car cannot move initially
    this.carController
      .setDrivingEnabled(false)


    this.onFinish = null

    this.frozen = false

    // Level 3 race audio (countdown voice). Assigned by game.js
    // after construction; the countdown itself stays untouched.
    this.highwayAudio = null

    this.countdownAudioStarted = false


    // The brake-cut flicker below overwrites the scene background for a
    // beat; capture Level 3's sky (texture or color) so it can be restored
    // instead of falling back to the shared default.
    this.skyBackground = scene.background


    // ============================================
    // COUNTDOWN DISPLAY
    // ============================================

    this.countdownElement =
      document.createElement('div')


    this.countdownElement.style.position =
      'fixed'

    this.countdownElement.style.left =
      '50%'

    this.countdownElement.style.top =
      '35%'

    this.countdownElement.style.transform =
      'translate(-50%, -50%)'

    this.countdownElement.style.zIndex =
      '100'

    this.countdownElement.style.fontSize =
      '100px'

    this.countdownElement.style.fontWeight =
      'bold'

    this.countdownElement.style.color =
      'white'

    this.countdownElement.style.textShadow =
      '0 0 20px black'

    this.countdownElement.style.pointerEvents =
      'none'

    this.countdownElement.textContent =
      '3'


    document.body.appendChild(
      this.countdownElement
    )


    // ============================================
    // BRAKE CUT WARNING
    // ============================================

    this.brakeCutWarningEl =
      document.createElement('div')

    this.brakeCutWarningEl.style.position =
      'fixed'

    this.brakeCutWarningEl.style.left =
      '50%'

    this.brakeCutWarningEl.style.bottom =
      '80px'

    this.brakeCutWarningEl.style.transform =
      'translateX(-50%)'

    this.brakeCutWarningEl.style.zIndex =
      '100'

    this.brakeCutWarningEl.style.fontSize =
      '28px'

    this.brakeCutWarningEl.style.fontWeight =
      'bold'

    this.brakeCutWarningEl.style.color =
      '#ff3333'

    this.brakeCutWarningEl.style.textShadow =
      '0 0 12px #660000'

    this.brakeCutWarningEl.style.pointerEvents =
      'none'

    this.brakeCutWarningEl.style.fontFamily =
      'monospace'

    this.brakeCutWarningEl.style.letterSpacing =
      '2px'

    this.brakeCutWarningEl.style.display =
      'none'

    this.brakeCutWarningEl.textContent =
      'BRAKE FAILURE IMMINENT'


    document.body.appendChild(
      this.brakeCutWarningEl
    )


    // ============================================
    // BRAKE CUT AFTERMATH
    // ============================================

    this.brakeCutAftermathEl =
      document.createElement('div')

    this.brakeCutAftermathEl.style.position =
      'fixed'

    this.brakeCutAftermathEl.style.left =
      '50%'

    this.brakeCutAftermathEl.style.bottom =
      '80px'

    this.brakeCutAftermathEl.style.transform =
      'translateX(-50%)'

    this.brakeCutAftermathEl.style.zIndex =
      '100'

    this.brakeCutAftermathEl.style.fontSize =
      '28px'

    this.brakeCutAftermathEl.style.fontWeight =
      'bold'

    this.brakeCutAftermathEl.style.color =
      '#ff3333'

    this.brakeCutAftermathEl.style.textShadow =
      '0 0 12px #660000'

    this.brakeCutAftermathEl.style.pointerEvents =
      'none'

    this.brakeCutAftermathEl.style.fontFamily =
      'monospace'

    this.brakeCutAftermathEl.style.letterSpacing =
      '2px'

    this.brakeCutAftermathEl.style.display =
      'none'

    this.brakeCutAftermathEl.textContent =
      'BRAKES FAILED - DON\'T STOP NOW'


    document.body.appendChild(
      this.brakeCutAftermathEl
    )

  }



  // ============================================
  // UPDATE
  // ============================================

    update(dt) {

    // ============================================
    // COUNTDOWN
    // ============================================

    if (!this.finishedCountdown) {

        // Start the "3, 2, 1, GO" voice once with the visual
        // countdown. Guarded so update loops never restart it.
        if (!this.countdownAudioStarted) {

            this.countdownAudioStarted = true

            this.highwayAudio?.playCountdown()

        }

        this.time += dt


        // 3
        if (this.time < 1) {

        this.countdownElement.textContent =
            '3'

        }


        // 2
        else if (this.time < 2) {

        this.countdownElement.textContent =
            '2'

        }


        // 1
        else if (this.time < 3) {

        this.countdownElement.textContent =
            '1'

        }


        // GO
        else if (this.time < 4) {

        this.countdownElement.textContent =
            'GO!'


        if (!this.raceStarted) {

            this.raceStarted = true


            // Player can now drive

            this.carController
            .setDrivingEnabled(true)

        }

        }


        // Hide countdown
        else {

        this.finishedCountdown = true

        this.countdownElement.style.display =
            'none'

        this.highwayAudio?.restoreMusicAfterCountdown()

        }

    }



    // ============================================
    // BRAKE CUT PHASE
    // ============================================

    if (
        this.raceStarted &&
        !this.raceFinished
    ) {

        this.updateBrakeCut(dt)

    }



    // ============================================
    // GHOST RACING
    // ============================================

    if (
        this.raceStarted &&
        !this.raceFinished
        ) {

        this.updateGhost(dt)

        this.updateCarCollision(dt)

        this.checkFinish()

        }

    }

    updateBrakeCut(dt) {

        const playerProgress =
            this.carController.pathProgress


        // ============================================
        // TRIGGER WARNING
        // ============================================

        if (
            !this.brakeCutTriggered &&
            playerProgress >= this.brakeCutWarningProgress
        ) {

            this.brakeCutTriggered = true

            this.brakeCutPhase = 'warning'

            this.brakeCutTimer = 0

            this.brakeCutWarningEl.style.display =
                'block'

        }


        // ============================================
        // PHASE: WARNING
        // ============================================

        if (this.brakeCutPhase === 'warning') {

            this.brakeCutTimer += dt


            // Flicker the warning text
            const flicker =
                Math.sin(
                    this.brakeCutTimer * 12
                ) > 0

            this.brakeCutWarningEl.style.opacity =
                flicker ? '1' : '0.3'


            if (
                this.brakeCutTimer >= BRAKE_CUT_WARNING_DURATION
            ) {

                this.brakeCutPhase = 'cut'

                this.brakeCutTimer = 0

                this.brakeCutWarningEl.style.display =
                    'none'


                // Disable brakes
                this.carController
                    .brakesWorking = false

                // Failure message stays up for the whole disabled window,
                // not just the aftermath, so the warning always matches
                // the actual control state.
                this.brakeCutAftermathEl.style.display =
                    'block'

            }

        }


        // ============================================
        // PHASE: CUT
        // ============================================

        if (this.brakeCutPhase === 'cut') {

            this.brakeCutTimer += dt


            // Brief screen flicker
            if (
                this.brakeCutTimer < 0.5
            ) {

                const flickerOn =
                    Math.sin(
                        this.brakeCutTimer * 30
                    ) > 0

                this.scene.background =
                    new THREE.Color(
                        flickerOn
                            ? 0x2a0a0a
                            : 0x1a1a2e
                    )

            } else {

                this.scene.background =
                    this.skyBackground

            }


            if (
                this.brakeCutTimer >= BRAKE_CUT_DISABLED_DURATION
            ) {

                this.brakeCutPhase =
                    'done'

                this.brakeCutTimer = 0

                // Temporary failure ends here: restore normal braking so
                // controls can never be left permanently disabled.
                this.carController
                    .brakesWorking = true

                // Hide aftermath message
                this.brakeCutAftermathEl
                    .style.display = 'none'

            }

        }


        // Legacy 'aftermath' phase retained as a no-op alias: older saves
        // or tests may still set it directly. It shares the same disabled
        // window and restore path as 'cut'.
        if (
            this.brakeCutPhase === 'aftermath'
        ) {

            // Ensure the failure message is visible even if this phase was
            // entered directly without passing through 'cut'.
            this.brakeCutAftermathEl.style.display =
                'block'

            this.brakeCutTimer += dt


            if (
                this.brakeCutTimer >= BRAKE_CUT_DISABLED_DURATION
            ) {

                this.brakeCutPhase = 'done'

                this.carController
                    .brakesWorking = true

                this.brakeCutAftermathEl
                    .style.display = 'none'

            }

        }

    }

    updateGhost(dt) {

        // Sanitized frame step: non-finite/non-positive dt falls back to
        // a single 60 Hz step so bad clocks can never NaN the ghost.
        // Large (but valid) dt integrates linearly and stays bounded.
        const gdt = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60
        this.ghostPlayerHitCooldown = Math.max(0, this.ghostPlayerHitCooldown - gdt)
        // Split a frame that straddles recovery expiry; no instant speed
        // restoration and no frame-rate-dependent acceleration jump.
        const recoveryStep = Math.min(gdt, this.ghostHitRecoveryTimer)
        this.ghostHitRecoveryTimer = Math.max(0, this.ghostHitRecoveryTimer - gdt)


        // ============================================
        // PLAYER / GHOST PATH POSITIONS
        // ============================================

        const playerProgress =
            this.carController.pathProgress


        const ghostProgress =
            this.ghostPathProgress


        // ============================================
        // HOW FAR AHEAD IS THE GHOST?
        // ============================================
        //
        // NOTE: playerProgress - ghostProgress is the PLAYER's lead
        // (positive when the human is ahead). The previous formula fed
        // this straight into (targetLead - lead), which inverted the
        // rubber band: the ghost slowed to minimum speed whenever the
        // player pulled ahead and sprinted whenever it was already
        // ahead. The corrected error below is positive when the player
        // leads (ghost must chase) and negative when the ghost leads
        // (ghost must ease off toward its target lead).

        const playerLead =
            playerProgress - ghostProgress



        // ============================================
        // CALCULATE DESIRED SPEED
        // ============================================

        const difference =
            playerLead +
            this.ghostTargetLead


        // Obstacle-avoidance planning runs before speed so a blocked
        // route can cap the desired speed for this same frame.
        this.updateGhostAvoidance(gdt)


        let desiredSpeed =
            this.ghostCruiseSpeed +
            difference * this.ghostRubberBandGain


        desiredSpeed =
            Math.max(
            this.ghostMinSpeed,
            Math.min(
                desiredSpeed,
                this.ghostMaxSpeed
            )
            )


        // No clean route around the threat: lift early and thread the
        // least-dangerous gap instead of charging in at full pace. This
        // intentionally dips below the rubber-band minimum while blocked
        // (the final [0, max] clamp below still holds).
        if (this.ghostAvoidBlocked) {
            desiredSpeed = Math.min(
                desiredSpeed,
                GHOST_AVOID_BLOCKED_SPEED
            )
        }



        // ============================================
        // SPEED UP OR SLOW DOWN
        // ============================================

        if (
            this.ghostSpeed <
            desiredSpeed
        ) {

            const accelerationStep =
                Math.min(this.ghostAcceleration, GHOST_HIT_RECOVERY_ACCELERATION) * recoveryStep +
                this.ghostAcceleration * (gdt - recoveryStep)
            this.ghostSpeed = Math.min(desiredSpeed, this.ghostSpeed + accelerationStep)

        }

        else if (
            this.ghostSpeed >
            desiredSpeed
        ) {

            this.ghostSpeed = Math.max(desiredSpeed, this.ghostSpeed - this.ghostBraking * gdt)

        }



        // ============================================
        // KEEP SPEED INSIDE LIMITS
        // ============================================

        this.ghostSpeed =
            Math.max(
            0,
            Math.min(
                this.ghostSpeed,
                this.ghostMaxSpeed
            )
            )



        // ============================================
        // MOVE GHOST ALONG PATH
        // ============================================

        const oldGhostProgress =
            this.ghostPathProgress

        this.ghostPathProgress +=
            this.ghostSpeed * gdt


        // Check obstacle collision for ghost at its CURRENT lateral
        // position (contact can shove it off its preferred lane).
        // Cooldowns cover separation only: the obstacle is solid again
        // as soon as the short timer expires.
        if (
            this.obstacles &&
            this.obstacles.length > 0
        ) {
            const cooling = new Set(
                this.ghostObstacleCooldowns.keys()
            )
            const ghostHit =
                checkPlayerObstacleCollision(
                    this.obstacles,
                    oldGhostProgress,
                    this.ghostPathProgress,
                    this.ghostLateralOffset,
                    cooling
                )

            if (ghostHit) {
                // Knockback preserved: pushed behind the obstacle and
                // slowed. Then SEPARATE + NAVIGATE: an immediate lateral
                // exit from the footprint plus forced avoidance around
                // this exact obstacle, so the ghost routes around it
                // instead of re-hitting it or needing it phased out.
                // Each hit gains lateral ground, so even repeated hits
                // converge outward rather than looping in place.
                this.ghostObstacleCooldowns.set(
                    ghostHit,
                    GHOST_OBSTACLE_COOLDOWN
                )
                this.ghostPathProgress =
                    ghostHit.progress - 2.5
                this.ghostSpeed =
                    Math.min(
                        this.ghostSpeed,
                        5
                    )
                this.commitGhostAvoidance(ghostHit, true)
                const sepDir = Math.sign(
                    this.ghostAvoidanceTargetD - this.ghostLateralOffset
                ) || Math.sign(
                    this.ghostLateralOffset -
                        (ghostHit.lateralOffset ?? 0)
                ) || 1
                this.ghostLateralOffset = THREE.MathUtils.clamp(
                    this.ghostLateralOffset +
                        sepDir * GHOST_HIT_LATERAL_SEPARATION,
                    -GHOST_LATERAL_LIMIT,
                    GHOST_LATERAL_LIMIT
                )
            }
        }


        this.updateGhostBump(gdt)

        // Lateral servo toward the avoidance target (or the preferred
        // lane when free). Velocity-based with accel limits and arrival
        // braking: fast enough to dodge at race speed, no snapping, no
        // limit-cycle weave. Car-contact shoves feed through the same
        // velocity state and ease back naturally.
        {
            const rawStep = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60
            // Lateral motion never integrates more than 0.1 s per update
            // so a frame hitch cannot teleport the ghost sideways.
            const step = Math.min(rawStep, 0.1)
            const target = this.ghostAvoiding
                ? this.ghostAvoidanceTargetD
                : this.ghostBumpPhase !== 'idle'
                    ? this.ghostBumpTargetD
                    : GHOST_PREFERRED_LANE
            const bumping = this.ghostBumpPhase !== 'idle'
            const lateralMax = bumping
                ? (this.ghostBumpPhase === 'setup' ? 0.5 : GHOST_BUMP_LATERAL_SPEED)
                : GHOST_LATERAL_MAX_SPEED
            const err = target - this.ghostLateralOffset
            const desired = THREE.MathUtils.clamp(
                err * GHOST_LATERAL_GAIN,
                -lateralMax,
                lateralMax
            )
            const dv = THREE.MathUtils.clamp(
                desired - this.ghostLateralVelocity,
                -(bumping ? 4 : GHOST_LATERAL_ACCEL) * step,
                (bumping ? 4 : GHOST_LATERAL_ACCEL) * step
            )
            this.ghostLateralVelocity += dv
            // Arrival braking: kill overshoot so the ghost settles
            // instead of weaving around the target.
            if (
                Math.abs(err) < 0.5 &&
                this.ghostLateralVelocity * err < 0
            ) {
                this.ghostLateralVelocity *=
                    Math.max(0, 1 - 8 * step)
            }
            this.ghostLateralOffset = THREE.MathUtils.clamp(
                this.ghostLateralOffset + this.ghostLateralVelocity * step,
                -GHOST_LATERAL_LIMIT,
                GHOST_LATERAL_LIMIT
            )
            if (
                Math.abs(err) < 0.03 &&
                Math.abs(this.ghostLateralVelocity) < 0.3
            ) {
                this.ghostLateralOffset = target
                this.ghostLateralVelocity = 0
            }
        }


        // Update ghost world position (same Track source as player).

        {
            const totalLength = this.track.totalLength

            const clamped =
                Math.min(
                    this.ghostPathProgress,
                    totalLength
                )

            this.ghostPathProgress = clamped

            const sample =
                this.track.sampleAt(clamped)

            this.ghostCar.position.copy(
                this.track.toWorld(
                    clamped,
                    this.ghostLateralOffset,
                    CAR_RIDE_HEIGHT
                )
            )

            this.ghostCar.rotation.y =
                sample.angle

            seatGhostPitch(this.ghostCar, sample)

        }

        }


    // Reserve a clear corridor for BOTH cars, the outward nudge, and the
    // ghost's return to its preferred lane. Rechecked throughout the move.
    canGhostBump(starting = false) {
        const player = this.carController
        if (!this.raceStarted || this.raceFinished || this.frozen ||
            !player?.canDrive || player.hasCrashed || player.isDrifting ||
            player.driftFactor > 0.1 || this.ghostAvoiding || this.ghostAvoidBlocked ||
            this.ghostHitRecoveryTimer > 0 ||
            this.ghostObstacleCooldowns.size > 0 || this.carCollisionCooldown > 0 ||
            this.carContactActive) return false
        const s = player.pathProgress
        const d = player.lateralOffset
        const gap = d - this.ghostLateralOffset
        const speed = player.velocity.dot(player.forwardVector(new THREE.Vector3()))
        if (![s, d, gap, speed, player.heading, this.ghostSpeed].every(Number.isFinite)) return false
        if (speed < 18 || this.ghostSpeed < 18 || Math.abs(speed - this.ghostSpeed) > 3 ||
            Math.abs(s - this.ghostPathProgress) > 2 || Math.abs(player.yawRate) > 0.25 ||
            Math.abs(player.velocity.dot(player.rightVector(new THREE.Vector3()))) > 1) return false
        if (starting) {
            if (Math.abs(gap) < 2.7 || Math.abs(gap) > 4.8 ||
                Math.abs(this.ghostLateralOffset - GHOST_PREFERRED_LANE) > 0.5 ||
                Math.abs(this.ghostLateralVelocity) > 0.5) return false
        } else if (Math.sign(gap) !== this.ghostBumpSide || Math.abs(gap) < 2 ||
            Math.abs(d - this.ghostBumpPlayerD) > 0.6) return false

        // At least 1.5 m of room beyond the anticipated small outward shove.
        const side = starting ? Math.sign(gap) : this.ghostBumpSide
        const pushedD = d + side * 0.8
        if (Math.max(Math.abs(d), Math.abs(pushedD)) > BOUNDARY_D - 1.5) return false
        const horizon = Math.max(speed, this.ghostSpeed) *
            (GHOST_BUMP_SETUP_TIME + GHOST_BUMP_DURATION + 0.6)
        const from = Math.min(s, this.ghostPathProgress) - 8
        const to = Math.max(s, this.ghostPathProgress) + horizon
        if (from < 40 || to > this.finishDistance - 10) return false
        const frame = this.track.sampleAt(s)
        if (Math.cos(player.heading - frame.angle) < 0.99) return false
        for (let ahead = 0; ahead <= horizon; ahead += 5) {
            if (Math.cos(this.track.sampleAt(s + ahead).angle - frame.angle) < 0.99) return false
        }
        const lo = Math.min(this.ghostLateralOffset, GHOST_PREFERRED_LANE, d, pushedD) - 1.5
        const hi = Math.max(this.ghostLateralOffset, GHOST_PREFERRED_LANE, d, pushedD) + 1.5
        // Include the player's colliders too: integrations may provide them
        // separately. Cooling/just-hit obstacles are still unsafe here.
        return [...(this.obstacles ?? []), ...(player.obstacles ?? [])].every(obs =>
            obs.progress + obs.halfDepth < from || obs.progress - obs.halfDepth > to ||
            obs.lateralOffset + obs.halfWidth < lo || obs.lateralOffset - obs.halfWidth > hi)
    }

    endGhostBump() {
        this.ghostBumpPhase = 'idle'
        this.ghostBumpTimer = 0
        this.ghostBumpTargetD = GHOST_PREFERRED_LANE
        this.ghostBumpCooldown = GHOST_BUMP_COOLDOWN
    }

    updateGhostBump(dt) {
        this.ghostBumpCooldown = Math.max(0, this.ghostBumpCooldown - dt)
        if (this.ghostBumpPhase !== 'idle') {
            if (!this.canGhostBump() || dt > 0.1) {
                this.endGhostBump()
                return
            }
            this.ghostBumpTimer += dt
            if (this.ghostBumpPhase === 'setup' && this.ghostBumpTimer >= GHOST_BUMP_SETUP_TIME) {
                this.ghostBumpPhase = 'bump'
                this.ghostBumpTimer = 0
                // Commit to a shallow side overlap, never chase a dodging player.
                this.ghostBumpTargetD = this.ghostBumpPlayerD - this.ghostBumpSide * 2.1
            } else if (this.ghostBumpPhase === 'bump' && this.ghostBumpTimer >= GHOST_BUMP_DURATION) {
                this.endGhostBump()
            }
        } else if (this.ghostBumpCooldown === 0 && dt <= 0.1 && this.canGhostBump(true)) {
            this.ghostBumpPhase = 'setup'
            this.ghostBumpTimer = 0
            this.ghostBumpStartD = this.ghostLateralOffset
            this.ghostBumpPlayerD = this.carController.lateralOffset
            this.ghostBumpSide = Math.sign(this.ghostBumpPlayerD - this.ghostBumpStartD)
            this.ghostBumpTargetD = this.ghostBumpStartD + this.ghostBumpSide * 0.25
        }
    }

    // ============================================
    // GHOST OBSTACLE AVOIDANCE (local arcade navigation)
    // ============================================
    //
    // The ghost reads real obstacle data in track space, commits to a
    // lane around the nearest threat, holds it until the car clears the
    // obstacle's footprint, then chains to the next threat or recovers
    // to its preferred lane. Side choice minimises a deterministic cost
    // (movement + nearby-obstacle risk + boundary + player proximity +
    // lane preference). Obstacles are NEVER phased out: hits knock back
    // and force re-avoidance around the same obstacle.

    ghostAvoidLookahead() {
        const speedRatio = THREE.MathUtils.clamp(
            this.ghostSpeed / GHOST_MAX_SPEED,
            0,
            1
        )
        return GHOST_AVOID_LOOKAHEAD_NEAR +
            (GHOST_AVOID_LOOKAHEAD_FAR - GHOST_AVOID_LOOKAHEAD_NEAR) *
            speedRatio
    }


    avoidClearance(obs) {
        return (obs?.halfDepth ?? 0.7) +
            GHOST_BODY_HALF_DEPTH +
            GHOST_AVOID_REAR_MARGIN
    }


    // Lateral room needed to pass an obstacle: its half-width plus the
    // ghost body plus a safety margin.
    avoidNeed(obs) {
        return (obs?.halfWidth ?? 0.7) +
            GHOST_BODY_HALF_WIDTH +
            GHOST_AVOID_SAFETY_MARGIN
    }


    updateGhostAvoidance(dt) {
        const step = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60

        // Decay per-obstacle separation cooldowns.
        for (const [obs, left] of this.ghostObstacleCooldowns) {
            const rest = left - step
            if (rest <= 0) {
                this.ghostObstacleCooldowns.delete(obs)
            } else {
                this.ghostObstacleCooldowns.set(obs, rest)
            }
        }

        const obstacles = this.obstacles ?? []
        const lookahead = this.ghostAvoidLookahead()

        // Validate (or finish) the current commitment.
        if (this.ghostAvoiding && this.ghostAvoidanceObstacle) {
            const obs = this.ghostAvoidanceObstacle
            const cleared =
                this.ghostPathProgress >
                obs.progress + this.avoidClearance(obs)
            const stale =
                !obstacles.includes(obs) ||
                obs.progress + this.avoidClearance(obs) <
                this.ghostPathProgress - 30
            if (cleared || stale) {
                // Chain: if another threat is already inside the window,
                // hold a continuous line instead of centring and
                // re-dodging.
                const next = this.findGhostThreat(obstacles, lookahead)
                if (next) {
                    this.commitGhostAvoidance(next, false)
                } else {
                    this.ghostAvoiding = false
                    this.ghostAvoidanceObstacle = null
                    this.ghostAvoidanceSide = 0
                    this.ghostAvoidBlocked = false
                }
                return
            }
            // Committed: hold the line (no left/right/left flicker) --
            // unless a strictly nearer threat appeared (e.g. after a
            // car-contact shove), which takes over deterministically.
            const nearer = this.findGhostThreat(
                obstacles.filter(o => o !== obs),
                lookahead
            )
            if (
                nearer &&
                nearer.progress < obs.progress - 2
            ) {
                this.commitGhostAvoidance(nearer, false)
            }
            return
        }

        // Free: adopt the nearest threat, if any.
        const threat = this.findGhostThreat(obstacles, lookahead)
        if (threat) {
            this.commitGhostAvoidance(threat, false)
        } else if (this.ghostAvoiding) {
            this.ghostAvoiding = false
            this.ghostAvoidanceObstacle = null
            this.ghostAvoidanceSide = 0
            this.ghostAvoidBlocked = false
        }
    }


    // Nearest obstacle ahead whose footprint the ghost's current lateral
    // position would clip (with safety margin). Cooling (just-hit)
    // obstacles are skipped until separation finishes.
    findGhostThreat(obstacles, lookahead) {
        let best = null
        let bestDs = Infinity
        for (const obs of obstacles) {
            if (!obs || !Number.isFinite(obs.progress)) continue
            if (this.ghostObstacleCooldowns.has(obs)) continue
            const deltaS = obs.progress - this.ghostPathProgress
            if (deltaS <= 0 || deltaS > lookahead) continue
            const gap = Math.abs(
                (obs.lateralOffset ?? 0) - this.ghostLateralOffset
            )
            if (gap < this.avoidNeed(obs) && deltaS < bestDs) {
                best = obs
                bestDs = deltaS
            }
        }
        return best
    }


    // Commit to a route around an obstacle: pick the cheaper side and
    // hold it. fromHit adds a lateral kick to start the escape move.
    commitGhostAvoidance(obs, fromHit) {
        const choice = this.chooseAvoidanceTarget(obs)
        this.ghostAvoiding = true
        this.ghostAvoidanceObstacle = obs
        this.ghostAvoidanceTargetD = choice.target
        this.ghostAvoidanceSide = choice.side
        this.ghostAvoidBlocked = choice.blocked
        if (fromHit) {
            const push = Math.sign(
                choice.target - this.ghostLateralOffset
            ) || choice.side || 1
            this.ghostLateralVelocity = THREE.MathUtils.clamp(
                this.ghostLateralVelocity + push * GHOST_HIT_LATERAL_KICK,
                -GHOST_LATERAL_MAX_SPEED,
                GHOST_LATERAL_MAX_SPEED
            )
        }
    }


    // Deterministic lane choice: geometry-derived candidates scored by
    // movement + nearby-obstacle risk + boundary + player proximity +
    // lane preference. Never random, never per-frame dithering (the
    // caller commits to the result until the obstacle clears).
    chooseAvoidanceTarget(obs) {
        const ghostD = this.ghostLateralOffset
        const obsD = obs?.lateralOffset ?? 0
        const need = this.avoidNeed(obs)
        const bound = GHOST_AVOID_LANE_BOUND

        const raw = [
            GHOST_PREFERRED_LANE,
            ghostD,
            THREE.MathUtils.clamp(obsD - need, -bound, bound),
            THREE.MathUtils.clamp(obsD + need, -bound, bound),
        ]
        const candidates = []
        for (const lane of raw) {
            if (!Number.isFinite(lane)) continue
            const clamped = THREE.MathUtils.clamp(lane, -bound, bound)
            if (!candidates.some(c => Math.abs(c - clamped) < 1e-6)) {
                candidates.push(clamped)
            }
        }

        const player = this.carController
        const playerS = player?.pathProgress ?? null
        const playerD = player?.lateralOffset ?? null
        const playerNear = player !== null &&
            playerS !== null &&
            Math.abs(playerS - this.ghostPathProgress) < 8

        let best = null
        for (const target of candidates) {
            const clearsCurrent =
                Math.abs(target - obsD) >= need - 1e-6
            let risk = 0
            if (this.obstacles) {
                for (const other of this.obstacles) {
                    if (!other || other === obs) continue
                    if (!Number.isFinite(other.progress)) continue
                    const ds = other.progress - this.ghostPathProgress
                    if (ds <= -4 || ds > this.ghostAvoidLookahead()) continue
                    const overlap = Math.max(
                        0,
                        this.avoidNeed(other) -
                            Math.abs((other.lateralOffset ?? 0) - target)
                    )
                    risk += overlap * 3 / (1 + Math.max(0, ds) / 10)
                }
            }
            const boundary = target >= bound || target <= -bound
                ? 100
                : Math.max(0, Math.abs(target) - 3.5) *
                  GHOST_AVOID_BOUNDARY_WEIGHT
            const playerRisk = playerNear &&
                playerD !== null &&
                Math.abs(playerD - target) < 2.6
                ? GHOST_AVOID_PLAYER_PENALTY
                : 0
            const cost =
                Math.abs(target - ghostD) +
                risk +
                boundary +
                playerRisk +
                Math.abs(target - GHOST_PREFERRED_LANE) *
                GHOST_AVOID_LANE_WEIGHT +
                (clearsCurrent ? 0 : 50)
            if (!best || cost < best.cost) {
                best = { target, cost, clearsCurrent, risk }
            }
        }

        const target = best ? best.target : ghostD
        return {
            target,
            side: target >= obsD ? 1 : -1,
            blocked: !best || !best.clearsCurrent || best.risk > 4,
        }
    }


    // ============================================
    // PLAYER <-> GHOST CAR COLLISION (arcade)
    // ============================================
    //
    // Swept two-circle footprints (no physics engine): each car owns two
    // circles along its forward axis, and the overlap test runs on the
    // segments both circles travelled this frame, so fast cars cannot
    // tunnel through each other. Response is arcade impulse with equal
    // masses and soft restitution: positional separation runs every
    // frame, while the velocity kick only fires when the cars are
    // actually closing (plus a short cooldown), so side-by-side rubbing
    // never jitters. The ghost's share of separation goes through its
    // track-frame state (progress + lateral offset) because its world
    // position is re-derived from the Track every frame.

    updateCarCollision(dt) {
        const player = this.carController

        const playerPos = player?.car?.position ?? null
        const ghostPos = this.ghostCar?.position ?? null

        const step = Number.isFinite(dt) && dt > 0
            ? Math.min(dt, 0.1)
            : 1 / 60

        // Cooldown always decays; previous centres always refresh so the
        // swept segments stay exactly one frame long.
        this.carCollisionCooldown = Math.max(
            0, this.carCollisionCooldown - step
        )

        if (
            !player || !playerPos || !ghostPos ||
            !player.canDrive || this.raceFinished
        ) {
            this.carContactActive = false
            if (playerPos) {
                this.lastPlayerCollisionPos =
                    this.lastPlayerCollisionPos ?? new THREE.Vector3()
                this.lastPlayerCollisionPos.copy(playerPos)
            }
            if (ghostPos) {
                this.lastGhostCollisionPos =
                    this.lastGhostCollisionPos ?? new THREE.Vector3()
                this.lastGhostCollisionPos.copy(ghostPos)
            }
            return
        }

        if (!this.lastPlayerCollisionPos) {
            this.lastPlayerCollisionPos = playerPos.clone()
        }
        if (!this.lastGhostCollisionPos) {
            this.lastGhostCollisionPos = ghostPos.clone()
        }

        const heading = player.heading
        const playerForward = { x: Math.sin(heading), z: Math.cos(heading) }

        const ghostFrame = this.track.sampleAt(
            THREE.MathUtils.clamp(
                this.ghostPathProgress, 0, this.track.totalLength
            )
        )
        const ghostForward = {
            x: Math.sin(ghostFrame.angle),
            z: Math.cos(ghostFrame.angle),
        }

        // Closest approach between the swept circle pairs.
        let best = null
        for (const pOff of [-CAR_COLLISION_CIRCLE_OFFSET, CAR_COLLISION_CIRCLE_OFFSET]) {
            for (const gOff of [-CAR_COLLISION_CIRCLE_OFFSET, CAR_COLLISION_CIRCLE_OFFSET]) {
                const p0 = {
                    x: this.lastPlayerCollisionPos.x + playerForward.x * pOff,
                    z: this.lastPlayerCollisionPos.z + playerForward.z * pOff,
                }
                const p1 = {
                    x: playerPos.x + playerForward.x * pOff,
                    z: playerPos.z + playerForward.z * pOff,
                }
                const g0 = {
                    x: this.lastGhostCollisionPos.x + ghostForward.x * gOff,
                    z: this.lastGhostCollisionPos.z + ghostForward.z * gOff,
                }
                const g1 = {
                    x: ghostPos.x + ghostForward.x * gOff,
                    z: ghostPos.z + ghostForward.z * gOff,
                }
                const contact = closestSegmentApproach(p0, p1, g0, g1)
                if (!best || contact.distance < best.distance) {
                    best = contact
                }
            }
        }

        // Advance the swept history for the next frame.
        this.lastPlayerCollisionPos.copy(playerPos)
        this.lastGhostCollisionPos.copy(ghostPos)

        if (!best || !Number.isFinite(best.distance)) return

        const penetration =
            CAR_COLLISION_RADIUS * 2 - best.distance
        if (penetration <= 0) {
            if (penetration < -0.15) this.carContactActive = false
            return
        }
        const newContact = !this.carContactActive
        const intentionalBump = this.ghostBumpPhase !== 'idle'
        if (intentionalBump) this.endGhostBump()

        // Contact normal: ghost -> player on the ground plane. Degenerate
        // (exact centre overlap) falls back to the lateral axis.
        let normal = {
            x: best.px - best.gx,
            z: best.pz - best.gz,
        }
        let normalLen = Math.hypot(normal.x, normal.z)
        if (normalLen < 1e-6) {
            normal = {
                x: ghostFrame.lateral.x,
                z: ghostFrame.lateral.z,
            }
            normalLen = Math.hypot(normal.x, normal.z) || 1
        }
        normal = { x: normal.x / normalLen, z: normal.z / normalLen }

        // --- Positional separation (every frame, no cooldown) ---
        const playerShare = penetration * 0.65
        const ghostShare = penetration * 0.35
        playerPos.x += normal.x * playerShare
        playerPos.z += normal.z * playerShare
        this.pushGhostByWorldVector(
            { x: -normal.x * ghostShare, z: -normal.z * ghostShare },
            ghostFrame
        )

        // --- Velocity kick (only when closing, with cooldown) ---
        const tangent = ghostFrameToTangent(ghostFrame)
        const lateral = ghostFrameToLateral(ghostFrame)
        const ghostVel = {
            x: tangent.x * this.ghostSpeed + lateral.x * this.ghostLateralVelocity,
            z: tangent.z * this.ghostSpeed + lateral.z * this.ghostLateralVelocity,
        }
        const relX = player.velocity.x - ghostVel.x
        const relZ = player.velocity.z - ghostVel.z
        const closing = -(relX * normal.x + relZ * normal.z)
        // Determine who is driving into the contact normal BEFORE applying
        // impulses. Common forward motion cancels in closing; side swipes
        // use lateral approach, rear-ends use longitudinal approach.
        const playerApproach = -(player.velocity.x * normal.x + player.velocity.z * normal.z)
        const ghostApproach = ghostVel.x * normal.x + ghostVel.z * normal.z
        const playerInitiated = !intentionalBump && playerApproach > 0 && playerApproach > ghostApproach

        if (
            closing > CAR_COLLISION_MIN_IMPACT &&
            this.carCollisionCooldown <= 0 && newContact
        ) {
            this.carCollisionCooldown = CAR_COLLISION_COOLDOWN
            this.carContactActive = true

            const impulse = Math.min(
                closing * (1 + CAR_COLLISION_RESTITUTION) * 0.5,
                intentionalBump ? GHOST_BUMP_MAX_IMPULSE : CAR_COLLISION_MAX_IMPULSE
            )

            // Player: bounce plus a small pace cost; a modest yaw kick
            // from the sideways component so side hits steer the car.
            player.velocity.x += normal.x * impulse
            player.velocity.z += normal.z * impulse
            const playerDrag =
                1 - (intentionalBump ? GHOST_BUMP_SPEED_LOSS : Math.min(0.06, closing * 0.004))
            player.velocity.multiplyScalar(playerDrag)
            const playerRight = player.rightVector(new THREE.Vector3())
            const sidePush = normal.x * playerRight.x + normal.z * playerRight.z
            const yawKick = THREE.MathUtils.clamp(
                sidePush * closing * 0.02,
                intentionalBump ? -0.08 : -PLAYER_HIT_MAX_YAW_KICK,
                intentionalBump ? 0.08 : PLAYER_HIT_MAX_YAW_KICK
            )
            player.yawRate = THREE.MathUtils.clamp(
                player.yawRate + yawKick,
                -2.5,
                2.5
            )

            // Ghost: equal-and-opposite momentum through its track state,
            // plus a severity-scaled slowdown it then drives out of
            // naturally via the rubber band (overtake opportunity). Never
            // a reset, never a teleport.
            const backX = -normal.x * impulse
            const backZ = -normal.z * impulse
            const ghostSpeedBeforeImpact = this.ghostSpeed
            this.ghostSpeed = THREE.MathUtils.clamp(
                this.ghostSpeed + (backX * tangent.x + backZ * tangent.z),
                0,
                this.ghostMaxSpeed
            )
            this.ghostLateralVelocity = THREE.MathUtils.clamp(
                this.ghostLateralVelocity +
                    (backX * lateral.x + backZ * lateral.z),
                -8,
                8
            )
            if (playerInitiated) {
                // Keep the existing lateral impulse/separation, but absorb
                // forward momentum into bodywork instead of rewarding a ram
                // with extra ghost speed (including during the damage cooldown).
                this.ghostSpeed = Math.min(this.ghostSpeed, ghostSpeedBeforeImpact)
                if (this.ghostPlayerHitCooldown <= 0) {
                    const longitudinal = Math.abs(normal.x * tangent.x + normal.z * tangent.z)
                    const severity = THREE.MathUtils.clamp(
                        closing * 0.012, GHOST_PLAYER_HIT_MIN_LOSS, GHOST_PLAYER_HIT_MAX_LOSS)
                    // A glancing side swipe costs less pace than a direct ram.
                    const loss = severity * (0.7 + 0.3 * longitudinal)
                    this.ghostSpeed = Math.min(this.ghostSpeed, ghostSpeedBeforeImpact * (1 - loss))
                    this.ghostPlayerHitCooldown = GHOST_PLAYER_HIT_COOLDOWN
                    this.ghostHitRecoveryTimer = GHOST_HIT_RECOVERY_DURATION
                }
            } else {
                // Preserve the ghost-initiated bump's existing reciprocal
                // pace cost and controlled response to the player.
                this.ghostSpeed *= THREE.MathUtils.clamp(
                    1 - closing * 0.025, GHOST_HIT_SLOW_MAX, GHOST_HIT_SLOW_MIN)
            }

            // Shoving the player can put it inside a lethal obstacle: the
            // player's own swept check already ran this frame, so test the
            // new position directly and let the EXISTING crash logic fire.
            this.checkShovedPlayerCrash()
        }

        // The ghost world position was derived before the push above;
        // re-seat it from the updated track state immediately.
        this.seatGhostFromTrack()
        player.refreshTelemetry()
        player.speed = player.velocity.dot(player.forwardVector(new THREE.Vector3()))
    }


    // Applies a world-space XZ push to the ghost through its track-frame
    // state (progress + lateral offset), clamped to the road. Small and
    // continuous: never a teleport.
    pushGhostByWorldVector(world, frame = null) {
        const gate = frame ?? this.track.sampleAt(
            THREE.MathUtils.clamp(
                this.ghostPathProgress, 0, this.track.totalLength
            )
        )
        const tangent = ghostFrameToTangent(gate)
        const lateral = ghostFrameToLateral(gate)
        this.ghostPathProgress = Math.max(
            0,
            this.ghostPathProgress +
                (world.x * tangent.x + world.z * tangent.z)
        )
        this.ghostLateralOffset = THREE.MathUtils.clamp(
            this.ghostLateralOffset +
                (world.x * lateral.x + world.z * lateral.z),
            -GHOST_LATERAL_LIMIT,
            GHOST_LATERAL_LIMIT
        )
    }


    // Re-derives the ghost world transform from its track state.
    seatGhostFromTrack() {
        const clamped = Math.min(
            this.ghostPathProgress,
            this.track.totalLength
        )
        this.ghostPathProgress = clamped
        const sample = this.track.sampleAt(clamped)
        this.ghostCar.position.copy(
            this.track.toWorld(
                clamped,
                this.ghostLateralOffset,
                CAR_RIDE_HEIGHT
            )
        )
        this.ghostCar.rotation.y = sample.angle
        seatGhostPitch(this.ghostCar, sample)
    }


    // After contact moves the player, an overlapping lethal obstacle must
    // crash through the normal path (crashAt + onCrash), exactly as if
    // the player had driven there. Contact itself never kills.
    checkShovedPlayerCrash() {
        const player = this.carController
        if (
            !player || !player.canDrive ||
            !player.obstacles || player.obstacles.length === 0
        ) {
            return
        }
        player.refreshTelemetry()
        const s = player.pathProgress
        const hit = checkPlayerObstacleCollision(
            player.obstacles,
            s - 0.6,
            s + 2.0,
            player.lateralOffset
        )
        if (hit) {
            player.crashAt(hit)
        }
    }


    // Legacy compat: now delegates to the shared Track so player and
    // ghost can no longer diverge. Previously this used segment-local
    // angles and returned angle 0 at both endpoints.
    getGhostSample(distance) {
        return this.track.sampleAt(distance)
    }

    checkFinish() {

        const playerProgress =
            this.carController.pathProgress


        const playerFinished =
            playerProgress >=
            this.finishDistance


        const ghostFinished =
            this.ghostPathProgress >=
            this.finishDistance



        // Neither has finished yet

        if (
            !playerFinished &&
            !ghostFinished
        ) {

            return

        }



        // ============================================
        // BOTH CROSS ON SAME FRAME
        // ============================================

        if (
            playerFinished &&
            ghostFinished
        ) {

            if (
            playerProgress >
            this.ghostPathProgress
            ) {

            this.finishRace(
                'player'
            )

            }

            else {

            this.finishRace(
                'ghost'
            )

            }


            return

        }



        // ============================================
        // PLAYER FINISHED
        // ============================================

        if (playerFinished) {

            this.finishRace(
            'player'
            )

            return

        }



        // ============================================
        // GHOST FINISHED
        // ============================================

        if (ghostFinished) {

            this.finishRace(
            'ghost'
            )

        }

    }
    
    finishRace(winner) {

        if (this.raceFinished) {

            return

        }


        this.raceFinished = true
        this.endGhostBump()

        this.winner = winner



        // Stop player car

        this.carController
            .setDrivingEnabled(false)

        // A finish during the disabled window must not leave brakes off
        // for any post-race driving or controller reuse.
        this.carController
            .brakesWorking = true



        // Stop ghost

        this.ghostSpeed = 0



        // Hide brake-cut UI
        this.brakeCutWarningEl.style.display =
            'none'

        this.brakeCutAftermathEl.style.display =
            'none'


        // Hide ghost name UI on ghost win
        if (
            winner === 'ghost' &&
            this.ghostNameUI
        ) {

          this.ghostNameUI.style.display =
            'none'

        }


        // Notify game.js
        if (this.onFinish) {

            this.onFinish(
                winner,
                this.ghostName
            )

        }

        }



  // ============================================
  // CLEANUP
  // ============================================

  dispose() {

    // Never leave the shared car controller brakeless after level teardown.
    if (this.carController) {
      this.carController
        .brakesWorking = true
    }

    if (this.countdownElement) {

      this.countdownElement.remove()

    }

    if (this.brakeCutWarningEl) {

      this.brakeCutWarningEl.remove()

    }

    if (this.brakeCutAftermathEl) {

      this.brakeCutAftermathEl.remove()

    }

    removeGhostNameUI(
      this.ghostNameUI
    )

  }

}


// ============================================
// CAR-COLLISION SEGMENT MATH (module-local)
// ============================================

// Track-frame axes with degenerate guards.
function ghostFrameToTangent(frame) {
  const t = frame?.tangent
  if (t && Number.isFinite(t.x + t.z) && (t.x * t.x + t.z * t.z) > 1e-8) {
    const len = Math.hypot(t.x, t.z)
    return { x: t.x / len, z: t.z / len }
  }
  const angle = frame?.angle ?? 0
  return { x: Math.sin(angle), z: Math.cos(angle) }
}

function ghostFrameToLateral(frame) {
  const l = frame?.lateral
  if (l && Number.isFinite(l.x + l.z) && (l.x * l.x + l.z * l.z) > 1e-8) {
    const len = Math.hypot(l.x, l.z)
    return { x: l.x / len, z: l.z / len }
  }
  const t = ghostFrameToTangent(frame)
  return { x: -t.z, z: t.x }
}

// Closest approach between segments p0->p1 and g0->g1 (2D XZ).
// Returns { distance, px, pz, gx, gz }: the closest points on each
// segment. Parallel/degenerate cases fall back to endpoint checks, so
// the result is always finite for finite inputs.
function closestSegmentApproach(p0, p1, g0, g1) {
  const d1x = p1.x - p0.x
  const d1z = p1.z - p0.z
  const d2x = g1.x - g0.x
  const d2z = g1.z - g0.z
  const rX = p0.x - g0.x
  const rZ = p0.z - g0.z

  const a = d1x * d1x + d1z * d1z
  const e = d2x * d2x + d2z * d2z
  const f = d2x * rX + d2z * rZ

  let s;
  let t;

  if (a < 1e-12 && e < 1e-12) {
    s = 0
    t = 0
  } else if (a < 1e-12) {
    s = 0
    t = Math.min(1, Math.max(0, f / e))
  } else {
    const c = d1x * rX + d1z * rZ
    if (e < 1e-12) {
      t = 0
      s = Math.min(1, Math.max(0, -c / a))
    } else {
      const b = d1x * d2x + d1z * d2z
      const denom = a * e - b * b
      s = denom > 1e-12
        ? Math.min(1, Math.max(0, (b * f - c * e) / denom))
        : 0
      t = (b * s + f) / e
      if (t < 0) {
        t = 0
        s = Math.min(1, Math.max(0, -c / a))
      } else if (t > 1) {
        t = 1
        s = Math.min(1, Math.max(0, (b - c) / a))
      }
    }
  }

  const px = p0.x + d1x * s
  const pz = p0.z + d1z * s
  const gx = g0.x + d2x * t
  const gz = g0.z + d2z * t
  const dx = px - gx
  const dz = pz - gz

  return { distance: Math.hypot(dx, dz), px, pz, gx, gz }
}
