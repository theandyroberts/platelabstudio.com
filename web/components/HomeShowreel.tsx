"use client";

import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import { Pause, Play } from "@phosphor-icons/react";
import { heroSources, heroStartupFiles } from "@/lib/browserPreview";
import { hasSource, prefersNoAutoplay, useAdaptiveVideo } from "@/lib/adaptiveVideo";
import styles from "./HomeShowreel.module.css";

const sources = heroSources();
const POSTER = "/media/site/mustang-study14-reflections-poster.jpg";

export function HomeShowreel() {
  // The poster is the first thing seen; the playlists are the first thing played.
  preload(POSTER, { as: "image", fetchPriority: "high" });
  for (const file of heroStartupFiles(sources)) preload(file, { as: "fetch", crossOrigin: "anonymous" });
  const video = useRef<HTMLVideoElement>(null);
  const section = useRef<HTMLElement>(null);
  const [playing, setPlaying] = useState(false);
  // What the visitor last asked for; scrolling and tab changes never override it.
  const wanted = useRef(true);
  const onScreen = useRef(true);
  const shouldPlay = () => wanted.current && onScreen.current && !document.hidden;
  const adaptive = useAdaptiveVideo(video, sources, {
    capToPlayerSize: true,
    onSourceAttached: () => { if (shouldPlay()) play(); },
  });

  function play() {
    const media = video.current;
    // While a source is being attached, onSourceAttached starts playback instead.
    if (!media || !hasSource(media)) return;
    media.muted = true;
    if (media.error) adaptive.current?.retry();
    void media.play()
      .then(() => setPlaying(!media.paused))
      .catch(() => setPlaying(!media.paused));
  }

  useEffect(() => {
    wanted.current = !prefersNoAutoplay();
    // The reel only decodes and downloads while someone can see it.
    const sync = () => {
      const media = video.current;
      if (!media) return;
      if (shouldPlay()) play();
      else media.pause();
    };
    const observer = new IntersectionObserver(
      (entries) => { onScreen.current = entries[0].isIntersecting; sync(); },
      { threshold: 0.2 },
    );
    if (section.current) observer.observe(section.current);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const media = video.current;
    if (!media) return;
    wanted.current = media.paused;
    if (media.paused) play();
    else media.pause();
  };

  const label = playing ? "Pause showreel" : "Play showreel";
  return (
    <section ref={section} className={styles.showreel} aria-label="Plate Lab showreel">
      <video
        ref={video}
        // Without a ladder the browser can start on the single file before hydration.
        src={sources.adaptive ? undefined : sources.progressive}
        poster={POSTER}
        width={1920}
        height={1080}
        muted
        loop
        playsInline
        preload="auto"
        aria-label="Plate Lab showreel"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button
        type="button"
        className={styles.playback}
        aria-label={label}
        title={label}
        onClick={toggle}
      >
        {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
      </button>
    </section>
  );
}
