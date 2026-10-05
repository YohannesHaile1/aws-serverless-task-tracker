/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the task API, e.g. http://127.0.0.1:3000 or the deployed ApiUrl. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
