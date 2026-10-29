"use client";

import { type ReactNode, useEffect, useState } from "react";

type SceneInputMode = "add" | null;

type SceneInputWorkspaceProps = {
  sceneCount: number;
  sceneTable: ReactNode;
  addScenePanel: ReactNode;
};

export function SceneInputWorkspace({
  sceneCount,
  sceneTable,
  addScenePanel,
}: SceneInputWorkspaceProps) {
  const [mode, setMode] = useState<SceneInputMode>(null);

  useEffect(() => {
    if (window.location.hash === "#add-scene") setMode("add");
  }, []);

  function toggleMode(nextMode: Exclude<SceneInputMode, null>) {
    setMode((currentMode) => (currentMode === nextMode ? null : nextMode));
  }

  return (
    <section
      className={`project-detail-grid scene-workspace-grid ${
        mode === "add" ? "is-add-scene" : ""
      }`}
    >
      <div>
        <div className="section-head compact">
          <div>
            <h2>Scenes</h2>
          </div>
          <div className="scene-list-actions">
            <span className="mono dim">{sceneCount} total</span>
            <div
              className="scene-input-actions"
              role="group"
              aria-label="Add scenes"
            >
              <button
                type="button"
                className="secondary-button scene-input-button"
                aria-controls="add-scene"
                aria-expanded={mode === "add"}
                onClick={() => toggleMode("add")}
              >
                + Add scene
              </button>
            </div>
          </div>
        </div>

        {sceneTable}
      </div>

      {mode === "add" && addScenePanel}
    </section>
  );
}
