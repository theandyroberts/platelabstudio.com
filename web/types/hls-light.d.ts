// The light build ships without its own declarations; its API is the same
// minus subtitles, alternate audio and DRM, none of which the site uses.
declare module 'hls.js/light' {
  export * from 'hls.js';
  export { default } from 'hls.js';
}
