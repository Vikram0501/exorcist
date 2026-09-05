export class HighwayRaceController {

  constructor(carController, ghostCar, finishZ) {

    this.carController =
      carController

    this.ghostCar =
      ghostCar

    this.finishZ =
        finishZ

    this.raceFinished = false

    this.winner = null

    this.time = 0

    this.raceStarted = false

    this.finishedCountdown = false

    this.ghostSpeed = 5

    // Normal speed the ghost tries to drive at
    this.ghostCruiseSpeed = 27

    // Slowest it is allowed to drive
    this.ghostMinSpeed = 18

    // Fastest it can drive when catching up
    this.ghostMaxSpeed = 38

    // How quickly it speeds up
    this.ghostAcceleration = 8

    // How quickly it slows down
    this.ghostBraking = 10

    // We want the ghost to usually stay
    // about 8 units ahead of the player
    this.ghostTargetLead = 8


    // Make sure car cannot move initially
    this.carController
      .setDrivingEnabled(false)


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

  }



  // ============================================
  // UPDATE
  // ============================================

    update(dt) {

    // ============================================
    // COUNTDOWN
    // ============================================

    if (!this.finishedCountdown) {

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

        }

    }



    // ============================================
    // GHOST RACING
    // ============================================

    if (
        this.raceStarted &&
        !this.raceFinished
        ) {

        this.updateGhost(dt)

        this.checkFinish()

        }

    }

    updateGhost(dt) {

        // ============================================
        // PLAYER / GHOST POSITIONS
        // ============================================

        const playerCar =
            this.carController.car


        const playerZ =
            playerCar.position.z


        const ghostZ =
            this.ghostCar.position.z



        // ============================================
        // HOW FAR AHEAD IS THE GHOST?
        // ============================================

        // Example:
        //
        // player = -20
        // ghost  = -30
        //
        // lead = 10
        //
        // So the ghost is 10 units ahead.

        const ghostLead =
            playerZ - ghostZ



        // ============================================
        // CALCULATE DESIRED SPEED
        // ============================================

        // We want the ghost to stay roughly
        // ghostTargetLead units ahead.

        const difference =
            this.ghostTargetLead -
            ghostLead


        let desiredSpeed =
            this.ghostCruiseSpeed +
            difference * 0.8



        // Do not let desired speed become ridiculous.

        desiredSpeed =
            Math.max(
            this.ghostMinSpeed,
            Math.min(
                desiredSpeed,
                this.ghostMaxSpeed
            )
            )



        // ============================================
        // SPEED UP OR SLOW DOWN
        // ============================================

        if (
            this.ghostSpeed <
            desiredSpeed
        ) {

            this.ghostSpeed +=
            this.ghostAcceleration * dt

        }

        else if (
            this.ghostSpeed >
            desiredSpeed
        ) {

            this.ghostSpeed -=
            this.ghostBraking * dt

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
        // MOVE GHOST
        // ============================================

        this.ghostCar.position.z -=
            this.ghostSpeed * dt

        }

    checkFinish() {

        const playerCar =
            this.carController.car


        const playerFinished =
            playerCar.position.z <=
            this.finishZ


        const ghostFinished =
            this.ghostCar.position.z <=
            this.finishZ



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

            // Smaller Z means farther down the road.

            if (
            playerCar.position.z <
            this.ghostCar.position.z
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

        this.winner = winner



        // Stop player car

        this.carController
            .setDrivingEnabled(false)



        // Stop ghost

        this.ghostSpeed = 0



        // ============================================
        // SHOW RESULT
        // ============================================

        this.countdownElement.style.display =
            'block'


        this.countdownElement.style.fontSize =
            '60px'



        if (
            winner === 'player'
        ) {

            this.countdownElement.textContent =
            'YOU WON THE RACE'

        }

        else {

            this.countdownElement.textContent =
            'THE GHOST WON'

        }

        }



  // ============================================
  // CLEANUP
  // ============================================

  dispose() {

    if (this.countdownElement) {

      this.countdownElement.remove()

    }

  }

}