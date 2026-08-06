"use client";

import { useEffect, useState } from "react";

interface ScoreRingProps {
  score: number | null;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const SIZES = {
  sm: { box: 44, ring: 36, stroke: 3, font: "text-sm" },
  md: { box: 72, ring: 60, stroke: 5, font: "text-xl" },
  lg: { box: 120, ring: 100, stroke: 7, font: "text-3xl" },
};

export default function ScoreRing({ score, size = "md", label }: ScoreRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const s = SIZES[size];

  useEffect(() => {
    if (score == null) return;
    const duration = 800;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedScore(Math.round(score * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const displayScore = score == null ? null : animatedScore;
  const radius = s.ring / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = score == null ? 0 : circumference - (score / 100) * circumference;

  const color = score == null
    ? "#64748b"
    : score >= 80
    ? "#10b981"
    : score >= 50
    ? "#f59e0b"
    : "#ef4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: s.box, height: s.box }}>
      <svg width={s.box} height={s.box} className="-rotate-90">
        <circle
          cx={s.box / 2}
          cy={s.box / 2}
          r={radius}
          fill="none"
          stroke="rgba(56, 78, 122, 0.2)"
          strokeWidth={s.stroke}
        />
        <circle
          cx={s.box / 2}
          cy={s.box / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={s.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.2s",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {displayScore != null ? (
          <>
            <span className={`${s.font} font-bold text-fp-text tabular-nums`}>{displayScore}</span>
            {size !== "sm" && (
              <span className="text-xs text-fp-text-dim">/ 100</span>
            )}
          </>
        ) : (
          <span className="text-fp-text-dim text-xs">—</span>
        )}
      </div>
      {label && size !== "sm" && (
        <span className="absolute -bottom-6 text-xs text-fp-text-dim uppercase tracking-wide whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  );
}
