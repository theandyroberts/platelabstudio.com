'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { stitchStatus } from '@platelab/shared';
import { projectOverview, type ProjectOverviewData } from '@/lib/projectOverview';
import styles from './ProjectsOverview.module.css';

function Completion({ complete, label }: { complete: boolean; label: string }) {
  return <span className={styles.status} data-complete={complete} aria-label={complete ? label : 'No complete selection'}>{complete ? '✓' : '—'}</span>;
}

export function ProjectsOverview(data: ProjectOverviewData) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  async function addToOrder(projectId: string, sceneId?: string) {
    setPending(sceneId || projectId); setFeedback(''); setFailed(false);
    try {
      const response = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sceneId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your order could not be updated. Please retry.');
      setFeedback(result.addedCount ? `${result.addedCount} chosen ${result.addedCount === 1 ? 'plate added' : 'plates added'} to your order.` : 'All chosen plates are already in your order.');
      window.dispatchEvent(new Event('platelab-order-updated'));
      startTransition(() => router.refresh());
    } catch (error) { setFailed(true); setFeedback(error instanceof Error ? error.message : 'Please retry.'); }
    finally { setPending(null); }
  }
  const busy = !!pending || refreshing;
  return <section className={styles.overview} aria-label="Your projects">
    {feedback && <p role={failed ? 'alert' : 'status'} className={styles.feedback} data-error={failed}>{feedback}</p>}
    {projectOverview(data).map(project => <article className={styles.project} key={project.id} aria-label={project.name}>
      <div className={styles.projectRow}>
        <Link href={project.href} className={styles.rowLink} aria-label={`Open project ${project.name}`}>
          <Completion complete={project.complete} label="All scenes have a chosen plate" />
          <span className={styles.identity}><span className={styles.eyebrow}>Project</span><strong>{project.name}</strong></span>
          <span className={styles.count}>{project.chosenCount}/{project.scenes.length} scenes chosen <span aria-hidden="true">→</span></span>
        </Link>
        <button className={styles.orderButton} disabled={busy || !project.chosenCount} onClick={() => addToOrder(project.id)}>{pending === project.id ? 'Adding…' : 'Add all chosen to order'}</button>
      </div>
      {project.scenes.map(scene => <section className={styles.scene} key={scene.id} aria-label={`Scene ${scene.name}`}>
        <div className={styles.sceneRow}>
          <Link href={scene.href} className={styles.rowLink} aria-label={`Open scene ${scene.name}`}>
            <Completion complete={!!scene.chosen} label="Scene has a chosen plate" />
            <span className={styles.identity}><span className={styles.eyebrow}>Scene</span><strong>{scene.name}</strong></span>
            <span className={styles.count}>{scene.clips.length} {scene.clips.length === 1 ? 'plate' : 'plates'} <span aria-hidden="true">→</span></span>
          </Link>
          <button className={styles.orderButton} disabled={busy || !scene.chosen} onClick={() => addToOrder(project.id, scene.id)}>{pending === scene.id ? 'Adding…' : 'Add chosen to order'}</button>
        </div>
        {scene.clips.length ? <div className={styles.clips}>
          {scene.clips.map(clip => <Link className={styles.clip} href={clip.studioHref} key={clip.id} data-chosen={clip.chosen} aria-label={`Open ${clip.sku} in Lab${clip.chosen ? ', chosen plate' : ''}`}>
            <span className={`${styles.thumbnail} stitch-surface`} data-stitch-status={stitchStatus(clip.stitchStatus)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={clip.poster} alt="" loading="lazy" />
              {clip.chosen && <span className={styles.chosenMark} aria-label="Chosen">✓</span>}
            </span>
            <span className={styles.sku}>{clip.sku}</span>
            <span className={styles.title} title={clip.title}>{clip.title}</span>
            {(clip.chosen || clip.inOrder) && <span className={styles.clipState}>{[clip.chosen && 'Chosen', clip.inOrder && 'In order'].filter(Boolean).join(' · ')}</span>}
          </Link>)}
        </div> : <p className={styles.empty}>No plates yet. <Link href={scene.href}>Search this scene →</Link></p>}
      </section>)}
      {!project.scenes.length && <p className={styles.empty}>No scenes yet. <Link href={`/projects/${project.id}`}>Add a scene →</Link></p>}
    </article>)}
  </section>;
}
