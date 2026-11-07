export type Priority = 'low' | 'medium' | 'high'
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly'
export type ChainMode = 'free' | 'sequential' | 'dependencies'
export type ThemeMode = 'light' | 'dark'
export type Palette = 'violet' | 'ocean' | 'forest' | 'rose' | 'amber'

export type Subtask = {
  id: string
  title: string
  completed: boolean
}

export type Task = {
  id: string
  title: string
  description: string
  completed: boolean
  priority: Priority
  dueDate: string
  reminderAt?: string
  subtasks: Subtask[]
  createdAt: string
  completedAt: string | null
  dependsOn: string[]
  repeat: RepeatRule
  estimateMinutes: number | null
}

export type Chain = {
  id: string
  title: string
  description: string
  color: string
  mode: ChainMode
  tasks: Task[]
  createdAt: string
  archived: boolean
}

export type Template = {
  id: string
  title: string
  description: string
  color: string
  mode: ChainMode
  tasks: Array<{ title: string; description?: string; priority?: Priority; dependsOnIndices?: number[] }>
}

export type ActivityItem = {
  id: string
  text: string
  createdAt: string
  chainId?: string
}
