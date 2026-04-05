import { useState } from "react";

const DiagramNode = ({ title, items, accent = "#C9A84C", glow = false, style = {} }) => (
  <div style={{
    background: "linear-gradient(145deg, #1a1a1a, #0d0d0d)",
    border: `1.5px solid ${accent}`,
    borderRadius: "12px",
    padding: "20px 28px",
    minWidth: "260px",
    boxShadow: glow
      ? `0 0 30px ${accent}55, 0 0 60px ${accent}22, inset 0 1px 0 ${accent}33`
      : `0 4px 24px #00000088, inset 0 1px 0 ${accent}22`,
    position: "relative",
    ...style,
  }}>
    <div style={{
      fontFamily: "'Cinzel', serif",
      fontSize: "1.15rem",
      fontWeight: 700,
      color: accent,
      letterSpacing: "0.06em",
      marginBottom: items.length ? "14px" : 0,
      textShadow: `0 0 12px ${accent}88`,
    }}>{title}</div>
    {items.map((item, i) => (
      <div key={i} style={{
        fontFamily: "'Lato', sans-serif",
        fontSize: "0.88rem",
        color: "#c8c8c8",
        padding: "5px 0",
        borderTop: i === 0 ? `1px solid ${accent}33` : "none",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, opacity: 0.7, flexShrink: 0 }} />
        {item}
      </div>
    ))}
  </div>
);

const Arrow = ({ label }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "4px 0" }}>
    <div style={{ width: 2, height: 18, background: "linear-gradient(to bottom, #C9A84C88, #C9A84C)" }} />
    {label && (
      <div style={{
        fontFamily: "'Lato', sans-serif",
        fontSize: "0.7rem",
        color: "#C9A84C",
        background: "#111",
        border: "1px solid #C9A84C44",
        borderRadius: 4,
        padding: "2px 8px",
        margin: "2px 0",
        letterSpacing: "0.08em",
      }}>{label}</div>
    )}
    <div style={{ width: 2, height: 18, background: "linear-gradient(to bottom, #C9A84C, #C9A84C88)" }} />
    <div style={{
      width: 0, height: 0,
      borderLeft: "7px solid transparent",
      borderRight: "7px solid transparent",
      borderTop: "12px solid #C9A84C",
    }} />
  </div>
);

export default function GPUDiagram() {
  const [hovered, setHovered] = useState(null);

  const containerLibs = [
    { name: "cuDF", color: "#4CA8C9", desc: "GPU DataFrames" },
    { name: "cuML", color: "#C94C7A", desc: "ML Algorithms" },
    { name: "cuGraph", color: "#7AC94C", desc: "Graph Analytics" },
    { name: "RAPIDS", color: "#C9844C", desc: "Data Science Suite" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080808",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      fontFamily: "sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet" />

      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: "1.6rem",
          fontWeight: 700,
          color: "#C9A84C",
          letterSpacing: "0.12em",
          textShadow: "0 0 20px #C9A84C66",
          marginBottom: 8,
        }}>NVIDIA GPU CONTAINER ARCHITECTURE</div>
        <div style={{
          fontFamily: "'Lato', sans-serif",
          fontSize: "0.8rem",
          color: "#666",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}>Hardware · Runtime · Application Stack</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>

        <div style={{ marginBottom: 0 }}>
          <div style={{
            fontFamily: "'Lato', sans-serif",
            fontSize: "0.65rem",
            color: "#C9A84C99",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            textAlign: "center",
            marginBottom: 8,
          }}>HARDWARE LAYER</div>
          <DiagramNode
            title="NVIDIA GPU"
            accent="#C9A84C"
            glow
            items={[
              "CUDA Cores — Parallel compute units",
              "Tensor Cores — AI/ML acceleration",
              "GPU Memory (VRAM) — High-bandwidth memory",
              "NVLink — Multi-GPU interconnect",
            ]}
          />
        </div>

        <Arrow label="PCIe / NVLink" />

        <div>
          <div style={{
            fontFamily: "'Lato', sans-serif",
            fontSize: "0.65rem",
            color: "#7AB4C999",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            textAlign: "center",
            marginBottom: 8,
          }}>DRIVER LAYER</div>
          <DiagramNode
            title="NVIDIA Driver"
            accent="#7AB4C9"
            items={[
              "Kernel Mode Driver — Hardware abstraction",
              "User Mode Driver — API implementation",
              "CUDA Runtime — Device management",
            ]}
          />
        </div>

        <Arrow label="driver API" />

        <div>
          <div style={{
            fontFamily: "'Lato', sans-serif",
            fontSize: "0.65rem",
            color: "#A084C999",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            textAlign: "center",
            marginBottom: 8,
          }}>TOOLKIT LAYER</div>
          <DiagramNode
            title="NVIDIA Container Toolkit"
            accent="#A084C9"
            items={[
              "Container Runtime Hook — GPU injection",
              "GPU Passthrough — Device forwarding",
              "nvidia-smi — GPU monitoring",
              "libnvidia-container — Core library",
            ]}
          />
        </div>

        <Arrow label="GPU passthrough" />

        <div style={{
          background: "linear-gradient(145deg, #111, #0a0a0a)",
          border: "1.5px solid #4C84C9",
          borderRadius: "14px",
          padding: "20px",
          minWidth: "320px",
          boxShadow: "0 0 30px #4C84C944, inset 0 1px 0 #4C84C922",
        }}>
          <div style={{
            fontFamily: "'Lato', sans-serif",
            fontSize: "0.65rem",
            color: "#4C84C999",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            textAlign: "center",
            marginBottom: 12,
          }}>CONTAINER LAYER</div>
          <div style={{
            fontFamily: "'Cinzel', serif",
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "#4C84C9",
            textAlign: "center",
            marginBottom: 16,
            textShadow: "0 0 12px #4C84C988",
          }}>Docker Container</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {containerLibs.map((lib) => (
              <div
                key={lib.name}
                onMouseEnter={() => setHovered(lib.name)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: hovered === lib.name ? `${lib.color}22` : "#0d0d0d",
                  border: `1px solid ${lib.color}${hovered === lib.name ? "88" : "44"}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  cursor: "default",
                  transition: "all 0.2s ease",
                  boxShadow: hovered === lib.name ? `0 0 16px ${lib.color}33` : "none",
                }}>
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: lib.color,
                  marginBottom: 3,
                }}>{lib.name}</div>
                <div style={{
                  fontFamily: "'Lato', sans-serif",
                  fontSize: "0.7rem",
                  color: "#888",
                }}>{lib.desc}</div>
              </div>
            ))}
          </div>

          <div style={{
            fontFamily: "'Lato', sans-serif",
            fontSize: "0.75rem",
            color: "#666",
            textAlign: "center",
            borderTop: "1px solid #4C84C933",
            paddingTop: 10,
          }}>
            CUDA Toolkit · cuDNN · TensorRT
          </div>
        </div>

        <Arrow label="user API" />

        <div>
          <div style={{
            fontFamily: "'Lato', sans-serif",
            fontSize: "0.65rem",
            color: "#C94C7A99",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            textAlign: "center",
            marginBottom: 8,
          }}>APPLICATION LAYER</div>
          <DiagramNode
            title="User Application"
            accent="#C94C7A"
            items={[
              "Python / PyTorch / TensorFlow",
              "ML Training & Inference",
              "Data Processing Pipelines",
            ]}
          />
        </div>

      </div>

      <div style={{
        display: "flex",
        gap: 24,
        marginTop: 48,
        padding: "14px 24px",
        background: "#0f0f0f",
        border: "1px solid #222",
        borderRadius: 10,
        flexWrap: "wrap",
        justifyContent: "center",
      }}>
        {[
          { color: "#C9A84C", label: "Hardware" },
          { color: "#7AB4C9", label: "Driver" },
          { color: "#A084C9", label: "Toolkit" },
          { color: "#4C84C9", label: "Container" },
          { color: "#C94C7A", label: "Application" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}88` }} />
            <span style={{ fontFamily: "'Lato', sans-serif", fontSize: "0.75rem", color: "#888", letterSpacing: "0.1em" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}