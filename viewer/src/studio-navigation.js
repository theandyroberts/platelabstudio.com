// Navigation stays scoped to the signed-in user's scene library (the API enforces RLS).
export function sceneDestination(scene, previews) {
  const clips = previews.filter(clip => clip.sceneId === scene.id)
  const clip = clips.find(item => item.chosen) || clips[0]
  if (clip?.studioHref?.startsWith('/stage?')) return clip.studioHref
  return `/browse?${new URLSearchParams({ scene: scene.id, q: scene.name, details: '1' })}`
}

export function studioNavigationItems(library, context) {
  const projects = library.projects || []
  const scenes = (library.scenes || []).filter(scene => projects.some(project => project.id === scene.projectId))
  const previews = library.scenePreviews || []
  return {
    projects: projects.filter(project => project.id !== context.projectId).map(project => {
      const scene = scenes.find(scene => scene.projectId === project.id)
      return { ...project, href: scene ? sceneDestination(scene, previews) : `/projects/${encodeURIComponent(project.id)}` }
    }),
    sceneGroups: projects.map(project => ({ ...project, scenes: scenes.filter(scene => scene.projectId === project.id && scene.id !== context.sceneId).map(scene => ({ ...scene, href: sceneDestination(scene, previews) })) })).filter(project => project.scenes.length),
    clips: previews.filter(clip => clip.sceneId === context.sceneId).map(clip => ({ ...clip, current: context.sceneClipId ? clip.id === context.sceneClipId : clip.sku === context.sku })),
  }
}

export function installStudioNavigation(root) {
  const doc = root.ownerDocument
  const thumbRow = root.querySelector('#contextPlates')
  const menus = [...root.querySelectorAll('.context-goto')].map(wrapper => {
    const button = wrapper.querySelector('button')
    const panel = wrapper.querySelector('nav')
    let pinned = false
    const close = () => { pinned = false; panel.hidden = true; button.setAttribute('aria-expanded', 'false') }
    const open = () => {
      menus.forEach(menu => { if (menu.panel !== panel) menu.close() })
      panel.hidden = false; button.setAttribute('aria-expanded', 'true')
    }
    wrapper.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') open() })
    wrapper.addEventListener('pointerleave', () => { if (!pinned && !wrapper.contains(doc.activeElement)) close() })
    button.addEventListener('click', () => { if (pinned) close(); else { open(); pinned = true } })
    wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget)) close() })
    wrapper.addEventListener('keydown', event => {
      if (event.key === 'Escape') { close(); button.focus(); event.stopPropagation() }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); open()
        const links = [...panel.querySelectorAll('a,button')]
        const index = links.indexOf(doc.activeElement)
        const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length
        links[next]?.focus()
      }
    })
    return { wrapper, panel, close }
  })
  doc.addEventListener('pointerdown', event => menus.forEach(menu => { if (!menu.wrapper.contains(event.target)) menu.close() }))
  const text = (parent, message) => { const p = doc.createElement('p'); p.textContent = message; parent.append(p) }
  const link = (parent, label, href) => {
    const a = doc.createElement('a'); a.textContent = label; a.href = href; a.target = '_top'; parent.append(a); return a
  }
  let currentContext, requestId = 0
  async function refresh(context) {
    currentContext = context
    const id = ++requestId
    thumbRow.replaceChildren()
    menus.forEach(({ panel }) => { panel.replaceChildren(); text(panel, 'Loading…') })
    try {
      const response = await fetch('/api/scene-library', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000) })
      const library = await response.json()
      if (id !== requestId) return
      if (!response.ok) throw new Error('Could not load navigation.')
      menus.forEach(({ panel }) => panel.replaceChildren())
      if (!library.authenticated) {
        menus.forEach(({ panel }) => { text(panel, 'Sign in to see your projects and scenes.'); link(panel, 'Log in', `/login?next=${encodeURIComponent('/projects')}`) })
        return
      }
      const items = studioNavigationItems(library, context)
      items.clips.forEach(clip => {
        if (!clip.studioHref?.startsWith('/stage?')) return
        const a = doc.createElement('a'); a.href = clip.studioHref; a.target = '_top'; a.className = 'context-plate'
        a.setAttribute('aria-label', `${clip.current ? 'Current plate' : 'Open plate'} ${clip.sku}`)
        if (clip.current) a.setAttribute('aria-current', 'page')
        const img = doc.createElement('img'); img.src = clip.poster; img.alt = ''; img.loading = 'lazy'; a.append(img); thumbRow.append(a)
      })
      items.projects.forEach(project => link(menus[0].panel, project.name, project.href))
      if (!items.projects.length) text(menus[0].panel, 'No other projects yet.')
      items.sceneGroups.forEach(project => {
        const group = doc.createElement('section'); const heading = doc.createElement('h2'); heading.textContent = project.name; group.append(heading)
        project.scenes.forEach(scene => link(group, scene.name, scene.href)); menus[1].panel.append(group)
      })
      if (!items.sceneGroups.length) text(menus[1].panel, 'No other scenes yet.')
    } catch {
      if (id !== requestId) return
      menus.forEach(({ panel }) => {
        panel.replaceChildren(); text(panel, 'Navigation could not be loaded.')
        const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry'; retry.addEventListener('click', () => refresh(currentContext)); panel.append(retry)
      })
    }
  }
  return { update(context) {
    if (JSON.stringify(context) === JSON.stringify(currentContext)) return
    if (!context.projectId || !context.sceneId || root.hidden) { ++requestId; currentContext = null; thumbRow.replaceChildren(); menus.forEach(menu => menu.close()); return }
    refresh(context)
  } }
}
