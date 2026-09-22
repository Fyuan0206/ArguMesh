// Hosting adapter for the public website only. The local Node app is unchanged.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname.startsWith('/website-assets/')) {
      return env.ASSETS.fetch(request);
    }
    return env.WORKBENCH.fetch(request);
  },
};
