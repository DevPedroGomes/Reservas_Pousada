import { ImageResponse } from "next/og"

/** Imagem de prévia (WhatsApp, redes sociais, anúncios). Gerada, sem arquivo. */
export const alt = "Diária — a recepção da sua pousada, organizada"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Imagem() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 60%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, color: "#ea580c" }}>Diária</div>
        <div style={{ fontSize: 72, fontWeight: 800, color: "#1c1917", marginTop: 24, lineHeight: 1.05 }}>
          A recepção da sua pousada, organizada.
        </div>
        <div style={{ fontSize: 32, color: "#57534e", marginTop: 32 }}>
          Reservas sem overbooking · Painel do dia · 14 dias grátis
        </div>
      </div>
    ),
    size,
  )
}
