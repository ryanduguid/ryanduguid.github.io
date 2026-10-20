// WebMCP: offer the Ozzit function reference to the browser's agent on the module pages.
// The draft spec puts modelContext on document; early Chrome builds used navigator.
// Other browsers skip the import, and a failure leaves the page untouched.
const modelContext = document.modelContext ?? navigator.modelContext;
const reference = document.querySelector('script[data-ozzit-reference]')?.dataset.ozzitReference;

if (modelContext?.registerTool && reference) {
  import('./webmcp-tools.mjs').then(async ({ ozzitTools }) => {
    let loaded;
    const load = () => (loaded ??= fetch(reference).then(response => {
      if (!response.ok) throw new Error(`Ozzit reference returned HTTP ${response.status}`);
      return response.json();
    }).catch(error => {
      loaded = undefined; // a failed load is retried on the next call, not cached
      throw error;
    }));
    await modelContext.registerTool(ozzitTools(load).lookup);
  }).catch(error => console.warn('WebMCP tool registration failed:', error));
}
