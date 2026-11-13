import { sceneDetailsHref, type SearchScene, type ScenePreview } from './sceneSearch';

export type ProjectOverviewData = {
  projects: Array<{ id: string; name: string }>;
  scenes: SearchScene[];
  scenePreviews: ScenePreview[];
};

export function projectOverview(data: ProjectOverviewData) {
  return data.projects.map(project => {
    const scenes = data.scenes.filter(scene => scene.projectId === project.id).map(scene => {
      const clips = data.scenePreviews.filter(clip => clip.sceneId === scene.id);
      const chosen = clips.find(clip => clip.chosen);
      return { ...scene, clips, chosen, href: sceneDetailsHref(scene) };
    });
    return {
      ...project, scenes,
      complete: scenes.length > 0 && scenes.every(scene => !!scene.chosen),
      chosenCount: scenes.filter(scene => !!scene.chosen).length,
      href: scenes[0]?.href ?? `/projects/${project.id}`,
    };
  });
}
