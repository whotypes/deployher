/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_PUBLIC_API_ORIGIN?: string;
  readonly VITE_PUBLIC_DASH_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
