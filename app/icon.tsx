import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#141414",
          borderRadius: 6,
        }}
      >
        <svg viewBox="0 0 32 32" width="22" height="22" fill="#C4552D">
          <path d="M3 3h26v26h-9V18h-8v11H3V3Z" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
