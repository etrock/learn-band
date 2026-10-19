export type Category = 'kód' | 'projekt' | 'keretrendszer' | 'nyelv' | 'rendszertervezés' | 'téma'

export type Lesson = {
  title: string
  body: string
  category: Category
  topic?: string
  at: number
  files: string[]
}

export type HistoryEntry = { title: string; category: Category; at: number }

declare module 'claude-code' {
  interface PluginState {
    'learn-band': {
      lesson: Lesson | null
      isHidden: boolean
      isBusy: boolean
      isExpanded: boolean
    }
  }
}
