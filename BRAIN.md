# Project Brain: FlightSimTraining

## Purpose
This project is a browser-based 3D flight game inspired by the feel of Getting Over It, but built around a plane climbing as high as possible. The player starts on the ground, flies upward using fuel, passes checkpoints, avoids hazards, and uses upgrades to survive longer and reach greater heights.

## Core Gameplay Loop
- The player controls a plane from the ground upward.
- The plane consumes fuel while flying.
- Red circles on the map provide money or fuel rewards.
- Checkpoints let the player restart from a safe landing zone after a crash.
- Obstacles must be avoided during ascent.
- Landing zones are tied to checkpoints, so each checkpoint acts as a progression and upgrade hub.
- The player can spend money on upgrades and restart from the last checkpoint to continue higher.

## High-Level Architecture
- The game is a static web app using HTML, CSS, and JavaScript.
- 3D rendering is handled with Three.js.
- The main game loop is initialized from src/main.js.
- World setup and scene rendering live in src/World.js.
- Aircraft physics and flight behavior live in src/Airplane.js.
- Checkpoints are implemented with src/Waypoint.js.
- Obstacles and reward objects are defined in src/obstacle.js.
- Upgrades and upgrade definitions are in src/upgrades.js and src/upgradesData.js.
- The in-browser coding sandbox is implemented with src/CodeEditor.js and src/CodeRunner.js.

## Important Game Systems
### 1. Plane and Flight Physics
- The plane is represented by Airplane and uses a custom physics loop.
- It has fuel, ammo, velocity, rotation, and crash handling.
- The plane can be restarted from the current checkpoint state.
- Physics and collision logic are central to gameplay balance.

### 2. Checkpoints and Progression
- Checkpoints are visual cylinder waypoints placed in the world.
- Reaching a checkpoint marks progression and allows the player to restart from the associated landing zone.
- The restart flow resets the airplane and restores the player to a safe state for upgrades and retrying.

### 3. Obstacles and Rewards
- Obstacles are dangerous objects the plane must avoid.
- Some obstacles may also be shootable or reward-based, depending on their configuration.
- Reward items can grant money or other benefits.

### 4. Upgrades
- The upgrade system is modal-driven and uses money as the resource.
- Upgrade categories include engine tuning, ballistics, range, and fuel capacity.
- Upgrades affect plane performance and survivability.

### 5. Coding Sandbox
- The app includes a code editor where the player can write scripts for the plane.
- Code execution runs inside a sandboxed worker.
- The editor includes UI for running code, viewing logs, and timing execution.

## Project Files to Know
- index.html: page shell and UI structure
- style.css: styling for the game UI and panels
- src/main.js: game bootstrap, initialization, upgrade wiring, restart logic, camera setup
- src/World.js: Three.js scene, camera, renderer, sky, and ground
- src/Airplane.js: flight dynamics, collisions, fuel, restart logic, and update loop
- src/Waypoint.js: checkpoint visuals and proximity checks
- src/obstacle.js: obstacle placement, movement, health, and reward behavior
- src/upgrades.js: runtime upgrade state and application logic
- src/upgradesData.js: definitions of available upgrades
- src/CodeEditor.js: editor UI and syntax highlighting
- src/CodeRunner.js: sandboxed code execution worker system
- scripts/: starter code and sample scripts for the editor

## Developer Notes
- This project is lightweight and does not appear to use a build step or package bundler.
- The app is intended to run as a static site in a browser.
- Changes to physics, scoring, checkpoints, or upgrades should preserve the progression feel of the game.
- The code editor sandbox is sensitive; changes should avoid introducing unsafe execution patterns.
- Keep the game loop and UI behavior consistent with the checkpoint-based restart model.

## Suggested Working Style for Agents
- Prefer small, targeted changes over large rewrites.
- Preserve the existing game feel while improving clarity, reliability, or polish.
- When changing gameplay systems, verify that checkpoints, fuel, restart behavior, and upgrades still work together.
- When editing UI or interaction logic, ensure the editor, upgrades modal, and game controls remain coherent.
