import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readSceneLibrary } from '@/lib/sceneLibrary';
import { ProjectsOverview } from '@/components/ProjectsOverview';
import type { ProjectOverviewData } from '@/lib/projectOverview';
export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/projects');
  const result = await readSceneLibrary(supabase, '');
  const data = result.status === 200 ? result.body as ProjectOverviewData : null;
  return <main className="workspace-shell">
    <header className="lab-task-header"><h1>Projects</h1><Link href="/projects/new" className="primary-button">+ New project</Link></header>
    {!data ? <p className="auth-alert error">Your projects could not be loaded. Please refresh and try again.</p>
      : data.projects.length ? <ProjectsOverview {...data} />
      : <section className="workspace-empty"><h2>Start your plate plan.</h2><p>Create a project, add scenes, and choose the plates for each shot.</p><Link href="/projects/new" className="primary-button inline-cta">Create your first project</Link></section>}
  </main>;
}
