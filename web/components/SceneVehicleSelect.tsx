"use client";
import { useEffect, useState } from "react";
import { parseSceneVehicle, type SceneVehicle } from "@/lib/sceneConfiguration";

export const CURRENT_VEHICLE_KEY = "plateLabCurrentVehicle";
const modelVehicles: Record<string, SceneVehicle> = { ferrari: "sports_car", bmwM5: "sedan", escalade: "suv" };
export function SceneVehicleSelect({ value, form, onChange, disabled }: { value?: string; form?: string; onChange?: (value: SceneVehicle) => void; disabled?: boolean }) {
  const [vehicle, setVehicle] = useState<SceneVehicle>(value ? parseSceneVehicle(value) : "sports_car");
  useEffect(() => {
    if (value) { setVehicle(parseSceneVehicle(value)); return; }
    try {
      const current = localStorage.getItem(CURRENT_VEHICLE_KEY);
      if (current) { const selected = modelVehicles[current] || parseSceneVehicle(current); setVehicle(selected); onChange?.(selected); }
    } catch { /* Storage may be disabled. Keep the Lab's default vehicle. */ }
  }, [value]);
  return <select name="vehicle" aria-label="Vehicle" form={form} required disabled={disabled} value={vehicle} onChange={event => {
    const selected = parseSceneVehicle(event.target.value);
    setVehicle(selected);
    onChange?.(selected);
    try { localStorage.setItem(CURRENT_VEHICLE_KEY, selected); } catch { /* Optional preference. */ }
  }}>
    <option value="sports_car">Ferrari · sports car</option>
    <option value="sedan">BMW M5 · sedan</option>
    <option value="suv">Escalade · SUV</option>
    <option value="none">No vehicle</option>
    <option value="undecided">Undecided</option>
  </select>;
}
