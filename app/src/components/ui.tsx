import type { ReactNode } from 'react'

export type IconName = 'terminal' | 'address' | 'service' | 'group' | 'plus' | 'copy' | 'download' | 'upload' | 'check' | 'close' | 'trash' | 'edit' | 'book' | 'spark' | 'lock' | 'shield' | 'search' | 'chevron-left' | 'chevron-right' | 'panels' | 'menu' | 'sun' | 'moon'
const paths: Record<IconName, string> = {
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
  moon: 'M20.8 13.2A9 9 0 0 1 10.8 3.2a9 9 0 1 0 10 10Z',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  'chevron-left': 'm14 7-5 5 5 5',
  'chevron-right': 'm10 7 5 5-5 5',
  panels: 'M3 4h18v5H3zM3 15h18v5H3zM8 9v6M16 9v6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  terminal: 'm5 7 5 5-5 5M13 17h6',
  address: 'M3 4h18v6H3zM3 14h18v6H3zM7 7h.01M7 17h.01M12 10v4',
  service: 'm13 2-9 12h7l-1 8 10-13h-8Z',
  group: 'M9 3h6v5H9zM2 16h6v5H2zM16 16h6v5h-6zM12 8v4M5 16v-4h14v4',
  plus: 'M12 5v14M5 12h14', copy: 'M8 8h12v13H8zM16 8V3H3v13h5',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
  check: 'm5 12 4 4L19 6', close: 'm6 6 12 12M6 18 18 6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  edit: 'm15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z', book: 'M12 5v15M12 5C8 2 3 3 3 3v15s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Z',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  lock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Zm-4 9 3 3 5-6',
}
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
export function FormError({ error }: { error: string }) { return error ? <p className="form-error" role="alert">{error}</p> : null }
