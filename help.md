## How to play
- Use the keyboard to steer and throttle the airplane.
- The fuel bar shows your remaining fuel.
- Collect fuel pickups to refill your tank.
- Reach checkpoints and land safely to earn rewards.

### Key Controls
- W / S: pitch the nose up and down
- A / D: roll the airplane left and right
- Q / E: yaw left and right
- Space: increase throttle
- R: shoot


## If you want some challenge:

### Code an autopilot
- On the right side you can write code for the plane and run it
- The code is in Javascript programming language
- You are able to use the available API methods, and read the "info" variable which describe the plane sensors output
- Try to run the demo code

### Available API Methods
- setAileronLeft(angle): adjust the left aileron input
- setAileronRight(angle): adjust the right aileron input
- setElevatorLeft(angle): adjust the left elevator input
- setElevatorRight(angle): adjust the right elevator input
- setFlaps(angle): adjust the flap input
- setSteeringWheel(angle): adjust the steering wheel input
- setThrottle(value): adjust the throttle level (value range is from 0 to 1)
- shoot(): fire a projectile from the airplane
for any angle input, the value range is from -16 to 16 degrees

### Built-in Script Helpers
- log(...args): send messages to the console output panel.
- sleep(ms): wait for a number of milliseconds before continuing.
- finish(): stop the running script.
- startLoop(callback, ms): run a callback repeatedly on a timer.
- stopLoop(): stop the repeated loop created by startLoop.
- time: a number that tracks how long the current script has been running in seconds.
- info: the latest live snapshot of the plane state that your script can read.

### Accessing Live Plane Info
- Use info.airplane.position, info.airplane.rotation, info.airplane.velocity, and info.airplane.controls to read the current airplane state.
- Example: info.airplane.position.x gives the current X position of the plane.

## Tips
- Keep an eye on your fuel level during long flights.
- Use the upgrades menu to improve performance over time.
- Restart anytime if you want to try a new route.




