# The Vale House — Level 1 Game Brief

## Project Direction

**Genre:** First-person paranormal horror / investigation  
**Player Role:** Exorcist  
**Engine / Tech:** Three.js  
**Art Pipeline:** Blender assets imported into Three.js  
**Level Type:** Single haunted-house investigation  
**Target Feel:** Slow-burn paranormal horror that escalates into intense supernatural danger

---

## Core Concept

The player is an **exorcist** sent to investigate an abandoned rural house where repeated paranormal activity has been reported.

The case initially appears to involve the ghost of a missing teenage girl, **Evelyn Vale**.

As the player investigates the house, they discover that Evelyn died inside the property and has remained trapped there ever since.

However, Evelyn is **not responsible for everything happening in the house**.

Another human-looking spirit — older, more violent, and connected to the property before the Vale family lived there — is also present.

The player must uncover Evelyn's story, identify what is keeping her spirit trapped, survive the increasingly hostile haunting, and perform an exorcism that releases her.

The level ends with Evelyn successfully released while revealing that the second presence is still inside the house.

---

## Horror Direction

The game should be frightening without relying on demonic or satanic imagery.

### Horror Can Include

- Ghosts and apparitions
- Human-shaped paranormal entities
- Bloody or injured ghost appearances
- Blood stains
- Bloody handprints
- Disturbing death imagery
- Scratches and signs of confinement
- Old chains and restraints
- A blood-filled bathtub hallucination
- Corpses or corpse-like ghost appearances
- Violent paranormal activity
- Doors slamming
- Furniture moving
- Objects falling
- Lights flickering or breaking
- Footsteps
- Whispering
- Screaming
- Reflections behaving incorrectly
- Figures appearing through windows
- Ghosts standing at the end of hallways
- Environmental changes when the player looks away
- Short scripted chases

### Avoid

- Satanic symbols
- Pentagrams
- Demon worship
- Hell imagery
- Demonic possession as the central story
- Satanic rituals
- Sacrificial altars
- Goat skull / devil imagery
- Overly occult-looking environments

The supernatural should feel like a **haunting involving dead people**, not a battle against demons.

---

## Player Fantasy

The player should feel like a professional exorcist entering a real paranormal case.

They are not simply hunting a monster.

Their job is to:

1. Enter the property.
2. Observe paranormal activity.
3. Investigate the history of the house.
4. Identify the spirit.
5. Determine how the person died.
6. Discover what is keeping the spirit attached to the property.
7. Distinguish between different paranormal entities.
8. Prepare the correct exorcism.
9. Survive the final manifestation.
10. Release the spirit.

Investigation should directly affect the final exorcism.

---

## Main Story

The house once belonged to the **Vale family**:

- Daniel Vale — father
- Margaret Vale — mother
- Evelyn Vale — daughter

Margaret became ill and died. After her funeral, young Evelyn began saying that
"the man from the barn" was walking through the house at night. Daniel assumed
she was grieving and invented the story to get attention.

The activity escalated: food appeared spoiled overnight, the telephone rang with
no caller, and heavy footsteps crossed the upstairs hall. Daniel began to fear
Evelyn instead of protecting her. He shut her in the small upstairs annex beside
her bedroom, believing isolation would stop the disturbances.

Evelyn scratched messages into the annex wall: the man was real, he was angry,
and he wanted the house back. During one final violent night, Daniel abandoned
the house. Evelyn died trapped in the annex.

Daniel secretly buried her behind the barn in an unmarked child-sized grave,
hid her music box among the barn's old possessions, and told police that she
ran away. The house was abandoned soon after.

Decades later, Evelyn remains tied to the house and her music box. She wants the
exorcist to find her grave and tell the truth; the other presence wants those
facts to stay buried.

---

## Main Twist

There are **two paranormal presences**.

### Evelyn

Evelyn is frightening to look at because she appears as she did around the time of her death.

She may appear:

- Pale
- Dirty
- Injured
- Bloody
- Frightened
- Silent

However, she is usually trying to help the player.

Her paranormal activity tends to:

- Lead the player toward evidence
- Reveal memories
- Move personal belongings
- Write messages
- Open important doors
- Warn the player

### The Other Presence

The second ghost is **Elias Wren**, a tall human figure connected to the property
before the Vale family lived there. He was the estate caretaker and died in an
old barn accident; no record says where he was buried. He treats every family
who lives here as an intruder. His incomplete history is the unresolved hook for
the next case.

It should still clearly look like a **dead human**, not a demon.

Its activity is different.

It:

- Watches the player
- Appears outside windows
- Stands near the road
- Creates heavy footsteps
- Throws or moves objects
- Mimics voices
- Causes violent paranormal events
- Chases the player
- Appears to frighten Evelyn herself

The player's major realization is:

> Evelyn is haunting the house, but Evelyn is also afraid of something inside it.

---

## The Spirit Anchor

Evelyn is attached to a **music box** that belonged to her mother.

Margaret gave it to Evelyn when she was young.

After Margaret died, Evelyn used the music box for comfort.

Evelyn had it with her shortly before her death. Daniel later hid it in the
barn with the belongings he could not bring himself to destroy.

The strong emotional connection caused the object to become a paranormal anchor.

No ritual deliberately bound Evelyn to it.

The exorcist must eventually use the music box during the final rite to release her.

---

## Core Gameplay Loop

The level should repeatedly cycle through:

**Explore → Find Evidence → Trigger Paranormal Event → Reinterpret the House → Unlock New Area → Escalate**

The player should rarely be collecting keys simply because a door is locked.

Progression should usually happen because the player has discovered something important or triggered a paranormal response.

Examples:

- Inspecting the family photograph and funeral programme causes footsteps upstairs.
- Hearing the kitchen telephone directs the player to Evelyn's bedroom.
- Reading Evelyn's diary opens the annex door beside her bedroom.
- Investigating the bathroom mirror reveals that the man is connected to the barn.
- Finding Daniel's confession in the large upstairs room reveals the grave site.
- Taking the music box from the barn begins the return chase.
- Completing the investigation allows the grave-side exorcism to begin.

---

## Level Progression

The intended broad flow is:

1. Front yard → front porch: newspaper
2. Entrance room: enter the house
3. Dining room: Vale family photograph and Margaret's funeral programme
4. Kitchen: impossible telephone call / figure at the window
5. Upstairs hall: footsteps and first Evelyn glimpse
6. Child's bedroom: diary and music-box melody
7. Small upstairs annex: scratches, restraint and Evelyn's final message
8. Bathroom: mirror message points to the barn
9. Large upstairs room: Daniel's confession and a map to the grave
10. Downstairs / backyard → barn: recover the music box and learn the older spirit's name
11. Cemetery / grave plot: find Evelyn's unmarked grave
12. Chase back through the yard → grave-side exorcism → front-yard ending

The player may have some freedom within sections, especially upstairs, but the overall escalation remains controlled.

---

## Room-by-Room Gameplay Contract

This is the level's implementation order. Each room introduces one story fact,
one interaction, and one paranormal response; no room is a filler stop.

| Space | Story / player action | Required prop(s) | Paranormal payoff |
| --- | --- | --- | --- |
| Front porch | Read the missing-person newspaper. | Newspaper (complete) | A knock from inside invites the player in. |
| Entrance room | Cross the threshold and orient in the house. | Optional coat stand / lamp | Front door shuts or the lamp flickers behind the player. |
| Entrance / dining room | Learn the Vale family existed and Margaret died. | `Frame1` (Vale family photo), funeral programme | The kitchen telephone begins ringing. |
| Kitchen | Hear Evelyn's distress and see the threat for the first time. | `Phone`, window curtain | Answering it directs the player upstairs. |
| Child's bedroom | Learn Evelyn knew the man was real. | Bed, diary, small toys | A music-box melody comes from the annex. |
| Small upstairs annex | Confirm Evelyn was imprisoned here. | Child's blanket, restraint/chain, wall scratches | Evelyn's warning opens the bathroom objective. |
| Bathroom | Receive the direction to the barn. | Mirror | “BARN” appears in condensation. |
| Large upstairs room | Learn Daniel buried Evelyn and locate the grave. | Desk/table, confession letter, hand-drawn yard map | The room darkens; Elias appears in the doorway. |
| Barn | Recover the anchor and identify the older spirit. | Music box, old caretaker record / ledger | The barn door shuts; chase begins. |
| Cemetery / grave plot | Confirm Evelyn's burial and perform the release. | One unmarked child grave, optional Vale marker, rite items | Final manifestation and exorcism. |

### Asset Ownership

The environment artist supplies the listed GLB props as separate, clearly named
objects. The game implementation handles placement, interaction prompts, UI,
audio, lights, visibility, animations, triggers, ghost appearances, objectives,
the chase, and the exorcism logic.

Use these object names where possible: `Frame1`,
`Funeral_Programme_Margaret`, `Phone`, `Diary_Evelyn`,
`Blanket_Annex`, `Restraint_Annex`, `Mirror_Bathroom`,
`Letter_Daniel_Confession`, `Map_Grave_Site`, `MusicBox_Evelyn`,
`Ledger_Elias_Wren`, and `Grave_Evelyn_Unmarked`.

---

## Horror Escalation

### Stage 1 — Curiosity

- Newspaper identifies Evelyn and the lie that she ran away.
- A light or knock draws the player from the entrance room to the dining room.
- The family photograph shows Margaret, Daniel and Evelyn before the haunting.

### Stage 2 — Unease

- The kitchen telephone rings; only static and a frightened child can be heard.
- A tall figure is visible outside the kitchen window, then gone.
- Heavy footsteps cross the upstairs hall after the call ends.

### Stage 3 — Apparitions

- Evelyn appears briefly at the top of the stairs, then leads the player to her bedroom.
- Her diary says that a man watches from the barn and that her father will not listen.
- Her music-box melody plays from behind the annex door.

### Stage 4 — Communication

- The annex contains scratches, a child's blanket and Evelyn's warning: "HE IS NOT MOTHER."
- The bathroom mirror writes: "BARN."
- Daniel's confession in the large upstairs room admits he buried Evelyn behind it.

### Stage 5 — Threat

- The house reacts violently once the player knows the truth.
- The older ghost becomes visible in doorways and throws or moves objects.
- Evelyn's manifestations become protective rather than threatening.

### Stage 6 — Chase

- In the barn, the player finds Evelyn's music box and a record naming the former caretaker, Elias Wren.
- The music box reveals the route to the small cemetery / grave plot.
- Evelyn's unmarked grave confirms Daniel's confession.

### Stage 7 — Full Haunting

- Recovering the music box makes Elias openly hostile.
- The player escapes the barn and crosses the yard to the grave while doors, lights and objects interfere.
- Elias appears closer every time the player looks away.

### Stage 8 — Exorcism

- The player places Evelyn's photograph, music box and exorcist equipment at her grave.
- They identify Evelyn, her death and Daniel's responsibility while keeping the rite intact.
- Evelyn manifests, Elias tries to interrupt, and Evelyn is released.

### Stage 9 — Final Sting

- The yard becomes quiet and Evelyn's grave is no longer disturbed.
- As the player leaves, Elias appears in the large upstairs window.
- Evelyn's case is closed; the older spirit remains.

---

## Exorcism Gameplay

The final exorcism should use information discovered during the investigation.

Before beginning, the player should know:

- The spirit's name
- What happened to the spirit
- Who was responsible
- What object anchors the spirit

The player prepares a simple exorcism using objects such as:

- Holy water
- Candles
- Cross or other appropriate religious item
- Exorcist's journal
- Evelyn's photograph
- Evelyn's music box

The final sequence should be interactive.

Possible actions:

- Place objects in correct locations
- Read Evelyn's name from the journal
- Identify how she died
- Keep candles lit
- Use holy water
- Continue the rite while the grave site reacts
- Open the music box during the final stage

The exorcism should look like a **religious / spiritual rite performed by an exorcist**, not an occult ritual.

---

## Current Environment Constraint

The existing house model can be used as the main architectural shell.

The current built-in furniture should **not be relied on for gameplay** because it is part of a large combined / messy mesh.

Where possible:

- Keep the house architecture.
- Hide or remove existing furniture that interferes with gameplay.
- Replace important furniture with individual Blender objects.
- Use separate meshes for anything that needs interaction or movement.

---

## Modular Furniture Requirement

Important gameplay furniture should be separate assets.

Examples:

- Chairs
- Dining table
- Beds
- Wardrobes
- Dressers
- Desks
- Side tables
- Cabinets
- Bookshelves
- Lamps
- Picture frames
- Mirrors
- Curtains
- Doors where possible
- Music box
- Tape recorder
- Boxes
- Religious items
- Small clutter props

Separate objects allow Three.js to:

- Move them
- Rotate them
- Hide or show them
- Swap them
- Trigger physics-like animations
- Use them as interaction targets
- Change rooms during paranormal events

---

## Technical Horror Philosophy

The game should get as much horror as possible from **simple scripted events** instead of complicated simulation.

A scary event can often be:

1. Player enters trigger.
2. Sound plays somewhere behind them.
3. Light state changes.
4. Object rotates or moves.
5. Ghost becomes visible.
6. Player turns toward ghost.
7. Ghost disappears.

This is ideal for the Blender + Three.js setup.

The second ghost does not need advanced AI for most of the level.

Most appearances can be scripted.

Even the chase can primarily use:

- Predetermined spawn points
- Short movement paths
- Teleporting when outside the camera view
- Door triggers
- Sound triggers
- Timed environmental obstacles

---

## Environmental Interaction Priorities

Not every object needs interaction.

Focus on objects that contribute to either the investigation or horror.

### High Priority

- Doors
- Drawers containing evidence
- Photographs
- Notes
- Diaries
- Tape recorder
- Music box
- Mirrors
- Lights
- Important chairs
- Curtains
- Exorcism equipment

### Medium Priority

- Cabinets
- Books
- Small containers
- Bathroom taps
- Windows
- Fireplace objects

### Low Priority

Pure decoration that never changes or contributes to the investigation.

---

## Design Rule

Every major paranormal event should achieve at least one of these:

1. Scare the player.
2. Reveal story information.
3. Guide the player somewhere.
4. Change the meaning of a previously visited location.
5. Increase the perceived danger.
6. Establish the difference between Evelyn and the second ghost.

The level should avoid becoming:

**Find Key → Open Door → Jumpscare → Find Another Key → Monster Chase**

Instead, the **haunting itself should drive progression**.

---

## Scope Goal

Level 1 should feel like one complete paranormal case.

The player begins knowing almost nothing.

By the end they should understand:

- Who Evelyn was.
- Why her father imprisoned her.
- How she died.
- Why she remained in the house.
- What the music box means.
- That Evelyn was not the only ghost.
- That the second presence existed before the Vale family.

Evelyn's case is resolved.

The mystery of the second ghost becomes the hook for future levels.

---

## Immediate Development Priority

Before adding detailed gameplay scripting:

1. Clean up the usable house shell.
2. Decide which existing furniture can be hidden or removed.
3. Identify every room available in the current house.
4. Replace major furniture with individual Blender assets.
5. Establish the player's basic walking and flashlight system.
6. Establish interactable-object support.
7. Establish simple trigger volumes.
8. Establish ghost spawn / disappear events.
9. Establish door and light animation systems.
10. Build the level room-by-room rather than furnishing the entire house at once.

The first playable milestone should be:

**Front Yard → Porch → Entrance Room → Dining Room → Upstairs Footsteps**

That small section should establish the visual quality, interaction system, lighting style, audio style, and paranormal-event system before the rest of the house is built.
