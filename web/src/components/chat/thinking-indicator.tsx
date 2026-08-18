"use client";

import { useEffect, useState } from "react";

const phrases = [
  "Thinking",
  "Digging through the docs",
  "Cooking",
  "Connecting the dots",
  "Percolating",
  "Searching the archives",
  "Reticulating splines",
  "Chasing down sources"
];

export function ThinkingIndicator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((current) => (current + 1) % phrases.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      <span
        className="animate-shimmer bg-clip-text text-base font-medium text-transparent [background-image:linear-gradient(110deg,var(--muted-foreground)_35%,var(--primary)_50%,var(--muted-foreground)_65%)]"
        key={index}
      >
        {phrases[index]}…
      </span>
    </div>
  );
}
