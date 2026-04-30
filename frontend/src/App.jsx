import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { io } from "socket.io-client";
import "./App.css";

const BACKEND_URL = "https://ai-driven-traffic-management-system.onrender.com";
const MAX_CARS = 56;
const MIN_GAP = 3.5;
const BOUNDS = 55;
const STOP_LINE = 6;
const ROAD_WIDTH = 16;
const LANE_CENTER_OFFSET = 3.6;
const TURN_LANE_OFFSET = LANE_CENTER_OFFSET * 2;

const DIRECTION_TO_AXIS = {
  north: "z",
  south: "z",
  east: "x",
  west: "x",
};

const DIRECTION_TO_SIGN = {
  north: 1,
  south: -1,
  east: 1,
  west: -1,
};

const SPAWN_POINTS = {
  north: { x: LANE_CENTER_OFFSET, z: -45, rotY: 0 },
  south: { x: -LANE_CENTER_OFFSET, z: 45, rotY: Math.PI },
  east: { x: -45, z: -LANE_CENTER_OFFSET, rotY: Math.PI / 2 },
  west: { x: 45, z: LANE_CENTER_OFFSET, rotY: -Math.PI / 2 },
};

const DIRECTIONS = ["north", "south", "east", "west"];
const CAR_COLORS = [0xff3b30, 0x007aff, 0xffcc00, 0x34c759, 0xaf52de, 0xff9500];
const SPAWN_MIN_MS = 1000;
const SPAWN_MAX_MS = 2000;
const SLOW_ZONE_DISTANCE = 15;
const ACCELERATION = 8.5;
const DECELERATION = 12.5;
const SPAWN_GAP = 10;
const STOP_LINE_HOLD_GAP = 0.25;
const QUEUE_MIN_VISIBLE_GAP = 1.0;
const QUEUE_MAX_VISIBLE_GAP = 2.0;
const QUEUE_SLOWDOWN_BUFFER = 8.5;
const BASE_GREEN_SECONDS = 8;
const PER_CAR_GREEN_SECONDS = 1.2;
const MIN_GREEN_SECONDS = 10;
const MAX_GREEN_SECONDS = 30;
const SIGNAL_CYCLE_ORDER = ["north", "south", "east", "west"];
const PEDESTRIAN_WALK_MS = 10000;
const VEHICLE_CROSSWALK_STOP_ABS = 10.2;
const PEDESTRIAN_MIN_SPAWN_MS = 2000;
const PEDESTRIAN_MAX_SPAWN_MS = 5000;
const MAX_PEDESTRIANS = 32;
const PEDESTRIAN_COLORS = [0xff6b6b, 0x4ecdc4, 0xffd166, 0x5e60ce, 0x06d6a0, 0xf3722c];
const PEDESTRIAN_PHASE_SPEED_MULTIPLIER = 3.0;
const AMBULANCE_SPAWN_PROBABILITY = 0.05;
const EMERGENCY_ALL_RED_MS = 1000;
const EMERGENCY_STALE_TIMEOUT_MS = 20000;
const SPEED_UNIT_SCALE = 3.6;
const SPEED_ALERT_THRESHOLD_KMH = 52;
const SPEED_DISPLAY_SMOOTHING = 4.5;
const SPEED_BOARD_REFRESH_MS = 90;
const normalizeActiveSignal = (signal, fallback = "north") => {
  if (DIRECTIONS.includes(signal)) return signal;
  if (signal === "NS") return "north";
  if (signal === "EW") return "east";
  return fallback;
};

const DETECTION_PANEL_CONFIG = {
  north: {
    lineColor: 0xff4d4f,
    cameraPosition: new THREE.Vector3(0, 13, 22),
    cameraLookAt: new THREE.Vector3(0, 0, 4),
  },
  south: {
    lineColor: 0xff6b6b,
    cameraPosition: new THREE.Vector3(0, 13, 22),
    cameraLookAt: new THREE.Vector3(0, 0, 4),
  },
  east: {
    lineColor: 0xff7a45,
    cameraPosition: new THREE.Vector3(0, 13, 22),
    cameraLookAt: new THREE.Vector3(0, 0, 4),
  },
  west: {
    lineColor: 0xff3d00,
    cameraPosition: new THREE.Vector3(0, 13, 22),
    cameraLookAt: new THREE.Vector3(0, 0, 4),
  },
};

const createDemoVehicleMesh = (type, color) => {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: color || 0xff0000,
    emissive: color || 0xff0000,
    emissiveIntensity: 0.15,
    roughness: 0.4,
    metalness: 0.3,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.85,
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.95 });

  if (type === "car") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 4.2), bodyMaterial);
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 2.0), bodyMaterial);
    cab.position.set(0, 1.15, -0.2);
    cab.castShadow = true;
    group.add(cab);

    const frontWin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.05), glassMaterial);
    frontWin.position.set(0, 1.15, 0.8);
    group.add(frontWin);

    const backWin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.05), glassMaterial);
    backWin.position.set(0, 1.15, -1.2);
    group.add(backWin);
  } else if (type === "bus") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 8.2), bodyMaterial);
    body.position.y = 1.45;
    body.castShadow = true;
    group.add(body);

    const winSideL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 7.8), glassMaterial);
    winSideL.position.set(1.3, 1.7, 0);
    group.add(winSideL);

    const winSideR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 7.8), glassMaterial);
    winSideR.position.set(-1.3, 1.7, 0);
    group.add(winSideR);

    const winFront = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.05), glassMaterial);
    winFront.position.set(0, 1.7, 4.1);
    group.add(winFront);
  } else if (type === "bicycle") {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 2.3),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7, metalness: 0.25 })
    );
    frame.position.set(0, 0.58, 0);
    frame.castShadow = true;
    group.add(frame);

    const riderBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.16), bodyMaterial);
    riderBody.position.set(0, 1.06, -0.1);
    riderBody.castShadow = true;
    group.add(riderBody);
  } else {
    const bikeBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.35, 1.9),
      new THREE.MeshStandardMaterial({ color: color || 0xef4444, roughness: 0.45, metalness: 0.35 })
    );
    bikeBody.position.set(0, 0.65, 0.05);
    bikeBody.castShadow = true;
    group.add(bikeBody);

    const riderBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.45, 0.18), bodyMaterial);
    riderBody.position.set(0, 1.05, -0.02);
    riderBody.rotation.x = -0.22;
    riderBody.castShadow = true;
    group.add(riderBody);
  }

  const wheelRadius = type === "bicycle" ? 0.33 : type === "motorbike" ? 0.36 : 0.42;
  const wheelThickness = type === "bicycle" ? 0.12 : type === "motorbike" ? 0.18 : 0.35;
  const wheelGeom = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 16);
  wheelGeom.rotateZ(Math.PI / 2);
  const wheelPos =
    type === "bus"
      ? [[-1.2, wheelRadius, 3], [1.2, wheelRadius, 3], [-1.2, wheelRadius, -3], [1.2, wheelRadius, -3]]
      : type === "bicycle" || type === "motorbike"
        ? [[0, wheelRadius, 0.88], [0, wheelRadius, -0.88]]
        : [[-1.0, wheelRadius, 1.4], [1.0, wheelRadius, 1.4], [-1.0, wheelRadius, -1.4], [1.0, wheelRadius, -1.4]];

  wheelPos.forEach((pos) => {
    const wheel = new THREE.Mesh(wheelGeom, wheelMaterial);
    wheel.position.set(...pos);
    wheel.castShadow = true;
    group.add(wheel);
  });

  return group;
};

const createLabelSprite = (text) => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(8, 12, 20, 0.85)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(130, 233, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  ctx.fillStyle = "#d7f9ff";
  ctx.font = "600 22px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.2, 1.2, 1);
  return sprite;
};

function DetectionDemoPanel({ direction }) {
  const panelMountRef = useRef(null);
  const [vehicleCount, setVehicleCount] = useState(0);

  useEffect(() => {
    const mountNode = panelMountRef.current;
    if (!mountNode) return undefined;

    const config = DETECTION_PANEL_CONFIG[direction] || DETECTION_PANEL_CONFIG.north;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x11161f);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
    camera.position.copy(config.cameraPosition);
    camera.lookAt(config.cameraLookAt);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountNode.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 1.1);
    directional.position.set(20, 30, 18);
    directional.castShadow = true;
    directional.shadow.mapSize.set(1024, 1024);
    scene.add(directional);

    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 90),
      new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 0.95, metalness: 0.08 })
    );
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.y = -0.02;
    scene.add(shoulder);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 90),
      new THREE.MeshStandardMaterial({ color: 0x252a33, roughness: 0.9, metalness: 0.1 })
    );
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    scene.add(road);

    for (let z = -40; z <= 40; z += 8) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.02, 3.8),
        new THREE.MeshStandardMaterial({ color: 0xdfe5ef, roughness: 0.7, metalness: 0.08 })
      );
      stripe.position.set(0, 0.02, z);
      scene.add(stripe);
    }

    const detectionLineZ = 5;
    const detectionLine = new THREE.Mesh(
      new THREE.BoxGeometry(13, 0.06, 0.24),
      new THREE.MeshStandardMaterial({
        color: config.lineColor,
        emissive: config.lineColor,
        emissiveIntensity: 0.65,
      })
    );
    detectionLine.position.set(0, 0.05, detectionLineZ);
    scene.add(detectionLine);

    const vehicles = [];
    const lanes = [-3.1, 0, 3.1];
    const palette = [0xff3b30, 0x007aff, 0xffcc00, 0x34c759, 0xaf52de, 0xff9500];
    const labels = {
      car: "car",
      bus: "bus",
      bicycle: "bike",
      motorbike: "bike",
    };
    const spawnTypes = ["car", "car", "bus", "bicycle", "motorbike"];
    let spawnTimerId = 0;
    const clock = new THREE.Clock();
    let rafId = 0;

    const resizeRenderer = () => {
      const width = mountNode.clientWidth || 320;
      const height = mountNode.clientHeight || 220;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const spawnVehicle = () => {
      const type = spawnTypes[Math.floor(Math.random() * spawnTypes.length)];
      const color = palette[Math.floor(Math.random() * palette.length)];
      const mesh = createDemoVehicleMesh(type, color);
      mesh.position.set(lanes[Math.floor(Math.random() * lanes.length)], 0, -42);
      mesh.lookAt(new THREE.Vector3(mesh.position.x, 0, -35));
      mesh.castShadow = true;

      const box = new THREE.BoxHelper(mesh, 0x4de2ff);
      const label = createLabelSprite(labels[type] || "car");
      label.position.set(mesh.position.x, 4.2, mesh.position.z);
      scene.add(mesh);
      scene.add(box);
      scene.add(label);

      vehicles.push({
        mesh,
        box,
        label,
        speed: 7 + Math.random() * 6,
        counted: false,
        prevZ: mesh.position.z,
      });
    };

    const scheduleSpawn = () => {
      spawnVehicle();
      const delay = 700 + Math.random() * 1100;
      spawnTimerId = window.setTimeout(scheduleSpawn, delay);
    };

    const animatePanel = () => {
      rafId = requestAnimationFrame(animatePanel);
      const dt = Math.min(clock.getDelta(), 0.045);
      for (let i = vehicles.length - 1; i >= 0; i -= 1) {
        const vehicle = vehicles[i];
        vehicle.prevZ = vehicle.mesh.position.z;
        vehicle.mesh.position.z += vehicle.speed * dt;
        vehicle.mesh.lookAt(new THREE.Vector3(vehicle.mesh.position.x, 0, vehicle.mesh.position.z + 3));
        vehicle.box.update();
        vehicle.label.position.set(vehicle.mesh.position.x, 4.2, vehicle.mesh.position.z);

        if (!vehicle.counted && vehicle.prevZ < detectionLineZ && vehicle.mesh.position.z >= detectionLineZ) {
          vehicle.counted = true;
          setVehicleCount((prev) => prev + 1);
        }

        if (vehicle.mesh.position.z > 48) {
          scene.remove(vehicle.mesh);
          scene.remove(vehicle.box);
          scene.remove(vehicle.label);
          if (vehicle.label.material?.map) vehicle.label.material.map.dispose();
          if (vehicle.label.material) vehicle.label.material.dispose();
          vehicles.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    };

    resizeRenderer();
    scheduleSpawn();
    animatePanel();
    window.addEventListener("resize", resizeRenderer);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(spawnTimerId);
      window.removeEventListener("resize", resizeRenderer);
      vehicles.forEach((vehicle) => {
        scene.remove(vehicle.mesh);
        scene.remove(vehicle.box);
        scene.remove(vehicle.label);
        if (vehicle.label.material?.map) vehicle.label.material.map.dispose();
        if (vehicle.label.material) vehicle.label.material.dispose();
      });
      if (mountNode && renderer.domElement.parentElement === mountNode) {
        mountNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [direction]);

  return (
    <article className="detectionPanel">
      <header className="detectionPanelHeader">
        <h3>{direction.charAt(0).toUpperCase() + direction.slice(1)}</h3>
        <span>Vehicle Count: {vehicleCount}</span>
      </header>
      <div ref={panelMountRef} className="detectionPanelCanvas" />
    </article>
  );
}

function App() {
  const mountRef = useRef(null);
  const activeSignalRef = useRef("north");
  const desiredSignalRef = useRef("north");
  const previousSignalRef = useRef("north");
  const signalPhaseRef = useRef("GREEN");
  const signalTransitionStartRef = useRef(-1);
  const carsRef = useRef([]);
  const intersectionCarsRef = useRef([]); // Maintain list of cars inside the intersection
  const intersectionEmptySinceRef = useRef(null);
  const spawnTimersRef = useRef({});
  const pedestrianSpawnTimersRef = useRef([]);
  const lastSignalChangeRef = useRef(0);
  const carIdRef = useRef(0);
  const pedestrianIdRef = useRef(0);
  const cycleIndexRef = useRef(0);
  const greenDurationMsRef = useRef(MIN_GREEN_SECONDS * 1000);
  const pedestriansRef = useRef([]);
  const isPedestrianCrossingRef = useRef(false);
  const pedestrianSignalRef = useRef("DONT_WALK");
  const pedestrianPhaseStartRef = useRef(-1);
  const pedestrianPhaseActiveRef = useRef(false);
  const pedestrianPhaseDebugRef = useRef(false);
  const completedVehicleDirectionsRef = useRef(0);
  const completedDirectionSetRef = useRef(new Set());
  const speedBoardsRef = useRef({});
  const emergencyActiveRef = useRef(false);
  const emergencyDirectionRef = useRef(null);
  const emergencyResumeDirectionRef = useRef(null);
  const emergencyAmbulanceIdRef = useRef(null);
  const emergencyActivatedAtRef = useRef(-1);
  const [remainingTime, setRemainingTime] = useState(MIN_GREEN_SECONDS);
  const [trafficData, setTrafficData] = useState({
    north: 0,
    south: 0,
    east: 0,
    west: 0,
    activeSignal: "north",
    phase: "GREEN",
    carsInIntersection: 0,
    emergencyActive: false,
    emergencyDirection: "-",
  });

  useEffect(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20252e);
    scene.fog = new THREE.Fog(0x20252e, 80, 160);

    const mountNode = mountRef.current;
    const mountWidth = mountNode?.clientWidth || window.innerWidth;
    const mountHeight = mountNode?.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(58, mountWidth / mountHeight, 0.1, 1000);
    camera.position.set(13, 17, 22);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountWidth, mountHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    mountNode.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 1.45);
    directional.position.set(35, 60, 25);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    directional.shadow.camera.near = 1;
    directional.shadow.camera.far = 180;
    directional.shadow.camera.left = -60;
    directional.shadow.camera.right = 60;
    directional.shadow.camera.top = 60;
    directional.shadow.camera.bottom = -60;
    scene.add(directional);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0x2f3642, roughness: 0.95, metalness: 0.05 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2228,
      roughness: 0.9,
      metalness: 0.08,
    });
    const markingMaterial = new THREE.MeshStandardMaterial({
      color: 0xf3f4f8,
      roughness: 0.7,
      metalness: 0.1,
      emissive: 0x2f2f2f,
      emissiveIntensity: 0.15,
    });

    const roadEW = new THREE.Mesh(new THREE.PlaneGeometry(90, ROAD_WIDTH), roadMaterial);
    roadEW.rotation.x = -Math.PI / 2;
    roadEW.position.y = 0.03;
    roadEW.receiveShadow = true;
    scene.add(roadEW);

    const roadNS = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, 90), roadMaterial);
    roadNS.rotation.x = -Math.PI / 2;
    roadNS.position.y = 0.035;
    roadNS.receiveShadow = true;
    scene.add(roadNS);

    // Environment
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x2d4c36, roughness: 1 });

    const createEnvironment = () => {
      const size = 120;
      const roadWidth = ROAD_WIDTH;
      const cornerSize = (size - roadWidth) / 2;
      const cornerGeom = new THREE.PlaneGeometry(cornerSize, cornerSize);
      
      const corners = [
        { x: -(roadWidth/2 + cornerSize/2), z: -(roadWidth/2 + cornerSize/2) },
        { x: (roadWidth/2 + cornerSize/2), z: -(roadWidth/2 + cornerSize/2) },
        { x: -(roadWidth/2 + cornerSize/2), z: (roadWidth/2 + cornerSize/2) },
        { x: (roadWidth/2 + cornerSize/2), z: (roadWidth/2 + cornerSize/2) },
      ];

      corners.forEach((pos, idx) => {
        const grass = new THREE.Mesh(cornerGeom, grassMaterial);
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(pos.x, 0.01, pos.z);
        grass.receiveShadow = true;
        scene.add(grass);

        // Simple building on each corner
        const bWidth = cornerSize * 0.5;
        const bHeight = 15 + idx * 5;
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(bWidth, bHeight, bWidth),
          new THREE.MeshStandardMaterial({ color: 0x3a404d, roughness: 0.7 })
        );
        // Offset buildings from the road
        const offsetX = pos.x > 0 ? 10 : -10;
        const offsetZ = pos.z > 0 ? 10 : -10;
        building.position.set(pos.x + offsetX, bHeight / 2, pos.z + offsetZ);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
      });
    };
    createEnvironment();

    // Continuous raised concrete medians on all four approaches with a symmetric
    // intersection opening so turning paths remain clear.
    const medianMaterial = new THREE.MeshStandardMaterial({
      color: 0xc9ced6,
      roughness: 0.86,
      metalness: 0.06,
    });
    const medianTopMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8dde3,
      roughness: 0.72,
      metalness: 0.05,
    });
    const medianHeight = 0.36;
    const medianWidth = 0.9;
    const intersectionOpening = 22; // clean turning gap centered at the intersection
    const roadHalfLength = 45;
    const medianHalfLength = (roadHalfLength * 2 - intersectionOpening) / 2;
    const medianCenterOffset = intersectionOpening / 2 + medianHalfLength / 2;
    const medianY = 0.03 + medianHeight / 2;

    const medianSegments = [
      // North arm (toward -Z) and south arm (toward +Z)
      { x: 0, z: -medianCenterOffset, width: medianWidth, depth: medianHalfLength },
      { x: 0, z: medianCenterOffset, width: medianWidth, depth: medianHalfLength },
      // West arm (toward -X) and east arm (toward +X)
      { x: -medianCenterOffset, z: 0, width: medianHalfLength, depth: medianWidth },
      { x: medianCenterOffset, z: 0, width: medianHalfLength, depth: medianWidth },
    ];

    medianSegments.forEach((segment) => {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(segment.width, medianHeight, segment.depth),
        medianMaterial
      );
      base.position.set(segment.x, medianY, segment.z);
      base.castShadow = true;
      base.receiveShadow = true;
      scene.add(base);

      const topCap = new THREE.Mesh(
        new THREE.BoxGeometry(segment.width * 0.8, 0.06, segment.depth * 0.95),
        medianTopMaterial
      );
      topCap.position.set(segment.x, medianY + medianHeight / 2 + 0.03, segment.z);
      topCap.castShadow = true;
      topCap.receiveShadow = true;
      scene.add(topCap);
    });

    const stopMarkings = [
      { x: 0, z: -STOP_LINE, width: 10, depth: 0.3 },
      { x: 0, z: STOP_LINE, width: 10, depth: 0.3 },
      { x: -STOP_LINE, z: 0, width: 0.3, depth: 10 },
      { x: STOP_LINE, z: 0, width: 0.3, depth: 10 },
    ];

    stopMarkings.forEach((marking) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(marking.width, 0.08, marking.depth), markingMaterial);
      mesh.position.set(marking.x, 0.1, marking.z);
      mesh.receiveShadow = true;
      scene.add(mesh);
    });

    const crosswalkMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f7fb,
      roughness: 0.6,
      metalness: 0.08,
      emissive: 0x1f2430,
      emissiveIntensity: 0.08,
    });
    const createCrosswalk = (isHorizontal, centerX, centerZ) => {
      for (let i = -5; i <= 5; i += 1) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(isHorizontal ? 1.0 : 0.55, 0.03, isHorizontal ? 0.55 : 1.0),
          crosswalkMaterial
        );
        if (isHorizontal) {
          stripe.position.set(centerX + i * 1.05, 0.11, centerZ);
        } else {
          stripe.position.set(centerX, 0.11, centerZ + i * 1.05);
        }
        stripe.receiveShadow = true;
        scene.add(stripe);
      }
    };
    createCrosswalk(true, 0, -9);
    createCrosswalk(true, 0, 9);
    createCrosswalk(false, -9, 0);
    createCrosswalk(false, 9, 0);

    const pedestrianRoutes = [
      { side: "west", axis: "x", start: new THREE.Vector3(-8.8, 0, -9), end: new THREE.Vector3(8.8, 0, -9) },
      { side: "west", axis: "x", start: new THREE.Vector3(-8.8, 0, 9), end: new THREE.Vector3(8.8, 0, 9) },
      { side: "east", axis: "x", start: new THREE.Vector3(8.8, 0, -9), end: new THREE.Vector3(-8.8, 0, -9) },
      { side: "east", axis: "x", start: new THREE.Vector3(8.8, 0, 9), end: new THREE.Vector3(-8.8, 0, 9) },
      { side: "north", axis: "z", start: new THREE.Vector3(-9, 0, -8.8), end: new THREE.Vector3(-9, 0, 8.8) },
      { side: "north", axis: "z", start: new THREE.Vector3(9, 0, -8.8), end: new THREE.Vector3(9, 0, 8.8) },
      { side: "south", axis: "z", start: new THREE.Vector3(-9, 0, 8.8), end: new THREE.Vector3(-9, 0, -8.8) },
      { side: "south", axis: "z", start: new THREE.Vector3(9, 0, 8.8), end: new THREE.Vector3(9, 0, -8.8) },
    ];
    const pedestrianSides = ["north", "south", "east", "west"];

    const createSignalHead = () => {
      const group = new THREE.Group();
      
      // Vertical Pole
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 7, 12),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.4 })
      );
      pole.position.y = 3.5;
      pole.castShadow = true;
      group.add(pole);

      // Horizontal Arm
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.15, 4.5),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.4 })
      );
      arm.position.set(0, 6.5, 2.25);
      arm.castShadow = true;
      group.add(arm);

      const headGroup = new THREE.Group();
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(1, 2.8, 1),
        new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7, metalness: 0.3 })
      );
      housing.castShadow = true;
      headGroup.add(housing);

      const createBulb = (color, y) => {
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 16, 16),
          new THREE.MeshStandardMaterial({
            color,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.35,
            metalness: 0.2,
          })
        );
        bulb.position.set(0, y, 0.51);
        bulb.castShadow = true;
        headGroup.add(bulb);
        return bulb;
      };

      const red = createBulb(0xff2b2b, 0.8);
      const yellow = createBulb(0xffd60a, 0);
      const green = createBulb(0x25d366, -0.8);

      headGroup.position.set(0, 6.5, 4.5);
      group.add(headGroup);

      return {
        group,
        pole,
        red,
        yellow,
        green,
      };
    };

    const createMountedCctv = () => {
      const mountGroup = new THREE.Group();
      const whiteHousingMaterial = new THREE.MeshStandardMaterial({
        color: 0xf4f7fb,
        emissive: 0x101820,
        emissiveIntensity: 0.04,
        roughness: 0.28,
        metalness: 0.28,
      });
      const whiteMountMaterial = new THREE.MeshStandardMaterial({
        color: 0xe9eef5,
        emissive: 0x0f1724,
        emissiveIntensity: 0.03,
        roughness: 0.24,
        metalness: 0.4,
      });

      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.7),
        whiteMountMaterial
      );
      arm.position.z = 0.35;
      arm.castShadow = true;
      arm.receiveShadow = true;
      mountGroup.add(arm);

      const support = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10),
        whiteMountMaterial
      );
      support.rotation.z = Math.PI / 4;
      support.position.set(0, -0.08, 0.12);
      support.castShadow = true;
      support.receiveShadow = true;
      mountGroup.add(support);

      const cameraBodyGroup = new THREE.Group();
      cameraBodyGroup.position.z = 0.78;
      mountGroup.add(cameraBodyGroup);

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.32, 0.88),
        whiteHousingMaterial
      );
      body.castShadow = true;
      body.receiveShadow = true;
      cameraBodyGroup.add(body);

      const hood = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.12, 0.36),
        new THREE.MeshStandardMaterial({
          color: 0xf8fbff,
          emissive: 0x0e1622,
          emissiveIntensity: 0.03,
          roughness: 0.22,
          metalness: 0.3,
        })
      );
      hood.position.set(0, 0.17, 0.26);
      hood.castShadow = true;
      hood.receiveShadow = true;
      cameraBodyGroup.add(hood);

      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.1, 16),
        new THREE.MeshStandardMaterial({
          color: 0x05070a,
          emissive: 0x111827,
          emissiveIntensity: 0.24,
          roughness: 0.2,
          metalness: 0.86,
        })
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, -0.01, 0.49);
      lens.castShadow = true;
      cameraBodyGroup.add(lens);

      const statusLed = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 10, 10),
        new THREE.MeshStandardMaterial({
          color: 0xff4d4d,
          emissive: 0xff1f1f,
          emissiveIntensity: 1.25,
          roughness: 0.18,
          metalness: 0.1,
        })
      );
      statusLed.position.set(0.16, 0.07, 0.42);
      cameraBodyGroup.add(statusLed);

      return mountGroup;
    };
    const drawSpeedBoardDisplay = (board, valueLabel, isAlert) => {
      const { ctx, canvas, texture } = board;
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#081016";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#23374f";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, width - 6, height - 6);

      ctx.font = "700 24px Arial";
      ctx.textAlign = "center";
      ctx.fillStyle = "#c7d2fe";
      ctx.fillText("SPEED", width / 2, 30);

      const mainColor = isAlert ? "#ff5f5f" : "#86efac";
      ctx.shadowColor = isAlert ? "#ff3b3b" : "#4ade80";
      ctx.shadowBlur = 20;
      ctx.font = "700 52px Arial";
      ctx.fillStyle = mainColor;
      ctx.fillText(valueLabel, width / 2, 88);
      ctx.shadowBlur = 0;

      ctx.font = "600 18px Arial";
      ctx.fillStyle = "#d1fae5";
      ctx.fillText("km/h", width / 2, 115);

      texture.needsUpdate = true;
    };
    const createSpeedBoard = () => {
      const boardGroup = new THREE.Group();

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.2, 4.8, 12),
        new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.58, metalness: 0.6 })
      );
      pole.position.y = 2.4;
      pole.castShadow = true;
      boardGroup.add(pole);

      const panelFrame = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 1.9, 0.22),
        new THREE.MeshStandardMaterial({ color: 0x1c1f25, roughness: 0.52, metalness: 0.45 })
      );
      panelFrame.position.set(0, 5.1, 0);
      panelFrame.castShadow = true;
      boardGroup.add(panelFrame);

      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 1.45),
        new THREE.MeshStandardMaterial({
          map: texture,
          emissive: 0x0b1d14,
          emissiveIntensity: 0.7,
          roughness: 0.35,
          metalness: 0.15,
          side: THREE.DoubleSide,
        })
      );
      screen.position.set(0, 5.1, 0.125);
      boardGroup.add(screen);

      const board = {
        group: boardGroup,
        canvas,
        ctx,
        texture,
        displayedSpeed: 0,
        lastText: "",
        lastAlert: false,
        lastRoundedSpeed: -1,
        lastRenderAt: 0,
      };
      drawSpeedBoardDisplay(board, "--", false);
      board.lastText = "--";
      return board;
    };

    const signalHeads = {
      north: createSignalHead(),
      south: createSignalHead(),
      east: createSignalHead(),
      west: createSignalHead(),
    };

    // Reposition signals with poles
    signalHeads.north.group.position.set(-8.5, 0, -8.5);
    signalHeads.south.group.position.set(8.5, 0, 8.5);
    signalHeads.east.group.position.set(-8.5, 0, 8.5);
    signalHeads.west.group.position.set(8.5, 0, -8.5);

    signalHeads.north.group.rotation.y = Math.PI;
    signalHeads.south.group.rotation.y = 0;
    signalHeads.east.group.rotation.y = -Math.PI / 2;
    signalHeads.west.group.rotation.y = Math.PI / 2;

    Object.values(signalHeads).forEach((signal) => scene.add(signal.group));

    const cctvHeads = {
      north: createMountedCctv(),
      south: createMountedCctv(),
      east: createMountedCctv(),
      west: createMountedCctv(),
    };

    // Mount each CCTV directly on the pole using local coordinates (no world-position placement).
    cctvHeads.north.position.set(0, 2.7, 0);
    cctvHeads.south.position.set(0, 2.7, 0);
    cctvHeads.east.position.set(0, 2.7, 0);
    cctvHeads.west.position.set(0, 2.7, 0);

    signalHeads.north.pole.add(cctvHeads.north);
    signalHeads.south.pole.add(cctvHeads.south);
    signalHeads.east.pole.add(cctvHeads.east);
    signalHeads.west.pole.add(cctvHeads.west);

    // Orients mounted CCTV units toward the intersection center.
    const cctvLookTarget = new THREE.Vector3(0, 1.6, 0);
    cctvHeads.north.lookAt(cctvLookTarget);
    cctvHeads.south.lookAt(cctvLookTarget);
    cctvHeads.east.lookAt(cctvLookTarget);
    cctvHeads.west.lookAt(cctvLookTarget);

    const speedBoardPlacements = {
      // One board per incoming side, offset to roadside and farther from the center.
      north: {
        x: 10.8,
        z: -24,
        monitorDirection: "north",
        target: new THREE.Vector3(LANE_CENTER_OFFSET, 0, -36),
      },
      south: {
        x: -10.8,
        z: 24,
        monitorDirection: "south",
        target: new THREE.Vector3(-LANE_CENTER_OFFSET, 0, 36),
      },
      east: {
        x: 24,
        z: 10.8,
        monitorDirection: "west",
        target: new THREE.Vector3(36, 0, LANE_CENTER_OFFSET),
      },
      west: {
        x: -24,
        z: -10.8,
        monitorDirection: "east",
        target: new THREE.Vector3(-36, 0, -LANE_CENTER_OFFSET),
      },
    };
    DIRECTIONS.forEach((direction) => {
      const board = createSpeedBoard();
      const placement = speedBoardPlacements[direction];
      board.group.position.set(placement.x, 0, placement.z);
      board.group.lookAt(placement.target);
      board.monitorDirection = placement.monitorDirection;
      scene.add(board.group);
      speedBoardsRef.current[direction] = board;
    });

    const SIGNAL_YELLOW_MS = 1400;
    const SIGNAL_ALL_RED_MS = 900;
    const INTERSECTION_EMPTY_BUFFER_MS = 300;
    const getDirectionCarCount = (direction) =>
      carsRef.current.reduce((count, car) => count + (car.direction === direction ? 1 : 0), 0);
    const calculateGreenDurationMs = (direction) => {
      const carCount = getDirectionCarCount(direction);
      const dynamicSeconds = BASE_GREEN_SECONDS + carCount * PER_CAR_GREEN_SECONDS;
      const clampedSeconds = Math.min(MAX_GREEN_SECONDS, Math.max(MIN_GREEN_SECONDS, dynamicSeconds));
      return Math.round(clampedSeconds * 1000);
    };
    const updateRemainingTime = (now) => {
      const phase = signalPhaseRef.current;
      const elapsed = now - signalTransitionStartRef.current;
      let remainingMs = 0;
      if (phase === "GREEN") remainingMs = greenDurationMsRef.current - elapsed;
      if (phase === "YELLOW") remainingMs = SIGNAL_YELLOW_MS - elapsed;
      if (phase === "EMERGENCY_ALL_RED") remainingMs = EMERGENCY_ALL_RED_MS - elapsed;
      if (phase === "EMERGENCY_GREEN") remainingMs = 999999; // Emergency stays active until cleared
      if (phase === "ALL_RED") {
        if (pedestrianPhaseActiveRef.current && pedestrianPhaseStartRef.current >= 0) {
          remainingMs = PEDESTRIAN_WALK_MS - (now - pedestrianPhaseStartRef.current);
        } else {
          remainingMs = SIGNAL_ALL_RED_MS - elapsed;
        }
      }
      const nextRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
      setRemainingTime((prev) => (prev === nextRemaining ? prev : nextRemaining));
    };

    const getLaneLightState = (direction) => {
      const phase = signalPhaseRef.current;
      const greenDirection = previousSignalRef.current;
      if (phase === "EMERGENCY_GREEN") {
        return direction === emergencyDirectionRef.current ? "GREEN" : "RED";
      }
      if (phase === "GREEN") return direction === greenDirection ? "GREEN" : "RED";
      if (phase === "YELLOW") return direction === greenDirection ? "YELLOW" : "RED";
      // During CLEARING and ALL_RED, all signals remain RED
      return "RED";
    };

    const setSignalLights = () => {
      const setSignalState = (signal, state) => {
        signal.red.material.emissive.setHex(state === "red" ? 0xff1a1a : 0x000000);
        signal.yellow.material.emissive.setHex(state === "yellow" ? 0xffb703 : 0x000000);
        signal.green.material.emissive.setHex(state === "green" ? 0x22c55e : 0x000000);
        signal.red.material.emissiveIntensity = state === "red" ? 1.5 : 0.1;
        signal.yellow.material.emissiveIntensity = state === "yellow" ? 1.5 : 0.06;
        signal.green.material.emissiveIntensity = state === "green" ? 1.5 : 0.1;
      };

      setSignalState(signalHeads.north, getLaneLightState("north").toLowerCase());
      setSignalState(signalHeads.south, getLaneLightState("south").toLowerCase());
      setSignalState(signalHeads.east, getLaneLightState("east").toLowerCase());
      setSignalState(signalHeads.west, getLaneLightState("west").toLowerCase());
    };

    const socket = io(BACKEND_URL, {
      transports: ["websocket"],
    });

    socket.on("traffic:update", (data) => {
      const normalizedSignal = normalizeActiveSignal(data?.activeSignal, activeSignalRef.current);
      const safeActiveSignal = DIRECTIONS.includes(activeSignalRef.current)
        ? activeSignalRef.current
        : normalizedSignal;
      activeSignalRef.current = safeActiveSignal;
      setTrafficData((prev) => ({
        ...prev,
        ...data,
        activeSignal: safeActiveSignal,
        phase: signalPhaseRef.current,
      }));
    });

    socket.on("connect", () => {});

    const isCarInIntersection = (car) => {
      const stopLineDistance = car.path.curves[0].getLength();
      const intersectionCurveDistance = car.path.curves[1].getLength();
      const exitDistance = stopLineDistance + intersectionCurveDistance;
      const rearProgress = getProgress(car) - car.length / 2;
      const frontProgress = getFrontProgress(car);
      return frontProgress > stopLineDistance && rearProgress < exitDistance;
    };
    const isCarInCrosswalkArea = (car) => {
      const { x, z } = car.mesh.position;
      const inHorizontalCrosswalk = Math.abs(Math.abs(z) - 9) < 0.9 && Math.abs(x) < 11;
      const inVerticalCrosswalk = Math.abs(Math.abs(x) - 9) < 0.9 && Math.abs(z) < 11;
      return inHorizontalCrosswalk || inVerticalCrosswalk;
    };
    const getIntersectionExitProgress = (car) => {
      const stopLineDistance = car.path.curves[0].getLength();
      const intersectionCurveDistance = car.path.curves[1].getLength();
      return stopLineDistance + intersectionCurveDistance;
    };
    const hasAmbulanceClearedIntersection = () => {
      const ambulance = carsRef.current.find(
        (car) => car.id === emergencyAmbulanceIdRef.current && car.isAmbulance
      );
      if (!ambulance) return true;
      const exitDistance = getIntersectionExitProgress(ambulance);
      const ambulanceRear = getProgress(ambulance) - ambulance.length / 2;
      return ambulanceRear > exitDistance + 0.8;
    };
    const activateEmergency = (direction, ambulanceId, now) => {
      if (emergencyActiveRef.current) return;
      emergencyActiveRef.current = true;
      emergencyDirectionRef.current = direction;
      emergencyResumeDirectionRef.current = activeSignalRef.current;
      emergencyAmbulanceIdRef.current = ambulanceId;
      emergencyActivatedAtRef.current = now;
      pedestrianSignalRef.current = "DONT_WALK";
      pedestrianPhaseStartRef.current = -1;
      pedestrianPhaseActiveRef.current = false;
      setTrafficData((prev) => ({
        ...prev,
        emergencyActive: true,
        emergencyDirection: direction,
      }));
    };
    const startPedestrianPhase = (now) => {
      pedestrianPhaseActiveRef.current = true;
      pedestrianSignalRef.current = "WALK";
      pedestrianPhaseStartRef.current = now;
      signalTransitionStartRef.current = now;
      startPedestrianPhaseBurst();
      pedestriansRef.current.forEach((pedestrian) => {
        if (pedestrian.state === "waiting") {
          pedestrian.state = "crossing";
          pedestrian.startAfter = now;
        }
      });
      console.log(
        `[Pedestrian] WALK started, active pedestrians: ${
          pedestriansRef.current.filter((pedestrian) => pedestrian.state === "crossing").length
        }`
      );
      setTrafficData((prev) => ({
        ...prev,
        phase: "ALL_RED",
        activeSignal: activeSignalRef.current,
      }));
    };
    const getResumeDirectionAfterEmergency = () => {
      const pausedDirection = emergencyResumeDirectionRef.current || activeSignalRef.current;
      if (!completedDirectionSetRef.current.has(pausedDirection)) return pausedDirection;

      const startIndex = SIGNAL_CYCLE_ORDER.indexOf(pausedDirection);
      for (let i = 1; i <= SIGNAL_CYCLE_ORDER.length; i += 1) {
        const candidate = SIGNAL_CYCLE_ORDER[(startIndex + i) % SIGNAL_CYCLE_ORDER.length];
        if (!completedDirectionSetRef.current.has(candidate)) return candidate;
      }
      return pausedDirection;
    };
    const clearEmergencyAndResumeCycle = (now) => {
      const resumeDirection = getResumeDirectionAfterEmergency();
      emergencyActiveRef.current = false;
      emergencyDirectionRef.current = null;
      emergencyResumeDirectionRef.current = null;
      emergencyAmbulanceIdRef.current = null;
      emergencyActivatedAtRef.current = -1;
      completedVehicleDirectionsRef.current = completedDirectionSetRef.current.size;
      pedestrianSignalRef.current = "DONT_WALK";
      pedestrianPhaseStartRef.current = -1;
      pedestrianPhaseActiveRef.current = false;
      cycleIndexRef.current = Math.max(0, SIGNAL_CYCLE_ORDER.indexOf(resumeDirection));
      activeSignalRef.current = resumeDirection;
      desiredSignalRef.current = resumeDirection;
      previousSignalRef.current = resumeDirection;
      greenDurationMsRef.current = calculateGreenDurationMs(resumeDirection);
      signalPhaseRef.current = "GREEN";
      signalTransitionStartRef.current = now;
      lastSignalChangeRef.current = now;
      setTrafficData((prev) => ({
        ...prev,
        phase: "GREEN",
        activeSignal: resumeDirection,
        emergencyActive: false,
        emergencyDirection: "-",
      }));
    };

    const updateSignalPhase = (now) => {
      if (signalTransitionStartRef.current < 0) signalTransitionStartRef.current = now;

      // Update intersection list per frame
      intersectionCarsRef.current = carsRef.current.filter(isCarInIntersection);
      if (intersectionCarsRef.current.length === 0) {
        if (intersectionEmptySinceRef.current === null) intersectionEmptySinceRef.current = now;
      } else {
        intersectionEmptySinceRef.current = null;
      }

      const phase = signalPhaseRef.current;
      const elapsed = now - signalTransitionStartRef.current;
      const hasStableEmptyWindow =
        intersectionEmptySinceRef.current !== null &&
        now - intersectionEmptySinceRef.current >= INTERSECTION_EMPTY_BUFFER_MS;
      const hasCarsInCrosswalk = carsRef.current.some(isCarInCrosswalkArea);

      if (
        emergencyActiveRef.current &&
        emergencyActivatedAtRef.current > 0 &&
        now - emergencyActivatedAtRef.current > EMERGENCY_STALE_TIMEOUT_MS
      ) {
        clearEmergencyAndResumeCycle(now);
        return;
      }

      if (emergencyActiveRef.current) {
        if (phase === "GREEN") {
          signalPhaseRef.current = "YELLOW";
          signalTransitionStartRef.current = now;
          setTrafficData((prev) => ({
            ...prev,
            phase: "YELLOW",
            activeSignal: activeSignalRef.current,
          }));
          return;
        }

        if (phase === "YELLOW") {
          if (elapsed >= SIGNAL_YELLOW_MS) {
            signalPhaseRef.current = "EMERGENCY_ALL_RED";
            signalTransitionStartRef.current = now;
            setTrafficData((prev) => ({
              ...prev,
              phase: "EMERGENCY_ALL_RED",
              activeSignal: activeSignalRef.current,
            }));
          }
          return;
        }

        if (phase === "CLEARING" || phase === "ALL_RED") {
          signalPhaseRef.current = "EMERGENCY_ALL_RED";
          signalTransitionStartRef.current = now;
          setTrafficData((prev) => ({
            ...prev,
            phase: "EMERGENCY_ALL_RED",
            activeSignal: activeSignalRef.current,
          }));
          return;
        }

        if (phase === "EMERGENCY_ALL_RED") {
          if (
            elapsed < EMERGENCY_ALL_RED_MS ||
            !hasStableEmptyWindow ||
            hasCarsInCrosswalk ||
            isPedestrianCrossingRef.current
          ) {
            return;
          }
          const emergencyDirection = emergencyDirectionRef.current || activeSignalRef.current;
          previousSignalRef.current = emergencyDirection;
          activeSignalRef.current = emergencyDirection;
          signalPhaseRef.current = "EMERGENCY_GREEN";
          signalTransitionStartRef.current = now;
          setTrafficData((prev) => ({
            ...prev,
            phase: "EMERGENCY_GREEN",
            activeSignal: emergencyDirection,
          }));
          return;
        }

        if (phase === "EMERGENCY_GREEN") {
          activeSignalRef.current = emergencyDirectionRef.current || activeSignalRef.current;
          if (hasAmbulanceClearedIntersection()) {
            clearEmergencyAndResumeCycle(now);
          }
          return;
        }
      }

      if (phase === "GREEN") {
        if (elapsed >= greenDurationMsRef.current) {
          signalPhaseRef.current = "YELLOW";
          signalTransitionStartRef.current = now;
          setTrafficData((prev) => ({
            ...prev,
            phase: "YELLOW",
            activeSignal: activeSignalRef.current,
          }));
        }
        return;
      }

      if (phase === "YELLOW") {
        if (elapsed >= SIGNAL_YELLOW_MS) {
          signalPhaseRef.current = "CLEARING";
          signalTransitionStartRef.current = now;
          setTrafficData((prev) => ({
            ...prev,
            phase: "CLEARING",
            activeSignal: activeSignalRef.current,
          }));
        }
        return;
      }

      if (phase === "CLEARING") {
        if (hasStableEmptyWindow && !hasCarsInCrosswalk) {
          const completedDirection = activeSignalRef.current;
          if (!completedDirectionSetRef.current.has(completedDirection)) {
            completedDirectionSetRef.current.add(completedDirection);
            console.log("[Pedestrian] completed directions:", [...completedDirectionSetRef.current]);
          }
          completedVehicleDirectionsRef.current = completedDirectionSetRef.current.size;
          signalPhaseRef.current = "ALL_RED";
          signalTransitionStartRef.current = now;
          pedestrianSignalRef.current = "DONT_WALK";
          pedestrianPhaseStartRef.current = -1;
          pedestrianPhaseActiveRef.current = false;
          setTrafficData((prev) => ({
            ...prev,
            phase: "ALL_RED",
            activeSignal: activeSignalRef.current,
          }));
        } else {
          // FORCE TRANSITION if stuck too long (deadlock prevention)
          if (elapsed > 5000) {
            const completedDirection = activeSignalRef.current;
            if (!completedDirectionSetRef.current.has(completedDirection)) {
              completedDirectionSetRef.current.add(completedDirection);
            }
            completedVehicleDirectionsRef.current = completedDirectionSetRef.current.size;
            signalPhaseRef.current = "ALL_RED";
            signalTransitionStartRef.current = now;
            pedestrianSignalRef.current = "DONT_WALK";
            pedestrianPhaseStartRef.current = -1;
            pedestrianPhaseActiveRef.current = false;
            setTrafficData((prev) => ({
              ...prev,
              phase: "ALL_RED",
              activeSignal: activeSignalRef.current,
            }));
          }
        }
        return;
      }

      if (phase === "ALL_RED") {
        const shouldStartPedestrianPhase =
          completedDirectionSetRef.current.size >= SIGNAL_CYCLE_ORDER.length;
        if (shouldStartPedestrianPhase && !pedestrianPhaseActiveRef.current) {
          if (!hasStableEmptyWindow || hasCarsInCrosswalk) {
            // FORCE TRANSITION if stuck (deadlock prevention)
            if (elapsed > 5000) {
              pedestrianPhaseActiveRef.current = false;
            } else {
              return;
            }
          }
        }

        if (elapsed < SIGNAL_ALL_RED_MS || (!hasStableEmptyWindow && elapsed < 3000) || hasCarsInCrosswalk) {
          // If stuck too long, force transition
          if (elapsed < SIGNAL_ALL_RED_MS && elapsed > 5000) {
            // Force proceed after extended wait
          } else if (elapsed < SIGNAL_ALL_RED_MS) {
            return;
          }
        }

        if (pedestrianPhaseActiveRef.current) {
          const walkElapsed = now - pedestrianPhaseStartRef.current;
          if (walkElapsed < PEDESTRIAN_WALK_MS) return;

          pedestrianSignalRef.current = "DONT_WALK";
          pedestrianPhaseActiveRef.current = false;
          pedestriansRef.current = pedestriansRef.current.filter((pedestrian) => {
            if (pedestrian.state === "crossing") {
              scene.remove(pedestrian.group);
              return false;
            }
            return true;
          });
          isPedestrianCrossingRef.current = false;
          completedVehicleDirectionsRef.current = 0;
          completedDirectionSetRef.current.clear();
        }

        // Ensure we always transition to next direction (prevent stuck state)
        const currentDirectionIndex = SIGNAL_CYCLE_ORDER.indexOf(activeSignalRef.current);
        if (currentDirectionIndex >= 0) {
          cycleIndexRef.current = currentDirectionIndex;
        }
        cycleIndexRef.current = (cycleIndexRef.current + 1) % SIGNAL_CYCLE_ORDER.length;
        const nextDirection = SIGNAL_CYCLE_ORDER[cycleIndexRef.current];
        desiredSignalRef.current = nextDirection;
        previousSignalRef.current = nextDirection;
        activeSignalRef.current = nextDirection;
        greenDurationMsRef.current = calculateGreenDurationMs(nextDirection);
        signalPhaseRef.current = "GREEN";
        signalTransitionStartRef.current = now;
        lastSignalChangeRef.current = now;
        
        // Reset intersection tracking to ensure fresh start
        intersectionEmptySinceRef.current = now;
        
        setTrafficData((prev) => ({
          ...prev,
          activeSignal: nextDirection,
          phase: "GREEN",
        }));
      }
    };

    const createVehicleMesh = (type, color) => {
      const group = new THREE.Group();
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: color || 0xff0000,
        emissive: color || 0xff0000,
        emissiveIntensity: 0.15,
        roughness: 0.4,
        metalness: 0.3,
      });
      const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.85
      });
      const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.95 });

      if (type === "car") {
        // Car Body (slimmer and more detailed)
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 4.2), bodyMaterial);
        body.position.y = 0.55;
        body.castShadow = true;
        group.add(body);

        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 2.0), bodyMaterial);
        cab.position.set(0, 1.15, -0.2);
        cab.castShadow = true;
        group.add(cab);

        // Windows
        const frontWin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.05), glassMaterial);
        frontWin.position.set(0, 1.15, 0.8);
        group.add(frontWin);

        const backWin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.05), glassMaterial);
        backWin.position.set(0, 1.15, -1.2);
        group.add(backWin);
      } else if (type === "truck") {
        // Truck Cab (more vertical)
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 1.6), bodyMaterial);
        cab.position.set(0, 1.1, 1.7);
        cab.castShadow = true;
        group.add(cab);

        const cabWin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.05), glassMaterial);
        cabWin.position.set(0, 1.3, 2.5); 
        group.add(cabWin);

        // Truck Bed
        const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 3.8), bodyMaterial);
        bed.position.set(0, 0.85, -1.0);
        bed.castShadow = true;
        group.add(bed);

        const bedInner = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 3.4), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
        bedInner.position.set(0, 1.05, -1.0);
        group.add(bedInner);
      } else if (type === "bus") {
        // Bus Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 8.2), bodyMaterial);
        body.position.y = 1.45;
        body.castShadow = true;
        group.add(body);

        // Continuous windows
        const winSideL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 7.8), glassMaterial);
        winSideL.position.set(1.3, 1.7, 0);
        group.add(winSideL);

        const winSideR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 7.8), glassMaterial);
        winSideR.position.set(-1.3, 1.7, 0);
        group.add(winSideR);

        const winFront = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.05), glassMaterial);
        winFront.position.set(0, 1.7, 4.1);
        group.add(winFront);
      } else if (type === "ambulance") {
        const baseBody = new THREE.Mesh(
          new THREE.BoxGeometry(2.4, 1.0, 4.7),
          new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            emissive: 0x111111,
            emissiveIntensity: 0.08,
            roughness: 0.42,
            metalness: 0.3,
          })
        );
        baseBody.position.y = 0.8;
        baseBody.castShadow = true;
        group.add(baseBody);

        const rearCabin = new THREE.Mesh(
          new THREE.BoxGeometry(2.35, 1.45, 2.55),
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0x101010,
            emissiveIntensity: 0.08,
            roughness: 0.38,
            metalness: 0.28,
          })
        );
        rearCabin.position.set(0, 1.55, -0.65);
        rearCabin.castShadow = true;
        group.add(rearCabin);

        const redStripe = new THREE.Mesh(
          new THREE.BoxGeometry(2.42, 0.22, 4.1),
          new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x1f0404, emissiveIntensity: 0.3 })
        );
        redStripe.position.set(0, 1.02, 0);
        group.add(redStripe);

        const frontWin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.05), glassMaterial);
        frontWin.position.set(0, 1.3, 2.34);
        group.add(frontWin);

        const beaconLeftMaterial = new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0x7f1d1d,
          emissiveIntensity: 0.25,
          roughness: 0.28,
          metalness: 0.25,
        });
        const beaconRightMaterial = new THREE.MeshStandardMaterial({
          color: 0x3b82f6,
          emissive: 0x172554,
          emissiveIntensity: 0.25,
          roughness: 0.28,
          metalness: 0.25,
        });
        const beaconLeft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.42), beaconLeftMaterial);
        const beaconRight = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.42), beaconRightMaterial);
        beaconLeft.position.set(-0.38, 2.36, 0.15);
        beaconRight.position.set(0.38, 2.36, 0.15);
        group.add(beaconLeft);
        group.add(beaconRight);
        group.userData.ambulanceBeaconMaterials = [beaconLeftMaterial, beaconRightMaterial];
      } else if (type === "bicycle") {
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.08, 2.3),
          new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7, metalness: 0.25 })
        );
        frame.position.set(0, 0.58, 0);
        frame.castShadow = true;
        group.add(frame);

        const seatPost = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.35, 0.06),
          new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7, metalness: 0.25 })
        );
        seatPost.position.set(0, 0.77, -0.2);
        seatPost.castShadow = true;
        group.add(seatPost);

        const riderBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.16), bodyMaterial);
        riderBody.position.set(0, 1.06, -0.1);
        riderBody.castShadow = true;
        group.add(riderBody);

        const riderHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 10, 10),
          new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.8, metalness: 0.03 })
        );
        riderHead.position.set(0, 1.38, -0.1);
        riderHead.castShadow = true;
        group.add(riderHead);
      } else if (type === "motorbike") {
        const bikeBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.35, 1.9),
          new THREE.MeshStandardMaterial({ color: color || 0xef4444, roughness: 0.45, metalness: 0.35 })
        );
        bikeBody.position.set(0, 0.65, 0.05);
        bikeBody.castShadow = true;
        group.add(bikeBody);

        const tank = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.28, 0.7),
          new THREE.MeshStandardMaterial({ color: color || 0xef4444, roughness: 0.4, metalness: 0.4 })
        );
        tank.position.set(0, 0.86, 0.25);
        tank.castShadow = true;
        group.add(tank);

        const riderBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.45, 0.18), bodyMaterial);
        riderBody.position.set(0, 1.05, -0.02);
        riderBody.rotation.x = -0.22;
        riderBody.castShadow = true;
        group.add(riderBody);

        const riderHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 10, 10),
          new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.8, metalness: 0.03 })
        );
        riderHead.position.set(0, 1.38, 0.03);
        riderHead.castShadow = true;
        group.add(riderHead);
      }

      const wheelRadius = type === "bicycle" ? 0.33 : type === "motorbike" ? 0.36 : 0.42;
      const wheelThickness = type === "bicycle" ? 0.12 : type === "motorbike" ? 0.18 : 0.35;
      const wheelGeom = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 16);
      wheelGeom.rotateZ(Math.PI / 2);
      const wheelMeshes = [];
      const wheelPos =
        type === "bus"
          ? [[-1.2, wheelRadius, 3], [1.2, wheelRadius, 3], [-1.2, wheelRadius, -3], [1.2, wheelRadius, -3]]
          : type === "ambulance"
            ? [[-1.0, wheelRadius, 1.6], [1.0, wheelRadius, 1.6], [-1.0, wheelRadius, -1.45], [1.0, wheelRadius, -1.45]]
          : type === "bicycle" || type === "motorbike"
            ? [[0, wheelRadius, 0.88], [0, wheelRadius, -0.88]]
            : [[-1.0, wheelRadius, 1.4], [1.0, wheelRadius, 1.4], [-1.0, wheelRadius, -1.4], [1.0, wheelRadius, -1.4]];

      wheelPos.forEach((pos) => {
        const wheel = new THREE.Mesh(wheelGeom, wheelMaterial);
        wheel.position.set(...pos);
        wheel.castShadow = true;
        group.add(wheel);
        wheelMeshes.push(wheel);
      });
      group.userData.wheels = wheelMeshes;
      group.userData.wheelRadius = wheelRadius;

      return group;
    };

    const createPedestrianMesh = (color, scale) => {
      const group = new THREE.Group();
      const torsoMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
      const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.85, metalness: 0.02 });
      const limbMaterial = new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.82, metalness: 0.05 });

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.52, 0.2), torsoMaterial);
      body.position.y = 1.02;
      body.castShadow = true;
      group.add(body);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), skinMaterial);
      head.position.y = 1.42;
      head.castShadow = true;
      group.add(head);

      const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.12), limbMaterial);
      leftLeg.position.set(-0.08, 0.44, 0);
      leftLeg.castShadow = true;
      group.add(leftLeg);

      const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.12), limbMaterial);
      rightLeg.position.set(0.08, 0.44, 0);
      rightLeg.castShadow = true;
      group.add(rightLeg);

      const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.1), limbMaterial);
      leftArm.position.set(-0.24, 1.02, 0);
      leftArm.castShadow = true;
      group.add(leftArm);

      const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.1), limbMaterial);
      rightArm.position.set(0.24, 1.02, 0);
      rightArm.castShadow = true;
      group.add(rightArm);

      group.scale.setScalar(scale);

      return { group, leftLeg, rightLeg, leftArm, rightArm };
    };

    const spawnPedestrian = (route, forceCrossing = false) => {
      if (pedestriansRef.current.length >= MAX_PEDESTRIANS) return;

      const color = PEDESTRIAN_COLORS[Math.floor(Math.random() * PEDESTRIAN_COLORS.length)];
      const scale = 0.95 + Math.random() * 0.13;
      const speed = 1.05 + Math.random() * 0.5;

      const start = route.start.clone();
      const end = route.end.clone();
      if (route.axis === "x") {
        const offset = -0.45 + Math.random() * 0.9;
        start.z += offset;
        end.z += offset;
      } else {
        const offset = -0.45 + Math.random() * 0.9;
        start.x += offset;
        end.x += offset;
      }

      const mesh = createPedestrianMesh(color, scale);
      mesh.group.position.set(start.x, 0, start.z);
      mesh.group.lookAt(new THREE.Vector3(end.x, 0, end.z));
      scene.add(mesh.group);

      pedestriansRef.current.push({
        id: pedestrianIdRef.current++,
        group: mesh.group,
        leftLeg: mesh.leftLeg,
        rightLeg: mesh.rightLeg,
        leftArm: mesh.leftArm,
        rightArm: mesh.rightArm,
        start,
        end,
        speed,
        progress: 0,
        state: forceCrossing ? "crossing" : "waiting",
        startAfter: forceCrossing ? performance.now() : performance.now() + Math.random() * 700,
        animFreq: 6.5 + Math.random() * 2,
      });
    };

    const startPedestrianSpawning = () => {
      pedestrianSides.forEach((side, idx) => {
        const spawnNext = () => {
          const sideRoutes = pedestrianRoutes.filter((route) => route.side === side);
          const selectedRoute = sideRoutes[Math.floor(Math.random() * sideRoutes.length)];
          spawnPedestrian(selectedRoute);
          const delay =
            PEDESTRIAN_MIN_SPAWN_MS +
            Math.random() * (PEDESTRIAN_MAX_SPAWN_MS - PEDESTRIAN_MIN_SPAWN_MS);
          pedestrianSpawnTimersRef.current[idx] = window.setTimeout(spawnNext, delay);
        };
        const initialDelay = 500 + Math.random() * 1300;
        pedestrianSpawnTimersRef.current[idx] = window.setTimeout(spawnNext, initialDelay);
      });
    };
    const startPedestrianPhaseBurst = () => {
      pedestrianSides.forEach((side) => {
        const sideRoutes = pedestrianRoutes.filter((route) => route.side === side);
        const selectedRoute = sideRoutes[Math.floor(Math.random() * sideRoutes.length)];
        spawnPedestrian(selectedRoute, true);
      });
    };

    const updatePedestrians = (now, delta) => {
      const isPedestrianPhase = pedestrianPhaseActiveRef.current;
      if (pedestrianPhaseDebugRef.current !== isPedestrianPhase) {
        console.log(`[Pedestrian] phase active: ${isPedestrianPhase}`);
        pedestrianPhaseDebugRef.current = isPedestrianPhase;
      }
      let hasCrossing = false;

      pedestriansRef.current = pedestriansRef.current.filter((pedestrian) => {
        if (isPedestrianPhase && pedestrian.state === "waiting") {
          pedestrian.state = "crossing";
          pedestrian.startAfter = now;
        }

        if (isPedestrianPhase && pedestrian.state === "crossing") {
          const isFixedWalkWindow =
            pedestrianPhaseActiveRef.current && pedestrianPhaseStartRef.current >= 0;
          const direction = pedestrian.end.clone().sub(pedestrian.start).normalize();
          const toEnd = pedestrian.end.clone().sub(pedestrian.group.position);
          const distanceLeft = toEnd.length();
          const remainingWalkSeconds = isFixedWalkWindow
            ? Math.max(0.1, (pedestrianPhaseStartRef.current + PEDESTRIAN_WALK_MS - now) / 1000)
            : 1;
          const boostedSpeed = pedestrian.speed * (isFixedWalkWindow ? PEDESTRIAN_PHASE_SPEED_MULTIPLIER : 2.2);
          const requiredSpeed = distanceLeft / remainingWalkSeconds;
          const walkSpeed = Math.max(0.8, boostedSpeed, requiredSpeed);
          const travel = Math.min(distanceLeft, walkSpeed * delta);
          const nextPos = pedestrian.group.position.clone().add(direction.multiplyScalar(travel));

          pedestrian.group.position.copy(nextPos);
          pedestrian.progress = Math.min(1, pedestrian.progress + travel / pedestrian.start.distanceTo(pedestrian.end));
          pedestrian.group.lookAt(new THREE.Vector3(pedestrian.end.x, 0, pedestrian.end.z));

          hasCrossing = true;

          if (distanceLeft <= 0.08) {
            scene.remove(pedestrian.group);
            return false;
          }
        }

        const swing = Math.sin(now * 0.001 * pedestrian.animFreq) * 0.48;
        const isWalking = pedestrian.state === "crossing";
        pedestrian.leftLeg.rotation.x = isWalking ? swing : 0;
        pedestrian.rightLeg.rotation.x = isWalking ? -swing : 0;
        pedestrian.leftArm.rotation.x = isWalking ? -swing : 0;
        pedestrian.rightArm.rotation.x = isWalking ? swing : 0;
        return true;
      });

      isPedestrianCrossingRef.current = hasCrossing;
    };

    const getVehiclePath = (direction, intention) => {
      const spawn = SPAWN_POINTS[direction];
      const stopLine = STOP_LINE;
      const exit = BOUNDS + 10;
      const path = new THREE.CurvePath();

      const p0 = new THREE.Vector3(spawn.x, 0, spawn.z);
      let p1, p2, p3, p4;

      if (direction === "north") {
        p1 = new THREE.Vector3(LANE_CENTER_OFFSET, 0, -stopLine);
        if (intention === "STRAIGHT") {
          p2 = new THREE.Vector3(LANE_CENTER_OFFSET, 0, stopLine);
          p3 = new THREE.Vector3(LANE_CENTER_OFFSET, 0, exit);
        } else if (intention === "LEFT") {
          p2 = new THREE.Vector3(LANE_CENTER_OFFSET, 0, -LANE_CENTER_OFFSET); // Control point
          p3 = new THREE.Vector3(TURN_LANE_OFFSET, 0, -LANE_CENTER_OFFSET);
          p4 = new THREE.Vector3(exit, 0, -LANE_CENTER_OFFSET);
        } else if (intention === "RIGHT") {
          p2 = new THREE.Vector3(LANE_CENTER_OFFSET, 0, LANE_CENTER_OFFSET); // Control point
          p3 = new THREE.Vector3(-TURN_LANE_OFFSET, 0, LANE_CENTER_OFFSET);
          p4 = new THREE.Vector3(-exit, 0, LANE_CENTER_OFFSET);
        }
      } else if (direction === "south") {
        p1 = new THREE.Vector3(-LANE_CENTER_OFFSET, 0, stopLine);
        if (intention === "STRAIGHT") {
          p2 = new THREE.Vector3(-LANE_CENTER_OFFSET, 0, -stopLine);
          p3 = new THREE.Vector3(-LANE_CENTER_OFFSET, 0, -exit);
        } else if (intention === "LEFT") {
          p2 = new THREE.Vector3(-LANE_CENTER_OFFSET, 0, LANE_CENTER_OFFSET);
          p3 = new THREE.Vector3(-TURN_LANE_OFFSET, 0, LANE_CENTER_OFFSET);
          p4 = new THREE.Vector3(-exit, 0, LANE_CENTER_OFFSET);
        } else if (intention === "RIGHT") {
          p2 = new THREE.Vector3(-LANE_CENTER_OFFSET, 0, -LANE_CENTER_OFFSET);
          p3 = new THREE.Vector3(TURN_LANE_OFFSET, 0, -LANE_CENTER_OFFSET);
          p4 = new THREE.Vector3(exit, 0, -LANE_CENTER_OFFSET);
        }
      } else if (direction === "east") {
        p1 = new THREE.Vector3(-stopLine, 0, -LANE_CENTER_OFFSET);
        if (intention === "STRAIGHT") {
          p2 = new THREE.Vector3(stopLine, 0, -LANE_CENTER_OFFSET);
          p3 = new THREE.Vector3(exit, 0, -LANE_CENTER_OFFSET);
        } else if (intention === "LEFT") {
          p2 = new THREE.Vector3(-LANE_CENTER_OFFSET, 0, -LANE_CENTER_OFFSET);
          p3 = new THREE.Vector3(-LANE_CENTER_OFFSET, 0, -TURN_LANE_OFFSET);
          p4 = new THREE.Vector3(-LANE_CENTER_OFFSET, 0, -exit);
        } else if (intention === "RIGHT") {
          p2 = new THREE.Vector3(LANE_CENTER_OFFSET, 0, -LANE_CENTER_OFFSET);
          p3 = new THREE.Vector3(LANE_CENTER_OFFSET, 0, TURN_LANE_OFFSET);
          p4 = new THREE.Vector3(LANE_CENTER_OFFSET, 0, exit);
        }
      } else if (direction === "west") {
        p1 = new THREE.Vector3(stopLine, 0, LANE_CENTER_OFFSET);
        if (intention === "STRAIGHT") {
          p2 = new THREE.Vector3(-stopLine, 0, LANE_CENTER_OFFSET);
          p3 = new THREE.Vector3(-exit, 0, LANE_CENTER_OFFSET);
        } else if (intention === "LEFT") {
          p2 = new THREE.Vector3(LANE_CENTER_OFFSET, 0, LANE_CENTER_OFFSET);
          p3 = new THREE.Vector3(LANE_CENTER_OFFSET, 0, TURN_LANE_OFFSET);
          p4 = new THREE.Vector3(LANE_CENTER_OFFSET, 0, exit);
        } else if (intention === "RIGHT") {
          p2 = new THREE.Vector3(-LANE_CENTER_OFFSET, 0, LANE_CENTER_OFFSET);
          p3 = new THREE.Vector3(-LANE_CENTER_OFFSET, 0, -TURN_LANE_OFFSET);
          p4 = new THREE.Vector3(-LANE_CENTER_OFFSET, 0, -exit);
        }
      }

      // Spawn to stop line
      path.add(new THREE.LineCurve3(p0, p1));

      if (intention === "STRAIGHT") {
        path.add(new THREE.LineCurve3(p1, p2));
        path.add(new THREE.LineCurve3(p2, p3));
      } else {
        // Curve through intersection
        path.add(new THREE.QuadraticBezierCurve3(p1, p2, p3));
        // Intersection exit to bounds
        path.add(new THREE.LineCurve3(p3, p4));
      }

      return path;
    };

    const getRandomIntention = () => {
      const roll = Math.random();
      if (roll < 0.3) return "LEFT";
      if (roll < 0.7) return "STRAIGHT";
      return "RIGHT";
    };

    const createCar = (direction) => {
      if (carsRef.current.length >= MAX_CARS) return;

      const shouldSpawnAmbulance =
        !emergencyActiveRef.current && Math.random() < AMBULANCE_SPAWN_PROBABILITY;
      const vehicleTypes = ["car", "car", "car", "truck", "bus", "bicycle", "bicycle", "motorbike", "motorbike"];
      const type = shouldSpawnAmbulance
        ? "ambulance"
        : vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)];
      const length =
        type === "bus"
          ? 8.5
          : type === "truck"
            ? 6.0
            : type === "ambulance"
              ? 5.4
            : type === "motorbike"
              ? 2.8
              : type === "bicycle"
                ? 2.4
                : 4.5;

      // Strict lane spawn spacing: never create a car too close to one ahead.
      const isSpawnBlocked = carsRef.current.some((car) => {
        if (car.direction !== direction) return false;
        // Only consider cars that haven't cleared the spawn area
        const gapAhead = car.distanceTravelled - (car.length + length) / 2;
        return gapAhead >= 0 && gapAhead < SPAWN_GAP;
      });

      if (isSpawnBlocked) return;

      const color = shouldSpawnAmbulance ? 0xffffff : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
      const intention = shouldSpawnAmbulance ? "STRAIGHT" : getRandomIntention();
      const path = getVehiclePath(direction, intention);

      const mesh = createVehicleMesh(type, color);
      const startPos = path.getPoint(0);
      mesh.position.copy(startPos);
      
      // Initial rotation
      const nextPos = path.getPoint(0.01);
      mesh.lookAt(nextPos);
      
      scene.add(mesh);

      const createdCarId = carIdRef.current++;
      carsRef.current.push({
        id: createdCarId,
        direction,
        intention,
        path,
        distanceTravelled: 0,
        type,
        speed: 0,
        maxSpeed:
          type === "bus"
            ? 8.5 + Math.random() * 2
            : type === "truck"
              ? 9.5 + Math.random() * 3
              : type === "ambulance"
                ? 15 + Math.random() * 3
              : type === "motorbike"
                ? 10.5 + Math.random() * 3
                : type === "bicycle"
                  ? 6.2 + Math.random() * 1.6
                  : 11.5 + Math.random() * 4,
        targetSpeed: 0,
        state: "moving",
        mesh,
        length,
        isAmbulance: shouldSpawnAmbulance,
      });

      if (shouldSpawnAmbulance) {
        activateEmergency(direction, createdCarId, performance.now());
      }
    };

    const startSpawning = () => {
      DIRECTIONS.forEach((direction) => {
        const spawnNext = () => {
          createCar(direction);
          const delay = SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
          spawnTimersRef.current[direction] = window.setTimeout(spawnNext, delay);
        };
        // Stagger initial arrivals slightly to avoid robotic synchronization.
        const initialDelay = Math.random() * 800;
        spawnTimersRef.current[direction] = window.setTimeout(spawnNext, initialDelay);
      });
    };

    const isBeforeStopLine = (car) => {
      return distanceToStopLine(car) > 0;
    };

    const directionalGap = (leader, follower) => {
      const leaderRear = getProgress(leader) - leader.length / 2;
      const followerFront = getFrontProgress(follower);
      return leaderRear - followerFront;
    };
    const getQueueTargetGap = (leader, follower) => {
      const lengthScaledGap = 0.8 + (leader.length + follower.length) * 0.08;
      return Math.min(QUEUE_MAX_VISIBLE_GAP, Math.max(QUEUE_MIN_VISIBLE_GAP, lengthScaledGap));
    };

    const getProgress = (car) => car.distanceTravelled;
    const getFrontProgress = (car) => car.distanceTravelled + car.length / 2;

    const setFrontProgress = (car, frontProgress) => {
      car.distanceTravelled = frontProgress - car.length / 2;
      const totalLength = car.path.getLength();
      const t = Math.min(car.distanceTravelled / totalLength, 1);
      
      const pos = car.path.getPoint(t);
      car.mesh.position.copy(pos);
      
      // Update rotation
      if (t < 0.99) {
        const nextPos = car.path.getPoint(t + 0.01);
        car.mesh.lookAt(nextPos);
      }
    };
    const rotateVehicleWheels = (car, distanceMoved) => {
      const wheels = car.mesh.userData.wheels;
      const wheelRadius = car.mesh.userData.wheelRadius;
      if (!Array.isArray(wheels) || !wheelRadius || distanceMoved <= 0) return;
      const spin = distanceMoved / wheelRadius;
      wheels.forEach((wheel) => {
        wheel.rotation.x += spin;
      });
    };

    const distanceToStopLine = (car) => {
      const stopLineDistance = getStopLineFrontProgress(car);
      return stopLineDistance - getFrontProgress(car);
    };

    const getStopLineFrontProgress = (car) => {
      const firstCurve = car.path.curves[0];
      const axis = car.direction === "north" || car.direction === "south" ? "z" : "x";
      const stopCoordinate =
        car.direction === "north" || car.direction === "east"
          ? -VEHICLE_CROSSWALK_STOP_ABS
          : VEHICLE_CROSSWALK_STOP_ABS;
      const startCoord = firstCurve.v1[axis];
      const endCoord = firstCurve.v2[axis];
      const denom = endCoord - startCoord;
      if (Math.abs(denom) < 0.0001) return firstCurve.getLength();
      const t = Math.min(1, Math.max(0, (stopCoordinate - startCoord) / denom));
      return firstCurve.getLength() * t;
    };

    const updateCarGlow = (car, now) => {
      const isStopped = car.state.includes("stopped") || car.speed < 0.1;
      const intensity = isStopped ? 0.8 : 0.3;
      car.mesh.traverse((child) => {
        if (child.material && child.material.emissiveIntensity !== undefined) {
          child.material.emissiveIntensity = intensity;
        }
      });

      if (car.isAmbulance) {
        const beacons = car.mesh.userData.ambulanceBeaconMaterials || [];
        const blinkOn = Math.floor(now / 120) % 2 === 0;
        beacons.forEach((material, idx) => {
          const isLit = idx === 0 ? blinkOn : !blinkOn;
          material.emissiveIntensity = isLit ? 2.2 : 0.2;
        });
      }
    };
    const getNearestApproachingCar = (direction) => {
      let nearest = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      carsRef.current.forEach((car) => {
        if (car.direction !== direction) return;
        const distance = distanceToStopLine(car);
        if (distance <= 0) return;
        if (distance < nearestDistance) {
          nearest = car;
          nearestDistance = distance;
        }
      });
      return nearest;
    };
    const updateSpeedBoards = (now, delta) => {
      DIRECTIONS.forEach((direction) => {
        const board = speedBoardsRef.current[direction];
        if (!board) return;

        const nearestCar = getNearestApproachingCar(board.monitorDirection || direction);
        const targetSpeed = nearestCar ? Math.max(0, nearestCar.speed * SPEED_UNIT_SCALE) : 0;
        const lerpFactor = Math.min(1, delta * SPEED_DISPLAY_SMOOTHING);
        board.displayedSpeed += (targetSpeed - board.displayedSpeed) * lerpFactor;
        if (!nearestCar && board.displayedSpeed < 0.25) board.displayedSpeed = 0;

        const roundedSpeed = Math.max(0, Math.round(board.displayedSpeed));
        const valueLabel = nearestCar ? `${roundedSpeed}` : "--";
        const isAlert = nearestCar ? roundedSpeed > SPEED_ALERT_THRESHOLD_KMH : false;
        const changed =
          valueLabel !== board.lastText ||
          isAlert !== board.lastAlert ||
          roundedSpeed !== board.lastRoundedSpeed;
        if (!changed || now - board.lastRenderAt < SPEED_BOARD_REFRESH_MS) return;

        drawSpeedBoardDisplay(board, valueLabel, isAlert);
        board.lastRenderAt = now;
        board.lastText = valueLabel;
        board.lastAlert = isAlert;
        board.lastRoundedSpeed = roundedSpeed;
      });
    };

    const removeOutOfBoundsCars = () => {
      carsRef.current = carsRef.current.filter((car) => {
        const isOutOfBound = car.distanceTravelled > car.path.getLength();
        if (isOutOfBound) {
          scene.remove(car.mesh);
          return false;
        }
        return true;
      });
    };

    const updateCarsByDirection = (direction, delta, now) => {
      const cars = carsRef.current.filter((car) => car.direction === direction);
      cars.sort((a, b) => getProgress(b) - getProgress(a));

      const emergencyAmbulance =
        emergencyActiveRef.current && direction === emergencyDirectionRef.current
          ? cars.find((car) => car.id === emergencyAmbulanceIdRef.current && car.isAmbulance) || null
          : null;

      cars.forEach((car, index) => {
        const leader = index > 0 ? cars[index - 1] : null;
        const frontProgress = getFrontProgress(car);
        const distanceToStop = distanceToStopLine(car);
        const stopLineFrontProgress = getStopLineFrontProgress(car);
        const emergencyExitProgress = getIntersectionExitProgress(car) + 1.0;

        const normalCanEnterIntersection =
          signalPhaseRef.current === "GREEN" &&
          direction === activeSignalRef.current &&
          !isPedestrianCrossingRef.current;
        const isEmergencyGreenForLane =
          signalPhaseRef.current === "EMERGENCY_GREEN" &&
          direction === emergencyDirectionRef.current &&
          !isPedestrianCrossingRef.current;
        const canEnterIntersection = emergencyActiveRef.current
          ? isEmergencyGreenForLane && car.isAmbulance
          : normalCanEnterIntersection;
        const shouldClearForAmbulance =
          emergencyAmbulance &&
          !car.isAmbulance &&
          getProgress(car) > getProgress(emergencyAmbulance) &&
          getProgress(car) < emergencyExitProgress;

        let targetSpeed = car.maxSpeed;
        let carState = "moving";

        // Signal Logic
        const beforeStopLine = distanceToStop > 0;
        if (beforeStopLine && !canEnterIntersection && !shouldClearForAmbulance) {
          const distanceToHold = distanceToStop - STOP_LINE_HOLD_GAP;
          if (distanceToHold < 15) {
            targetSpeed = Math.max(0, car.maxSpeed * (distanceToHold / 15));
            if (distanceToHold <= 0.1) {
              targetSpeed = 0;
              carState = "stopped_at_signal";
            }
          }
        }
        if (shouldClearForAmbulance) {
          targetSpeed = Math.max(targetSpeed, car.maxSpeed * 1.35);
        }
        if (car.isAmbulance && emergencyActiveRef.current) {
          targetSpeed = Math.max(targetSpeed, car.maxSpeed * 1.2);
        }

<<<<<<< HEAD
        // Failsafe: Maintain speed inside intersection (don't reduce speed unnecessarily)
        if (car.inIntersection && signalPhaseRef.current !== "EMERGENCY_ALL_RED") {
          // Keep current speed or accelerate to maxSpeed, never force reduction
          targetSpeed = Math.max(targetSpeed, car.maxSpeed);
          carState = "moving";
        }

        // Leader Following Logic - STRICT collision prevention (check ALL cars, not just same lane)
        // Find the nearest vehicle ahead regardless of lane to prevent overlaps
        let nearestLeader = null;
        let nearestLeaderGap = Number.POSITIVE_INFINITY;
        
        for (const otherCar of carsRef.current) {
          if (otherCar.id === car.id) continue;
          
          // Only check vehicles that are ahead of this car
          const otherFrontProgress = getFrontProgress(otherCar);
          const gap = otherFrontProgress - frontProgress;
          
          // Skip if behind or too far away (> 15 units)
          if (gap < 0 || gap > 15) continue;
          
          // Check physical proximity using world position
          const dx = car.mesh.position.x - otherCar.mesh.position.x;
          const dz = car.mesh.position.z - otherCar.mesh.position.z;
          const distance = Math.sqrt(dx * dx + dz * dz);
          
          // If vehicles are close in space (within 6 units), treat as potential collision
          if (distance < 6 && gap < nearestLeaderGap) {
            // Calculate actual gap along path
            const actualGap = directionalGap(otherCar, car);
            if (actualGap < nearestLeaderGap && actualGap > -2) {
              nearestLeader = otherCar;
              nearestLeaderGap = actualGap;
            }
          }
        }
        
        // Apply collision prevention with nearest leader
        if (nearestLeader && nearestLeaderGap < STRICT_FOLLOW_GAP) {
          // HARD STOP if gap is critically small (prevent overlap)
          if (nearestLeaderGap < 1.5) {
            targetSpeed = 0;
            carState = "stopped_behind_leader";
          } else {
            // Gradual speed reduction based on gap
            const speedRatio = Math.max(0, (nearestLeaderGap - 1.5) / (STRICT_FOLLOW_GAP - 1.5));
            targetSpeed = Math.min(targetSpeed, nearestLeader.speed * speedRatio);
            if (targetSpeed < 0.3) {
              targetSpeed = 0;
              carState = "stopped_behind_leader";
            }
          }
        } else if (leader && !car.inIntersection) {
          // Original same-lane following for non-critical situations
          const gap = directionalGap(leader, car);
          if (gap < STRICT_FOLLOW_GAP) {
            const followerTargetSpeed = Math.max(0, leader.speed * (gap / STRICT_FOLLOW_GAP));
            if (followerTargetSpeed < targetSpeed) {
              targetSpeed = followerTargetSpeed;
              if (targetSpeed < 0.3) {
                targetSpeed = 0;
                carState = "stopped_behind_leader";
              }
=======
        // Leader Following Logic
        if (leader) {
          const gap = directionalGap(leader, car);
          const queueTargetGap = getQueueTargetGap(leader, car);
          const queueHardStopGap = Math.max(0.25, queueTargetGap - 0.2);
          const queueSlowdownStartGap = queueTargetGap + QUEUE_SLOWDOWN_BUFFER;

          if (gap <= queueHardStopGap) {
            targetSpeed = 0;
            carState = "stopped_behind_leader";
          } else if (gap < queueSlowdownStartGap) {
            const blend = Math.max(
              0,
              Math.min(1, (gap - queueHardStopGap) / (queueSlowdownStartGap - queueHardStopGap))
            );
            const followSpeed = leader.speed + (car.maxSpeed - leader.speed) * blend * 0.35;
            targetSpeed = Math.min(targetSpeed, Math.max(0, followSpeed));
            if (leader.speed < 0.2 && gap <= queueTargetGap + 0.2) {
              targetSpeed = 0;
              carState = "stopped_behind_leader";
>>>>>>> c9d6d4387f1812ec600b6279a87bf50447e7bda5
            }
          }
        }

        // Intersection conflict detection for turning vehicles (minimal impact on speed)
        if (car.intention !== "STRAIGHT" && !car.inIntersection && distanceToStop <= 0 && distanceToStop > -5) {
          // Only check for immediate conflicts (vehicles very close to collision)
          let hasImmediateConflict = false;
          for (const otherCar of intersectionCarsRef.current) {
            if (otherCar.id === car.id) continue;
            
            // Check physical distance, not just presence in intersection
            const dx = car.mesh.position.x - otherCar.mesh.position.x;
            const dz = car.mesh.position.z - otherCar.mesh.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Only slow down if another vehicle is very close (< 5 units)
            if (distance < 5) {
              hasImmediateConflict = true;
              break;
            }
          }
          // Minimal speed reduction only for immediate conflicts (90% speed maintained)
          if (hasImmediateConflict) {
            targetSpeed = Math.min(targetSpeed, car.maxSpeed * 0.9);
          }
        }

        // Speed Update - Smooth damping to prevent oscillation
        // Use gradual interpolation instead of instant changes
        const smoothingFactor = targetSpeed === 0 ? 0.08 : 0.15;
        car.speed += (targetSpeed - car.speed) * smoothingFactor;
        
        // Minimum speed threshold - prevent micro-movements
        if (car.speed < 0.02) {
          car.speed = 0;
          carState = carState.includes("stopped") ? carState : "stopped_at_signal";
        }

        // Movement - Compute next position first
        let newFrontProgress = frontProgress + car.speed * delta;
<<<<<<< HEAD
        
        // Epsilon stop: if movement is negligible, lock position
        if (Math.abs(newFrontProgress - frontProgress) < 0.01) {
          newFrontProgress = frontProgress;
          car.speed = 0;
        }

        // Apply constraints ONCE in priority order
        let clamped = false;
        
        // PRIORITY 1: Front car constraint (collision prevention)
        if (leader) {
          const leaderRear = getProgress(leader) - leader.length / 2;
          const maxAllowedByLeader = leaderRear - STRICT_FOLLOW_GAP;
          if (newFrontProgress > maxAllowedByLeader) {
            newFrontProgress = maxAllowedByLeader;
            clamped = true;
          }
        }
        
        // PRIORITY 2: Stop line constraint
        if (beforeStopLine && !canEnterIntersection && !shouldClearForAmbulance) {
          const maxAllowedByStopLine = stopLineFrontProgress - STOP_LINE_HOLD_GAP;
          if (newFrontProgress > maxAllowedByStopLine) {
            newFrontProgress = maxAllowedByStopLine;
            clamped = true;
          }
        }
        
        // Prevent back-and-forth: if clamped, stop completely
        if (clamped && newFrontProgress <= frontProgress + 0.001) {
          car.speed = 0;
          newFrontProgress = frontProgress;
=======

        // Constraints
        if (carState === "stopped_at_signal") {
          newFrontProgress = stopLineFrontProgress - STOP_LINE_HOLD_GAP;
        } else if (carState === "stopped_behind_leader" && leader) {
          const leaderRear = getProgress(leader) - leader.length / 2;
          const queueTargetGap = getQueueTargetGap(leader, car);
          newFrontProgress = leaderRear - queueTargetGap;
        } else if (beforeStopLine && !canEnterIntersection && !shouldClearForAmbulance) {
          newFrontProgress = Math.min(newFrontProgress, stopLineFrontProgress - STOP_LINE_HOLD_GAP);
        }

        if (leader) {
          const leaderRear = getProgress(leader) - leader.length / 2;
          const queueTargetGap = getQueueTargetGap(leader, car);
          newFrontProgress = Math.min(newFrontProgress, leaderRear - queueTargetGap);
>>>>>>> c9d6d4387f1812ec600b6279a87bf50447e7bda5
        }

        const prevDistance = car.distanceTravelled;
        setFrontProgress(car, newFrontProgress);
        rotateVehicleWheels(car, Math.max(0, car.distanceTravelled - prevDistance));
        car.state = carState;
        updateCarGlow(car, now);
      });
    };

    const sendTrafficCounts = () => {
      const counts = { north: 0, south: 0, east: 0, west: 0 };
      carsRef.current.forEach((car) => {
        counts[car.direction] += 1;
      });
      socket.emit("traffic:counts", counts);

      setTrafficData((prev) => ({
        ...prev,
        ...counts,
        activeSignal: activeSignalRef.current,
        phase: signalPhaseRef.current,
        carsInIntersection: intersectionCarsRef.current.length,
        emergencyActive: emergencyActiveRef.current,
        emergencyDirection: emergencyDirectionRef.current || "-",
      }));
    };

    let animationFrameId = 0;
    const clock = new THREE.Clock();
    let lastCountsTime = 0;
    let lastMovementCheck = { time: 0, movingCars: 0 };
    let deadlockRecoveryAttempts = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();
      updatePedestrians(now, dt);
      updateSignalPhase(now);
      updateRemainingTime(now);
      setSignalLights();

      // Deadlock detection: Check if any cars are moving
      if (now - lastMovementCheck.time > 2000) {
        const movingCars = carsRef.current.filter(car => car.speed > 0.5).length;
        const totalCars = carsRef.current.length;
        
        // If no cars moving for 4+ seconds and we have cars, force recovery
        if (movingCars === 0 && totalCars > 0 && lastMovementCheck.movingCars === 0) {
          console.log("[Deadlock Detection] No movement detected, forcing recovery...", deadlockRecoveryAttempts);
          
          // Force signal transition if stuck
          const phase = signalPhaseRef.current;
          if (phase === "CLEARING" || phase === "ALL_RED") {
            // Force transition to GREEN for next direction
            const currentDirectionIndex = SIGNAL_CYCLE_ORDER.indexOf(activeSignalRef.current);
            cycleIndexRef.current = (currentDirectionIndex + 1) % SIGNAL_CYCLE_ORDER.length;
            const nextDirection = SIGNAL_CYCLE_ORDER[cycleIndexRef.current];
            desiredSignalRef.current = nextDirection;
            previousSignalRef.current = nextDirection;
            activeSignalRef.current = nextDirection;
            greenDurationMsRef.current = calculateGreenDurationMs(nextDirection);
            signalPhaseRef.current = "GREEN";
            signalTransitionStartRef.current = now;
            lastSignalChangeRef.current = now;
            intersectionEmptySinceRef.current = now;
            setTrafficData((prev) => ({
              ...prev,
              activeSignal: nextDirection,
              phase: "GREEN",
            }));
          }
          
          // Reset intersection tracking to allow movement
          intersectionCarsRef.current = [];
          intersectionEmptySinceRef.current = now;
          
          deadlockRecoveryAttempts++;
        }
        
        lastMovementCheck = { time: now, movingCars };
      }

      const orbitRadius = 30;
      const orbitSpeed = 0.00012;
      const angle = now * orbitSpeed;
      camera.position.set(Math.cos(angle) * orbitRadius, 19, Math.sin(angle) * orbitRadius);
      camera.lookAt(0, 2.5, 0);

      updateCarsByDirection("north", dt, now);
      updateCarsByDirection("south", dt, now);
      updateCarsByDirection("east", dt, now);
      updateCarsByDirection("west", dt, now);
      updateSpeedBoards(now, dt);
      removeOutOfBoundsCars();

      if (now - lastCountsTime > 1000) {
        sendTrafficCounts();
        lastCountsTime = now;
      }

      renderer.render(scene, camera);
    };

    const initialSignal = normalizeActiveSignal(activeSignalRef.current, "north");
    cycleIndexRef.current = Math.max(0, SIGNAL_CYCLE_ORDER.indexOf(initialSignal));
    greenDurationMsRef.current = calculateGreenDurationMs(initialSignal);
    activeSignalRef.current = initialSignal;
    desiredSignalRef.current = initialSignal;
    previousSignalRef.current = initialSignal;
    signalPhaseRef.current = "GREEN";
    signalTransitionStartRef.current = performance.now();
    intersectionEmptySinceRef.current = performance.now();
    setTrafficData((prev) => ({
      ...prev,
      activeSignal: initialSignal,
      phase: "GREEN",
      emergencyActive: false,
      emergencyDirection: "-",
    }));
    setRemainingTime(Math.ceil(greenDurationMsRef.current / 1000));
    setSignalLights();
    startSpawning();
    startPedestrianSpawning();
    animate();

    const handleResize = () => {
      const nextWidth = mountNode?.clientWidth || window.innerWidth;
      const nextHeight = mountNode?.clientHeight || window.innerHeight;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      Object.values(spawnTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      spawnTimersRef.current = {};
      pedestrianSpawnTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      pedestrianSpawnTimersRef.current = [];
      socket.disconnect();
      carsRef.current.forEach((car) => scene.remove(car.mesh));
      carsRef.current = [];
      pedestriansRef.current.forEach((pedestrian) => scene.remove(pedestrian.group));
      pedestriansRef.current = [];
      Object.values(speedBoardsRef.current).forEach((board) => {
        if (!board) return;
        scene.remove(board.group);
        board.texture.dispose();
      });
      speedBoardsRef.current = {};
      window.removeEventListener("resize", handleResize);
      if (mountNode && renderer.domElement.parentElement === mountNode) {
        mountNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="app">
      <div className="main-simulation">
        <section className="simulationSection">
          <div className="overlay">
            <h2>Smart Traffic Monitor</h2>
            <p>North: {trafficData.north}</p>
            <p>South: {trafficData.south}</p>
            <p>East: {trafficData.east}</p>
            <p>West: {trafficData.west}</p>
            <p>Active Signal: {trafficData.activeSignal}</p>
            <p>Phase: {trafficData.phase}</p>
            <p>Emergency: {trafficData.emergencyActive ? "ACTIVE" : "IDLE"}</p>
            <p>Emergency Dir: {trafficData.emergencyDirection}</p>
            <p>Remaining Time: {remainingTime}s</p>
            <p>Cars In Intersection: {trafficData.carsInIntersection}</p>
          </div>
          <div ref={mountRef} className="canvasMount" />
        </section>
      </div>

      <div className="detection-demo-section">
        <section className="detectionSection">
          <h2>AI Object Detection Demo</h2>
          <div className="detectionGrid">
            {DIRECTIONS.map((direction) => (
              <DetectionDemoPanel key={direction} direction={direction} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
