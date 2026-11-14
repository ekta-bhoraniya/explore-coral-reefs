/** URL for a file in public/, honouring the deploy base path (e.g. /explore-coral-reefs/ on GitHub Pages). */
export const asset = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, '');
