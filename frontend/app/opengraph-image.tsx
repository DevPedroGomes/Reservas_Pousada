import { ImageResponse } from "next/og"

/** Imagem de prévia (WhatsApp, redes sociais, anúncios). Gerada, sem arquivo. */
export const alt = "Diária: tem vaga? O mapa da sua pousada responde."
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
          background: "#b24a18",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, color: "#f4f2ed" }}>Diária</div>
        <div style={{ fontSize: 168, fontWeight: 700, color: "#f4f2ed", marginTop: 24, lineHeight: 1.05 }}>
          Tem vaga?
        </div>
        <div style={{ fontSize: 32, color: "#f6e7dc", marginTop: 32 }}>
          Reservas, Pix do sinal e equipe num lugar só. 14 dias grátis.
        </div>
      </div>
    ),
    size,
  )
}
