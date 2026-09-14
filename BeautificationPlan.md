Here is an implementation plan to further liven up the scene, and make it progressively more vivid as the user scrolls through. The planner did not have an accurate knowledge of what has already been built, so if you see things in this doc that already exists, then feel free to ignore them.


# Implementation Plan — Scroll-Driven 3D Indian Wedding Temple Experience

## 1. Project Goal

Transform the existing Indian temple Blender scene from a static architectural environment into a rich, colorful, cinematic wedding experience.

The website should behave like a continuous walk through the temple. As the user scrolls forward, the temple should progressively transform from a quiet, mostly undecorated building into a fully decorated Indian wedding venue.

The main narrative is:

**Empty temple → preparations begin → flowers and fabrics appear → lamps illuminate → string lights switch on → petals begin falling → ceremony fire is lit → temple reaches full wedding celebration → calm night finale**

The decorative changes should not simply happen as hard cuts. They should feel gradual, spatial, and ceremonial.

The site should prioritize:

* visual richness
* smooth scroll-linked animation
* good performance on modern laptops and phones
* graceful degradation on weaker mobile devices
* reusable effects systems
* modular decorative assets
* low draw-call count
* cinematic lighting
* stable frame pacing

---

# 2. Recommended Technical Stack

Use:

* React
* TypeScript
* Three.js
* React Three Fiber
* `@react-three/drei`
* GSAP
* GSAP ScrollTrigger
* Zustand for experience state
* Blender for modeling and scene preparation
* GLTF / GLB for runtime assets

Optional:

* `@react-three/postprocessing`
* Meshopt compression
* Draco compression where appropriate
* KTX2 / Basis Universal compressed textures
* Vite or Next.js depending on the surrounding wedding website

For this particular experience, prefer React Three Fiber over manually managing a raw Three.js scene because the environment will consist of many independent systems:

* flowers
* lighting
* particles
* fire
* petals
* diyas
* string lights
* fabric
* scene transitions
* scroll choreography

React components will make these easier to isolate and optimize.

---

# 3. Core Architectural Principle

Do not create separate 3D scenes for every stage.

Keep one continuous temple environment loaded and progressively modify it.

The environment should have three logical layers:

## Layer A — Permanent Temple Geometry

This is the existing Blender architecture.

Examples:

* temple walls
* pillars
* arches
* ceilings
* stone flooring
* courtyard
* stairs
* shrines
* mandap structure

These assets remain throughout the experience.

## Layer B — Wedding Decoration

These elements progressively appear.

Examples:

* flower garlands
* banana leaves
* torans
* marigold strings
* jasmine strings
* fabric canopies
* carpets
* ceremonial vessels
* floral arrangements
* rangoli
* wedding mandap decorations
* brass lamps
* string lights
* hanging flower arrangements

## Layer C — Atmospheric Effects

These are rendered and animated in Three.js rather than modeled into the environment.

Examples:

* falling petals
* floating dust
* incense smoke
* fire particles
* sparks
* glowing embers
* light flickering
* diya flames
* floating pollen
* bloom
* fog
* subtle light rays

The three layers must be managed independently.

---

# 4. Blender Scene Preparation

The existing temple scene must be cleaned up before writing extensive front-end effects.

## Scene cleanup

In Blender:

* apply transforms
* remove hidden and unused meshes
* remove duplicate materials
* merge static architectural meshes where practical
* keep meshes separate where selective decoration or animation will occur
* fix normals
* remove unnecessary subdivision
* simplify invisible geometry
* delete internal faces that can never be seen

Use sensible object names.

Examples:

```text
Temple_Main
Floor_Courtyard
Pillar_A_01
Pillar_A_02
Mandap_Base
Mandap_Pillar_01
Temple_Entrance
Arch_Entrance
Shrine_Back
Courtyard_Left
Courtyard_Right
Ceiling_Main
```

Do not use names such as:

```text
Cube.015
Cylinder.073
Plane.004
```

Naming must be deterministic because some front-end effects may anchor themselves to scene objects.

---

# 5. Create Decoration Anchor Points in Blender

This is extremely important.

Do not make the front-end developers manually estimate positions for every garland, lamp, or particle emitter.

Create Blender Empty objects representing anchor positions.

Examples:

```text
ANCHOR_Toran_Entrance
ANCHOR_FlowerGarland_Pillar01
ANCHOR_FlowerGarland_Pillar02
ANCHOR_StringLights_Courtyard
ANCHOR_PetalEmitter_Mandap
ANCHOR_Agni_Center
ANCHOR_Diya_Row_Left
ANCHOR_Diya_Row_Right
ANCHOR_Rangoli_Center
ANCHOR_Incense_Left
ANCHOR_Incense_Right
ANCHOR_Camera_Stop_01
ANCHOR_Camera_Stop_02
```

Export these empties as GLTF nodes.

The runtime code can then search for:

```ts
scene.getObjectByName("ANCHOR_Agni_Center")
```

and attach the fire system directly.

This prevents a huge amount of hardcoded coordinate work.

---

# 6. Create Decoration Zones

Also add invisible Blender meshes or empties representing broad decorative areas.

For example:

```text
ZONE_Entrance
ZONE_Corridor
ZONE_Courtyard
ZONE_Mandap
ZONE_Shrine
ZONE_FinalCourtyard
```

These zones can drive:

* petal spawning
* fog
* light intensity
* sound
* particle density
* decoration reveal
* mobile optimization

---

# 7. Runtime Scene Structure

Suggested React component structure:

```text
<App>
  <WeddingExperience>
    <TempleScene />

    <LightingSystem />

    <DecorationSystem>
      <EntranceDecor />
      <GarlandSystem />
      <FabricSystem />
      <MandapDecor />
      <RangoliSystem />
    </DecorationSystem>

    <LampSystem>
      <DiyaInstances />
      <BrassLampInstances />
      <StringLights />
    </LampSystem>

    <AtmosphereSystem>
      <DustParticles />
      <IncenseSmoke />
      <PetalSystem />
      <FireSystem />
    </AtmosphereSystem>

    <ScrollCamera />
    <PostProcessing />
  </WeddingExperience>
</App>
```

Each system should receive the global scroll progress and/or stage state.

---

# 8. Global Scroll State

Do not scatter raw `window.scrollY` logic throughout the app.

Create a centralized experience state.

Example conceptual state:

```ts
type WeddingStage =
  | "arrival"
  | "preparation"
  | "flowers"
  | "illumination"
  | "mandap"
  | "ceremony"
  | "celebration"
  | "finale";

interface ExperienceState {
  scroll: number;
  stage: WeddingStage;
  stageProgress: number;
}
```

`scroll` ranges from:

```text
0.0 → 1.0
```

Example stage mapping:

```text
0.00–0.10 arrival
0.10–0.25 preparation
0.25–0.40 flowers
0.40–0.55 illumination
0.55–0.70 mandap
0.70–0.82 ceremony
0.82–0.93 celebration
0.93–1.00 finale
```

Avoid using only Boolean thresholds.

Most visual values should interpolate smoothly based on stage progress.

For example:

```ts
flowerOpacity = smoothstep(0.22, 0.32, scroll)
```

rather than:

```ts
flowerVisible = scroll > 0.25
```

---

# 9. Scroll Camera

The camera should move through a predetermined path.

Do not use uncontrolled free movement.

Create a camera spline through the temple.

Two possible implementations:

## Preferred

Use a Catmull-Rom curve containing camera control points.

```ts
const curve = new THREE.CatmullRomCurve3([
  point1,
  point2,
  point3,
  point4,
]);
```

Then:

```ts
camera.position.copy(curve.getPointAt(scroll))
```

Also create a second curve for camera look targets.

This gives a cinematic path while allowing smooth interpolation.

---

# 10. Camera Anchors in Blender

Create empties:

```text
CAM_POS_00
CAM_POS_01
CAM_POS_02
CAM_POS_03

CAM_LOOK_00
CAM_LOOK_01
CAM_LOOK_02
CAM_LOOK_03
```

Read them from the GLTF.

This means the visual designer can change the camera path in Blender without editing front-end code.

---

# 11. Progressive Scene Decoration

This is the core mechanic.

The temple should visibly accumulate decoration as the user progresses.

Decoration should happen in layers.

---

# 12. Stage 1 — Arrival

Visual state:

* temple mostly bare
* warm morning daylight
* very few lamps
* subtle birds or ambient motion
* light floating dust
* minimal flowers

Assets visible:

* base temple
* perhaps two floral torans at entrance
* sparse diyas
* subtle rangoli outline

Effects:

* subtle dust particles
* tiny amounts of smoke
* sun shafts
* birds if budget allows

Lighting:

* directional sunlight
* soft warm ambient light

Mood:

Quiet and anticipatory.

---

# 13. Stage 2 — Preparations Begin

As the user progresses:

* carpets roll out
* decorative fabrics appear
* brass vessels appear
* banana leaves appear
* first flower strings appear on arches
* a few lamps ignite

Animations can use:

* scale
* opacity
* subtle downward reveal
* spline drawing

For decorative geometry, avoid popping assets into existence.

Preferred reveal:

```text
opacity 0 → 1
scale 0.92 → 1
vertical offset +0.15m → 0
```

Duration should overlap with user scroll.

---

# 14. Stage 3 — Flower Transformation

This stage should dramatically change the environment.

Introduce:

* marigold garlands
* jasmine garlands
* roses
* lotus arrangements
* flower torans
* floral pillar wraps
* hanging flower clusters

Use a combination of geometry and instancing.

Do not model thousands of individual flowers.

Instead make approximately:

```text
Marigold cluster A
Marigold cluster B
Jasmine cluster A
Rose cluster
Lotus
Petal
Leaf cluster
Banana leaf
```

Then instance them.

---

# 15. Flower Garland Modeling Strategy

Create reusable garland modules in Blender:

```text
Garland_Short
Garland_Medium
Garland_Long
Garland_UShape
Garland_Drape
FlowerCluster_Marigold
FlowerCluster_Rose
Jasmine_String
```

Use these as building blocks.

Garlands should preferably be low-poly meshes with baked textures.

For distant garlands, consider alpha cards.

---

# 16. Procedural Garland Placement

For repetitive flowers, consider a runtime Curve + InstancedMesh system.

Create a spline.

Sample positions along it:

```ts
curve.getPointAt(t)
```

Place flower instances at each point.

This allows hundreds of flowers using very few draw calls.

Use slight variation in:

* rotation
* scale
* spacing

Example:

```text
scale = 0.9–1.1
rotation = ±15°
spacing = 4–7cm
```

Avoid excessive randomness because Indian wedding decoration often has deliberate symmetry.

---

# 17. Stage 4 — Illumination

This stage should be emotionally striking.

Gradually:

* environment becomes warmer
* brass lamps illuminate
* string lights switch on
* diyas multiply
* temple becomes golden

The lighting transition should feel like sunset.

Suggested progression:

```text
Sunlight intensity decreases slightly
Warm point lights increase
Emissive materials increase
Bloom increases slightly
Sky/environment becomes warmer/darker
```

Do not create hundreds of real-time point lights.

Use emissive materials for most lights.

Reserve true lights for important areas.

---

# 18. String Lights

Create one reusable string-light system.

Each string consists of:

```text
curve
wire geometry
bulb instances
```

Bulbs should use InstancedMesh.

Most bulbs should use emissive materials.

Only a small percentage should generate actual illumination.

Example:

```text
100 visual bulbs
3–5 actual point lights
```

For distant strings:

No point lights at all.

---

# 19. String Light Animation

Each bulb can have a phase offset.

Use shader-based emissive fluctuation:

```text
intensity =
  baseIntensity +
  sin(time * speed + instancePhase) * flickerAmount
```

Keep flicker subtle.

This is not a Christmas light effect.

The lights should mostly remain steady with occasional organic variation.

---

# 20. Diya Candle System

Use instancing.

Create one diya model.

Components:

```text
clay/brass bowl
wick
flame
```

Place hundreds using an InstancedMesh.

For the flame, use either:

* billboard plane
* small shader mesh

Do not create hundreds of particle emitters.

---

# 21. Diya Flame Shader

Use a camera-facing plane.

Texture should contain a flame gradient.

Animate:

```text
UV distortion
vertical scale
horizontal sway
opacity
emissive strength
```

Pseudo behavior:

```text
height oscillation: ±8%
horizontal movement: ±3%
brightness fluctuation: ±10%
```

Each instance receives a random phase.

---

# 22. Diya Lighting

Do not attach a point light to every diya.

Instead:

For each diya cluster:

* use emissive flame
* use one low-intensity warm point light

For example:

```text
20 diya flames
1 point light
```

This creates the illusion that each diya contributes light.

---

# 23. Stage 5 — Mandap Reveal

The mandap should be the visual climax before the ceremony.

As the visitor approaches:

* floral canopy fills in
* draped fabric appears
* garlands cascade from roof
* hanging flowers descend
* lotus arrangements appear
* brass lamps illuminate
* petals accumulate
* mandap central area glows

Use staged reveals.

Example:

```text
0.55 fabric appears
0.58 hanging flowers
0.61 brass lamps
0.64 floor petals
0.67 canopy flowers
```

Do not reveal everything simultaneously.

---

# 24. Fabric Assets

Create several cloth assets in Blender.

Examples:

```text
Fabric_Drape_Long
Fabric_Drape_Short
Fabric_PillarWrap
Fabric_CeilingSwag
Fabric_Backdrop
```

Materials:

* silk
* chiffon
* velvet
* translucent organza

Avoid expensive runtime cloth simulation.

Instead:

Use baked geometry with very subtle vertex animation.

A vertex shader can provide:

```text
sin(position.y + time)
```

to create tiny movement.

---

# 25. Petal Shower System

Petals should appear during the ceremony and celebration.

Use GPU-friendly particles or instanced meshes.

A petal requires:

```text
position
velocity
rotation
rotation velocity
scale
life
phase
```

Spawn petals above the visible space.

Movement:

```text
gravity downward
gentle horizontal wind
sinusoidal flutter
slow tumbling
```

---

# 26. Petal Flutter Model

Do not make petals fall straight.

A convincing movement is:

```text
x += sin(time * 1.3 + phase) * amplitude
z += cos(time * 0.9 + phase) * amplitude
y -= speed
rotation.x += spinX
rotation.z += spinZ
```

Add occasional wind gusts.

---

# 27. Petal Particle Count

Desktop:

```text
500–1500
```

Mobile:

```text
150–500
```

Very weak devices:

```text
50–150
```

Use level-of-detail settings based on performance.

---

# 28. Petal Types

Create approximately six variants.

For example:

```text
red rose
pink rose
yellow marigold
orange marigold
white jasmine
lotus petal
```

Keep geometry extremely light.

Most petals can simply be 2-triangle planes with alpha textures.

---

# 29. Ground Petals

Do not physically simulate accumulated petals.

Instead use decorative ground clusters.

As the ceremony progresses, fade these in.

Example:

```text
PetalPile_01
PetalPile_02
PetalPile_03
```

Or use decals.

This gives the illusion that falling petals are accumulating.

---

# 30. Ceremony Fire / Agni

The wedding fire should be one of the most sophisticated effects.

Build it from multiple layers.

Do not rely on a single flame texture.

Recommended system:

```text
base ember glow
inner flame
outer flame
sparks
smoke
point-light flicker
heat distortion
```

---

# 31. Agni Base

Model a low-poly havan kund.

Create:

* stone/metal basin
* wood logs
* charcoal
* glowing ember geometry

Use emissive material on ember sections.

Animate emissive intensity slightly.

---

# 32. Flame System

Use approximately 8–20 intersecting flame planes.

Each plane:

* faces camera partially
* uses animated procedural noise
* uses alpha blending
* uses emissive output

Separate the flame into:

```text
yellow-white inner flame
orange middle flame
red/orange outer flame
```

Vertex animation should distort the upper portion more strongly than the base.

---

# 33. Flame Shader Behavior

Conceptual fragment inputs:

```text
UV
time
noise
height
```

Pseudo:

```text
noise1 = simplexNoise(uv * 3 + time)
noise2 = simplexNoise(uv * 7 - time * 1.5)

distortion = noise1 * 0.08 + noise2 * 0.03
```

Opacity should taper strongly toward the flame tip.

Color gradient:

```text
bottom: deep orange
middle: yellow
core: pale yellow/white
```

---

# 34. Flame Light

Use one warm point light above the fire.

Animate:

```text
intensity = base + noise(time) * variation
```

Example:

```text
base intensity: 5
variation: ±1
```

Do not use a simple sine wave because repetitive pulsing looks artificial.

Use smooth random noise.

---

# 35. Sparks

Use approximately:

```text
30–100 sparks
```

Particles should:

* rise
* drift
* fade
* occasionally accelerate
* disappear after 1–3 seconds

Color:

```text
orange → yellow → transparent
```

---

# 36. Smoke

Use soft transparent particles.

Large subtle sprites.

Behavior:

```text
rise slowly
expand
fade
curl horizontally
```

Keep density low.

Smoke should be visible primarily when backlit.

Avoid heavy opaque smoke.

---

# 37. Heat Distortion

Optional desktop enhancement.

Render fire area through a distortion shader or refractive plane.

The distortion should be subtle.

Disable on mobile if expensive.

---

# 38. Stage 6 — Ceremony

When the visitor reaches the central ceremony area:

* agni ignites
* diya lights intensify
* petals begin falling
* garlands gently sway
* string lights glow strongly
* golden lighting increases
* camera movement slows
* environmental particles increase
* bloom increases slightly

This should be the emotional peak.

---

# 39. Stage 7 — Celebration

After the ceremony:

* more flower petals
* increased string lights
* brighter colors
* decorative lanterns
* subtle confetti-like petals
* perhaps peacock-feather decorative elements
* stronger music if audio is used

Avoid literal Western confetti.

Use:

* rose petals
* marigold petals
* jasmine
* gold flower fragments

---

# 40. Stage 8 — Night Finale

Transition toward a calm night environment.

Lighting:

```text
deep blue ambience
warm lamps
gold string lights
diyas
moonlight
```

Reduce petal activity.

Increase:

* lamp glow
* subtle stars
* soft haze

Final composition could show the full decorated temple glowing behind the wedding message.

---

# 41. Rangoli

Rangoli can be implemented using:

* textured planes
* decals
* SVG-generated textures

Create multiple versions.

Example progression:

```text
outline
partial color
complete rangoli
flower petals added
diyas added around perimeter
```

Blend these using opacity based on scroll.

A shader mask could gradually reveal the rangoli radially.

---

# 42. Incense Smoke

Add incense stands to selected locations.

Use small smoke emitters.

Smoke particles should:

```text
rise
curve
expand
fade
```

Add procedural curl noise.

Approximately:

```text
10–30 particles per incense source
```

Do not use full fluid simulation.

---

# 43. Temple Bells

Bells can add small motion.

Use one of:

```text
simple pendulum rotation
subtle spring animation
scroll-triggered swing
```

When the user crosses the entrance threshold:

```text
bell swings
sound plays once
```

Keep motion understated.

---

# 44. Leaves and Plants

Add:

* banana leaves
* mango leaves
* potted plants
* lotus
* palm leaves

Animate using vertex shaders.

Simple approach:

```text
leaf displacement =
sin(time + position.y * frequency) * amplitude
```

Do not animate each leaf independently in JavaScript.

---

# 45. Decorative Animals

Optional, depending on art direction.

Potential assets:

* peacock
* elephant sculpture
* parrots
* butterflies

Prefer:

* sculptures
* subtle looping animations
* silhouettes

Avoid turning the site into a wildlife scene.

A single peacock in a courtyard may be much more effective than many animated animals.

---

# 46. Lighting Architecture

Do not rely entirely on Blender-baked lighting.

Use a hybrid approach.

## Static Lighting

Bake ambient visual richness into:

* AO
* lightmaps
* material textures

## Runtime Lighting

Use approximately:

```text
1 directional light
1 hemisphere/environment light
2–6 major point lights
several localized low-cost lights
emissive decorative materials
```

Keep real-time shadow-casting lights extremely limited.

---

# 47. Shadows

Only important lights should cast shadows.

Likely:

```text
main sunlight
main mandap light
possibly ceremony fire
```

Diyas and string lights should not cast real-time shadows individually.

---

# 48. Postprocessing

Use sparingly.

Recommended:

* Bloom
* SMAA / anti-aliasing
* subtle vignette
* very mild color grading

Optional:

* depth of field during hero compositions
* god rays
* chromatic aberration only if extremely subtle

Avoid excessive bloom.

The temple should not look like neon.

---

# 49. Bloom Strategy

Bloom should affect only genuinely bright materials.

Use emissive intensity > 1 for:

* flames
* string lights
* diyas
* glowing lamps

Keep bright stone and fabric below the bloom threshold.

---

# 50. Material Strategy

Use physically-based materials.

Keep texture resolution sensible.

Typical:

```text
major architecture: 2K
hero decorative elements: 1K–2K
small props: 512–1K
particles: 128–512
```

Avoid dozens of unique 4K textures.

---

# 51. Texture Compression

Export textures to KTX2/Basis where possible.

Preferred formats:

```text
Base color → KTX2
Normal → KTX2
Roughness → KTX2
AO → KTX2
```

Combine roughness, metallic, and AO into channels where appropriate.

---

# 52. Geometry Compression

Use:

* Meshopt
* Draco where beneficial

Meshopt is generally preferable for runtime decoding performance.

---

# 53. Repeated Props

Use instancing for:

* diyas
* flowers
* petals
* brass lamps
* string light bulbs
* leaves
* floor candles
* hanging ornaments

Never create hundreds of separate React mesh components when one InstancedMesh will work.

---

# 54. Level of Detail

Create multiple quality levels.

## High

Desktop GPU:

* 1000+ petals
* dynamic shadows
* fire heat distortion
* full bloom
* animated plants
* smoke
* high-resolution textures

## Medium

Laptop/mobile:

* 300–600 petals
* reduced shadows
* simplified smoke
* no heat distortion

## Low

Weak phones:

* 50–200 petals
* static flower garlands
* minimal particles
* few shadows
* reduced resolution
* simplified fire

---

# 55. Device Performance Detection

Use:

* device pixel ratio
* viewport dimensions
* WebGL capabilities
* frame rate sampling

Do not render at full DPR on high-density phones.

Example cap:

```ts
dpr={[1, 1.75]}
```

---

# 56. Progressive Asset Loading

Do not load every wedding decoration immediately.

Split GLBs by zone.

Example:

```text
temple-core.glb
entrance-decor.glb
courtyard-decor.glb
mandap-decor.glb
ceremony-props.glb
finale-decor.glb
```

Load later sections while the visitor is in earlier ones.

---

# 57. Asset Budget

Suggested total target:

Desktop:

```text
30–70 MB compressed
```

Mobile:

```text
15–35 MB compressed
```

Initial payload should ideally remain below:

```text
8–15 MB
```

Load the remainder progressively.

---

# 58. Color Palette

Suggested base colors:

```text
Temple Stone
warm sandstone
cream
terracotta

Wedding Colors
saffron
turmeric yellow
marigold orange
deep crimson
burgundy
magenta
emerald
peacock blue
antique gold

Night
deep indigo
navy
warm amber
gold
```

The environment should become more saturated as the wedding progresses.

---

# 59. Models to Build

The Blender artist should create the following asset library.

## Flowers

```text
Marigold flower
Marigold cluster
Rose
Rose cluster
Jasmine cluster
Lotus
Lotus bud
Loose petal
Floral bouquet
Floral hanging ball
```

## Garlands

```text
Short marigold garland
Long marigold garland
Jasmine string
Mixed floral garland
U-shaped garland
Door toran
Pillar wrap
Ceiling hanging flower strands
```

## Plants

```text
Banana leaf
Banana plant
Mango leaf toran
Palm leaf
Lotus leaves
Small ceremonial plants
```

## Lamps

```text
Clay diya
Small brass diya
Tall brass deepam
Hanging brass lamp
Five-flame lamp
Temple floor lamp
```

## Wedding Props

```text
Havan kund
Wood logs
Kalash
Coconut
Brass plate
Flower baskets
Ceremonial bowls
Incense holder
Conch shell
Wedding stool
Decorative umbrella
```

## Textiles

```text
Long fabric drape
Ceiling swag
Pillar wrap
Curtain panel
Mandap backdrop
Decorative carpet
```

## Architectural Decoration

```text
Decorative toran
Hanging bells
Small lantern
Brass chains
Decorative panels
Wedding signage frame
```

## Optional

```text
Peacock
Elephant statue
Parrot
Butterflies
Wedding musicians silhouettes
```

---

# 60. Which Assets Should Be Real Geometry?

Use real 3D models for:

* objects the camera gets close to
* diyas
* brass lamps
* torans
* major flower arrangements
* havan kund
* fabrics
* foreground plants
* hero garlands

Use billboard planes or cards for:

* tiny distant flower clusters
* distant petals
* smoke
* sparks
* distant foliage

---

# 61. Animation Priority

Focus engineering effort in this order:

1. camera experience
2. progressive decoration
3. lighting transition
4. diya system
5. string lights
6. fire
7. petals
8. atmospheric particles
9. subtle foliage/fabric movement
10. optional animals

Do not begin with complex butterflies, peacocks, or secondary effects.

The temple transformation itself must be convincing first.

---

# 62. Scroll Animation Philosophy

Every major stage should have three phases:

```text
anticipation
transformation
settled state
```

For example, flower decoration:

```text
0.20–0.23
a few flowers appear

0.23–0.32
major flower decorations animate in

0.32–0.40
environment remains decorated while camera passes
```

This makes the environment feel designed rather than mechanically tied to scroll.

---

# 63. Avoid Overly Literal Scroll Mapping

Do not make every animation perfectly reversible at all times.

For example:

If the user scrolls backward slightly, petals should not instantly fly upward.

Some events can become stateful.

Example:

```text
Once ceremony fire has ignited,
keep it burning unless the user scrolls far back.
```

Similarly:

```text
once most lights are turned on,
small reverse scroll movements should not toggle them repeatedly.
```

Use hysteresis or stage state.

---

# 64. Stage Controller

Build one central controller.

Conceptual API:

```ts
useWeddingStage()
```

returns:

```ts
{
  stage,
  scroll,
  stageProgress,
  transitions: {
    flowers,
    lights,
    mandap,
    ceremony,
    finale
  }
}
```

Every subsystem reads from this state.

---

# 65. Decoration Transition Values

Expose normalized transitions:

```ts
const flowers = smoothstep(0.20, 0.38, scroll)
const lights = smoothstep(0.38, 0.55, scroll)
const mandap = smoothstep(0.52, 0.70, scroll)
const ceremony = smoothstep(0.68, 0.83, scroll)
const finale = smoothstep(0.88, 1.0, scroll)
```

Then use these everywhere.

For example:

```ts
garlandMaterial.opacity = flowers
```

or:

```ts
light.intensity = lights * 4
```

---

# 66. Audio

Optional but highly recommended.

Use subtle environmental sound.

Possible layers:

```text
birds
temple ambience
bells
wind
shehnai
flute
tabla
crowd murmur
fire crackle
```

Audio volume can also depend on zone.

Example:

```text
entrance → birds
corridor → bells
mandap → shehnai
ceremony → fire crackle
```

Do not autoplay loud music.

Provide a mute control.

---

# 67. Sound Interaction

A useful approach:

Sound should trigger from entering zones rather than from exact scroll values.

Example:

```text
ZONE_Entrance
trigger bell once

ZONE_Mandap
fade in shehnai

ZONE_Ceremony
fade in fire
```

---

# 68. HTML Content Integration

The wedding website still needs readable content.

Use regular HTML overlays synchronized with the 3D scene.

Examples:

```text
Welcome
Bride & Groom
Our Story
Families
Wedding Events
Venue
RSVP
```

Do not render large paragraphs as 3D text.

Use HTML.

---

# 69. Text and Scene Choreography

Each section should have a visual focus.

Example:

```text
Welcome
camera approaches temple entrance

Our Story
camera enters floral courtyard

Wedding Events
camera crosses lamp corridor

Family
camera passes portrait alcoves

Ceremony
camera reaches mandap

RSVP
camera pulls back to illuminated temple
```

---

# 70. Accessibility

Provide:

* reduced-motion mode
* semantic HTML
* keyboard navigation
* readable text contrast
* skip 3D experience button

Respect:

```css
prefers-reduced-motion
```

Reduced motion should:

* reduce camera movement
* eliminate petal showers
* eliminate strong parallax
* disable rapid lighting changes

---

# 71. Fallback Experience

If WebGL fails:

Show:

* pre-rendered temple images
* standard scrolling wedding site
* subtle CSS decorations

The website must remain functional without the 3D scene.

---

# 72. Blender Workflow for Decorations

Create one master file:

```text
temple_master.blend
```

Collections:

```text
ARCHITECTURE
DECOR_ENTRANCE
DECOR_FLOWERS
DECOR_LIGHTS
DECOR_MANDAP
DECOR_CEREMONY
DECOR_FINALE
ANCHORS
CAMERA_PATH
```

This makes exports easy.

---

# 73. Export Convention

Export collections individually.

Example:

```text
temple_core.glb
decor_entrance.glb
decor_flowers.glb
decor_lights.glb
decor_mandap.glb
decor_ceremony.glb
```

Maintain consistent world coordinates so that all GLBs align automatically.

---

# 74. Important Blender Constraint

Do not arbitrarily apply different origins or move exported collections to `(0,0,0)`.

Everything must stay in the shared temple coordinate system.

This allows assets exported separately to align when loaded.

---

# 75. Debug Mode

Create a developer debug UI.

Use something like Leva.

Expose:

```text
scroll progress
stage
camera position
camera FOV
petal count
fire intensity
bloom intensity
string light intensity
sunlight
ambient light
fog density
```

Also add:

```text
Jump to Arrival
Jump to Flowers
Jump to Mandap
Jump to Ceremony
Jump to Finale
```

This will make visual iteration dramatically faster.

---

# 76. Anchor Debugging

Provide a debug option to display Blender anchors.

Example:

```text
red sphere = effect anchor
green sphere = decoration anchor
blue sphere = camera anchor
```

This prevents developers from guessing where invisible anchor points exist.

---

# 77. Frame Budget

Target:

Desktop:

```text
60 fps
```

Mid-range mobile:

```text
30–60 fps
```

Avoid frame spikes.

Major danger areas:

* transparent particles
* too many materials
* excessive point lights
* too many draw calls
* high DPR
* excessive shadow maps

---

# 78. Draw Call Goal

Ideally keep visible scene around:

```text
100–250 draw calls
```

Avoid exceeding:

```text
400–500
```

on mobile.

Instancing is critical.

---

# 79. Transparency Warning

Flowers, petals, fire, smoke, and fabrics can create excessive transparency overdraw.

Limit overlapping alpha planes.

Use:

```text
alphaTest
```

instead of full blending where possible.

Use blending only when necessary.

---

# 80. Milestone 1 — Temple Optimization

Deliverables:

* cleaned Blender scene
* deterministic naming
* GLB export
* camera anchors
* effect anchors
* zones
* optimized textures

No decorative animation yet.

---

# 81. Milestone 2 — Scroll Camera

Deliverables:

* camera follows temple route
* smooth scroll
* look targets
* section mapping
* HTML sections synchronized

At this point the user should already feel like they are walking through the temple.

---

# 82. Milestone 3 — Base Decoration

Add:

* carpets
* fabrics
* torans
* flower garlands
* plants
* brass props

Implement progressive reveal.

---

# 83. Milestone 4 — Lighting

Add:

* sunset transition
* string lights
* brass lamps
* diyas
* emissive materials
* bloom

This milestone should make the environment feel significantly more alive.

---

# 84. Milestone 5 — Ceremony Effects

Add:

* havan fire
* smoke
* embers
* sparks
* petals
* intensified mandap lighting

This is the main spectacle milestone.

---

# 85. Milestone 6 — Atmosphere

Add:

* incense
* leaf movement
* fabric movement
* subtle dust
* flower sway
* tiny environmental motion

---

# 86. Milestone 7 — Finale

Add:

* night lighting
* complete temple illumination
* final petal sequence
* wedding invitation message
* RSVP transition

---

# 87. Milestone 8 — Optimization

Profile:

* CPU
* GPU
* textures
* draw calls
* GPU memory
* shader compilation
* initial load
* mobile responsiveness

Implement adaptive quality.

---

# 88. Visual Reference Principle

The target should not be:

```text
video-game temple
```

or:

```text
photorealistic archaeological reconstruction
```

The target should feel like:

```text
luxury Indian wedding editorial
+
cinematic temple environment
+
storybook magical realism
```

Materials and lighting should therefore favor:

* warm glow
* saturated flowers
* soft movement
* polished brass
* rich fabrics
* atmospheric depth
* ceremonial symmetry

---

# 89. Most Important Creative Rule

The user should constantly see evidence that the wedding is approaching.

Something should evolve approximately every 5–10% of scroll.

Examples:

```text
first flowers
first carpets
first diyas
more garlands
fabric decorations
string lights
mandap flowers
petals
agni
night illumination
```

Avoid long stretches in which only the camera moves.

---

# 90. Hero Moment

The single biggest visual moment should occur approximately 70–80% through the experience.

Suggested sequence:

```text
camera approaches mandap
↓
surrounding lamps ignite
↓
flower canopy becomes visible
↓
petals begin falling
↓
agni ignites
↓
string lights glow brighter
↓
camera eases toward the ceremony
```

This should be the strongest visual payoff on the website.

---

# 91. Final Moment

At the end:

The camera exits or pulls upward/backward enough to reveal the temple fully transformed.

Show:

```text
flowers everywhere
lit mandap
hundreds of diyas
string lights
deep blue evening sky
soft floating petals
golden windows
```

Then display:

```text
Together with our families,
we invite you to celebrate with us.
```

followed by RSVP.

---

# 92. Recommended First Engineering Task

Before building more decorative assets, implement a proof-of-concept containing only:

```text
existing temple
camera path
10 garlands
20 diyas
1 string-light strand
1 petal emitter
1 havan fire
```

Use the scroll timeline to reveal these progressively.

If the transformation feels convincing with this small set, scale the asset library afterward.

Do not create 100 decorative models before validating the visual choreography.

---

# 93. Definition of Done

The experience is successful when:

1. The initial temple feels calm rather than visually empty.
2. Scroll feels like physical movement through a real environment.
3. Decorations accumulate naturally.
4. No major decorative asset visibly pops into existence.
5. Flowers and fabrics add strong Indian wedding color.
6. Diyas visibly warm the environment without requiring hundreds of lights.
7. String lights feel rich without destroying performance.
8. The havan fire is visually convincing from close range.
9. Petals move naturally and do not look like snow.
10. The final temple looks dramatically more festive than the opening.
11. The experience remains smooth on mid-range phones.
12. The wedding information remains readable and accessible.
13. The environment supports the story instead of distracting from it.

The final effect should feel as though the visitor has walked through an Indian temple while it progressively transforms around them into the wedding itself.
