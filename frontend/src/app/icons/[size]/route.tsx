import { ImageResponse } from "next/og";
import { LOGO_DOOR, LOGO_GRADIENT, LOGO_KNOB, LOGO_KNOCKS } from "@/components/LogoMark";

const SIZES = [32, 180, 192, 512];

// App icons for the manifest and iOS home screen, drawn on demand: /icons/192.
// Full-bleed (no rounded corners): the OS applies its own icon mask.
export async function GET(_request: Request, { params }: RouteContext<"/icons/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.includes(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: `linear-gradient(135deg, ${LOGO_GRADIENT[0]}, ${LOGO_GRADIENT[1]})`,
        }}
      >
        <svg viewBox="0 0 64 64" width={size} height={size}>
          <path d={LOGO_DOOR} fill="#fff" />
          <circle {...LOGO_KNOB} fill={LOGO_GRADIENT[0]} />
          <path d={LOGO_KNOCKS[0]} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <path
            d={LOGO_KNOCKS[1]}
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.65"
          />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
