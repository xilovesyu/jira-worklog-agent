/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROJECT_FILTER_KEYWORDS: string
  readonly VITE_BACKLOG_AREA_FILTER_VALUES: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}