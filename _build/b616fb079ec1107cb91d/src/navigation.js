const routes = new Set(['observe', 'refactor', 'verify']);

export function routeFor(hash) {
  if (!hash) return 'observe';
  if (!hash.startsWith('#/')) return null;
  const route = hash.slice(2);
  return routes.has(route) ? route : null;
}

export class UpdateService {
  #base;
  #loaded;
  #fetch;
  #pending;
  #available;

  constructor(baseUrl, embeddedBuild, fetchVersion = globalThis.fetch.bind(globalThis)) {
    this.#base = new URL(baseUrl);
    this.#loaded = embeddedBuild;
    this.#fetch = fetchVersion;
  }

  check() {
    if (!this.#loaded || this.#loaded === 'dev') return Promise.resolve(false);
    // A focus event, BFCache restoration and navigation can arrive together.
    this.#pending ??= this.#readVersion().finally(() => { this.#pending = undefined; });
    return this.#pending;
  }

  async #readVersion() {
    const url = new URL('version.json', this.#base);
    url.searchParams.set('_t', Date.now().toString());
    try {
      const response = await this.#fetch(url, {
        cache: 'no-store',
        redirect: 'error',
        credentials: 'same-origin',
        signal: AbortSignal.timeout(3000)
      });
      if (!response.ok) throw new Error('Version unavailable');
      const { build } = await response.json();
      if (typeof build !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(build)) {
        throw new Error('Invalid build identity');
      }
      this.#available = build === this.#loaded ? undefined : build;
    } catch {
      this.#available = undefined;
    }
    return Boolean(this.#available);
  }

  targetUrl(input) {
    const target = new URL(input, this.#base);
    if (target.origin !== this.#base.origin) throw new TypeError('Expected a same-origin navigation');
    if (this.#available) {
      // Change the document URL even if an intermediary served an old shell for this build.
      if (this.#base.searchParams.get('__build') === this.#available) {
        target.searchParams.set('__refresh', Date.now().toString());
      }
      target.searchParams.set('__build', this.#available);
    }
    return target.href;
  }
}
