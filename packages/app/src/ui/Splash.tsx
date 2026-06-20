/**
 * Opening splash — pixel-faithful to the Hi-Fi mockup: a violet bloom backdrop,
 * the floating "breathing mark" (rounded-square + bubble logo), the gradient
 * Jemaw wordmark, the Amharic ጀማው subtitle, and the 3-arc branded loader.
 * Shown while the group context loads, and as the no-context landing.
 */
import { Loader } from "../motion/Loader.js";
import { useReducedMotion } from "../motion/useReducedMotion.js";

export function Splash({
  title = "Jemaw",
  subtitle,
  hint,
}: {
  title?: string;
  subtitle?: string;
  hint?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        paddingBottom: 60,
        background: "#0B0A11",
        overflow: "hidden",
      }}
    >
      {/* backdrop bloom (radial, top-center) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 75% at 50% -8%, rgba(110,89,199,.34), transparent 58%)",
          pointerEvents: "none",
        }}
      />
      {/* two blurred decorative orbs */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -70,
          left: -50,
          width: 240,
          height: 240,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(110,89,199,.30), transparent 65%)",
          filter: "blur(28px)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 130,
          right: -70,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(168,156,227,.20), transparent 65%)",
          filter: "blur(28px)",
          pointerEvents: "none",
        }}
      />

      {/* breathing mark — floating rounded square with the bubble logo */}
      <div
        aria-hidden
        style={{
          position: "relative",
          width: 128,
          height: 128,
          borderRadius: 36,
          overflow: "hidden",
          background:
            "linear-gradient(150deg,#3B2C84 0%,#6E59C7 60%,#8A78D6 100%)",
          boxShadow:
            "0 30px 70px -18px rgba(110,89,199,.7), inset 0 1px 0 rgba(255,255,255,.2)",
          animation: reduced ? undefined : "jemaw-float 7s ease-in-out infinite",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(90px 70px at 70% 16%, rgba(255,255,255,.3), transparent 70%)",
          }}
        />
        <svg
          viewBox="0 0 100 100"
          style={{
            position: "absolute",
            inset: 22,
            animation: reduced
              ? undefined
              : "jemaw-breathe 5.5s ease-in-out infinite",
          }}
        >
          <circle cx="50" cy="40" r="23" fill="#F2EFFA" opacity=".94" style={{ mixBlendMode: "screen" }} />
          <circle cx="37" cy="62" r="23" fill="#C8BFEF" opacity=".94" style={{ mixBlendMode: "screen" }} />
          <circle cx="63" cy="62" r="23" fill="#A99CE3" opacity=".94" style={{ mixBlendMode: "screen" }} />
        </svg>
      </div>

      {/* wordmark block */}
      <div style={{ position: "relative", textAlign: "center" }}>
        <div
          style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontWeight: 800,
            fontSize: 54,
            lineHeight: 0.9,
            letterSpacing: "-0.04em",
            background: "linear-gradient(125deg,#F4F2FB 0%,#A99CE3 130%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {title}
        </div>
        <div
          className="t-amharic"
          style={{ fontSize: 24, color: "#8A78D6", marginTop: 8 }}
        >
          ጀማው
        </div>
        {subtitle && (
          <div
            style={{ fontSize: 14, color: "rgba(244,242,251,.55)", marginTop: 14 }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* branded loader */}
      <div style={{ position: "relative", marginTop: 6 }}>
        <Loader size={44} />
      </div>

      {/* bottom hint */}
      {hint && (
        <div
          style={{
            position: "absolute",
            bottom: 34,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 12,
            color: "rgba(244,242,251,.3)",
            padding: "0 40px",
            lineHeight: 1.5,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
