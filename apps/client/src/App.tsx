import { tables } from "@game/bindings";
import { fromScaled } from "@game/shared";
import { Canvas } from "@react-three/fiber";
import { useSpacetimeDB, useTable } from "spacetimedb/react";

export default function App() {
  const { isActive } = useSpacetimeDB();
  const [markers] = useTable(tables.marker);

  return (
    <>
      <div style={{ position: "absolute", zIndex: 1, padding: 8, color: "white" }}>
        {isActive ? `connected · ${markers.length} marker(s)` : "connecting…"}
      </div>
      <Canvas camera={{ position: [3, 3, 3] }} style={{ background: "#1b1b24" }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 3]} />
        {markers.map((marker) => (
          <mesh
            key={marker.id}
            position={[fromScaled(marker.x), fromScaled(marker.y), fromScaled(marker.z)]}
          >
            <boxGeometry />
            <meshStandardMaterial color="orange" />
          </mesh>
        ))}
      </Canvas>
    </>
  );
}
