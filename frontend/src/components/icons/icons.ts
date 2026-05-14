export type IconName =
  | 'menu'
  | 'search'
  | 'sun'
  | 'moon'
  | 'key'
  | 'bell'
  | 'view'
  | 'edit'
  | 'trash'
  | 'check'
  | 'reject'
  | 'pause'
  | 'archiveIn'
  | 'archiveOut'
  | 'rotateCcw'
  | 'lock'
  | 'unlock'
  | 'logout'
  | 'plus'
  | 'clipboardList'
  | 'sort'
  | 'settings'
  | 'saveTemplate'
  | 'refreshCw'

type IconDef = {
  viewBox: string
  paths: string[]
}

export const ICONS: Record<IconName, IconDef> = {
  menu: {
    viewBox: '0 0 24 24',
    paths: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  },
  search: {
    viewBox: '0 0 24 24',
    paths: ['M11 18a7 7 0 1 1 0-14a7 7 0 0 1 0 14z', 'M20 20l-3.5-3.5'],
  },
  sun: {
    viewBox: '0 0 24 24',
    paths: [
      'M12 18a6 6 0 1 1 0-12a6 6 0 0 1 0 12z',
      'M12 2v2',
      'M12 20v2',
      'M4.93 4.93l1.41 1.41',
      'M17.66 17.66l1.41 1.41',
      'M2 12h2',
      'M20 12h2',
      'M4.93 19.07l1.41-1.41',
      'M17.66 6.34l1.41-1.41',
    ],
  },
  moon: {
    viewBox: '0 0 24 24',
    paths: ['M21 14.5A7.5 7.5 0 0 1 9.5 3a6.5 6.5 0 1 0 11.5 11.5z'],
  },
  key: {
    viewBox: '0 0 24 24',
    paths: ['M7.5 14a4.5 4.5 0 1 1 3.9-2.25L22 12v3h-3v3h-3v-3l-4.35-.25'],
  },
  bell: {
    viewBox: '0 0 24 24',
    paths: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7', 'M9.5 19a2.5 2.5 0 0 0 5 0'],
  },
  view: {
    viewBox: '0 0 24 24',
    paths: ['M2 12s3.5-6 10-6s10 6 10 6s-3.5 6-10 6s-10-6-10-6z', 'M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6z'],
  },
  edit: {
    viewBox: '0 0 24 24',
    paths: ['M4 20h4l11-11l-4-4L4 16v4z', 'M13 6l4 4'],
  },
  trash: {
    viewBox: '0 0 24 24',
    paths: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  },
  check: {
    viewBox: '0 0 24 24',
    paths: ['M20 6L9 17l-5-5'],
  },
  reject: {
    viewBox: '0 0 24 24',
    paths: ['M12 22a10 10 0 1 1 0-20a10 10 0 0 1 0 20z', 'M15 9l-6 6', 'M9 9l6 6'],
  },
  pause: {
    viewBox: '0 0 24 24',
    paths: ['M10 8v8', 'M14 8v8'],
  },
  archiveIn: {
    viewBox: '0 0 24 24',
    paths: ['M21 8v11H3V8', 'M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2', 'M12 11v6', 'M12 17l-3-3', 'M12 17l3-3'],
  },
  archiveOut: {
    viewBox: '0 0 24 24',
    paths: ['M21 8v11H3V8', 'M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2', 'M12 17V11', 'M12 11l-3 3', 'M12 11l3 3'],
  },
  rotateCcw: {
    viewBox: '0 0 24 24',
    paths: ['M3 12a9 9 0 1 1 9 9', 'M3 3v6h6'],
  },
  lock: {
    viewBox: '0 0 24 24',
    paths: ['M7 11V8a5 5 0 0 1 10 0v3', 'M7 11h10v10H7z'],
  },
  unlock: {
    viewBox: '0 0 24 24',
    paths: ['M7 11V8a5 5 0 0 1 9.9-1', 'M7 11h10v10H7z'],
  },
  logout: {
    viewBox: '0 0 24 24',
    paths: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  },
  plus: {
    viewBox: '0 0 24 24',
    paths: ['M12 5v14', 'M5 12h14'],
  },
  clipboardList: {
    viewBox: '0 0 24 24',
    paths: [
      'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2',
      'M8 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z',
      'M9 12h4',
      'M9 16h6',
      'M9 20h4',
    ],
  },
  sort: {
    viewBox: '0 0 24 24',
    paths: [
      'M8 4v14',
      'M5 15l3 3l3-3',
      'M16 20V6',
      'M13 9l3-3l3 3',
    ],
  },
  settings: {
    viewBox: '0 0 24 24',
    paths: [
      'M12 15.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z',
      'M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.2 1.2a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2a1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.7a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9a1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1.2-1.2a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1a1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.7a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6a1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.2-1.2a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2a1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.7a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9a1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.2 1.2a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1a1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.7a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z',
    ],
  },
  saveTemplate: {
    viewBox: '0 0 24 24',
    paths: [
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
      'M14 2v6h6',
      'M10 13h4',
      'M10 17h2',
      'M16 18l2 2 4-4',
    ],
  },
  refreshCw: {
    viewBox: '0 0 24 24',
    paths: [
      'M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8',
      'M3 3v5h5',
      'M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16',
      'M16 21h5v-5',
    ],
  },
}

