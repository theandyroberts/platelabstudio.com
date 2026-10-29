"use client";

import { useEffect, useState } from "react";
import { ArrowCounterClockwise, ArrowSquareOut, Eye, EyeSlash, FloppyDisk, SlidersHorizontal } from "@phosphor-icons/react";
import { STUDIO_CONTROL_GROUPS, STUDIO_CONTROLS, studioControlPreset } from "../../../shared/src/studio-controls.js";
import type { StudioConfig } from "@/lib/admin/studioConfig";
import { saveStudioControls } from "@/app/admin/studio-controls/actions";
import styles from "./StudioControlSettings.module.css";

export function StudioControlSettings({ initial }: { initial: StudioConfig }) {
  const [saved, setSaved] = useState(initial.controls);
  const [controls, setControls] = useState(initial.controls);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = STUDIO_CONTROLS.some(control => controls[control.id] !== saved[control.id]);
  const visible = STUDIO_CONTROLS.filter(control => controls[control.id]).length;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(next: Record<string, boolean>) { setControls(next); setMessage(""); }
  async function save() {
    setPending(true);
    setMessage("");
    try {
      const result = await saveStudioControls(controls);
      if (result.ok) { setSaved(result.config.controls); setMessage("Saved for visitors"); }
      else setMessage(result.error);
    } catch { setMessage("Connection interrupted. Settings were not confirmed saved; retry."); }
    finally { setPending(false); }
  }

  return <div className={styles.settings}>
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>Visitor experience</p><h1>360 Studio controls</h1></div>
      <a href="/stage" target="_blank" rel="noreferrer">Open Studio <ArrowSquareOut size={18} /></a>
    </div>
    <div className={styles.toolbar}>
      <button type="button" disabled={pending} onClick={() => change(studioControlPreset())}><SlidersHorizontal size={18} />Buying essentials</button>
      <button type="button" disabled={pending} onClick={() => change(studioControlPreset(true))}><Eye size={18} />Show all</button>
      <button type="button" disabled={pending} onClick={() => change(studioControlPreset(false))}><EyeSlash size={18} />Hide all</button>
      <span className={styles.count}>{visible} / {STUDIO_CONTROLS.length} visible</span>
      <button type="button" title="Discard unsaved changes" aria-label="Discard unsaved changes" disabled={pending || !dirty} onClick={() => change(saved)}><ArrowCounterClockwise size={18} /></button>
      <button type="button" className={styles.save} disabled={pending || !dirty} onClick={save}><FloppyDisk size={18} />{pending ? "Saving..." : "Save changes"}</button>
    </div>
    <p className={styles.status} role="status" aria-live="polite">{message || (dirty ? "Unsaved changes" : "Saved settings")}</p>
    <div className={styles.columns}>
      <div>
        {STUDIO_CONTROL_GROUPS.map(group => {
          const count = group.controls.filter(control => controls[control.id]).length;
          return <fieldset key={group.id} disabled={pending} className={styles.group}>
            <legend>
              <label><input type="checkbox" aria-label={`Show all ${group.label} controls`} checked={count === group.controls.length}
                ref={input => { if (input) input.indeterminate = count > 0 && count < group.controls.length; }}
                onChange={event => change({ ...controls, ...Object.fromEntries(group.controls.map(control => [control.id, event.target.checked])) })} />{group.label}</label>
              <span>{count} / {group.controls.length}</span>
            </legend>
            <div className={styles.rows}>{group.controls.map(control => <label key={control.id} className={styles.row}>
              <span>{control.label}</span><input type="checkbox" checked={controls[control.id]} onChange={event => change({ ...controls, [control.id]: event.target.checked })} />
            </label>)}</div>
          </fieldset>;
        })}
      </div>
      <aside className={styles.preview} aria-label="Visitor flyout preview">
        <h2>Visitor flyout</h2>
        {visible === 0 ? <p className={styles.empty}>Flyout hidden</p> : STUDIO_CONTROL_GROUPS.map(group => {
          const shown = group.controls.filter(control => controls[control.id]);
          return shown.length > 0 && <section key={group.id}><h3>{group.label}</h3><ul>{shown.map(control => <li key={control.id}>{control.label}</li>)}</ul></section>;
        })}
      </aside>
    </div>
  </div>;
}
