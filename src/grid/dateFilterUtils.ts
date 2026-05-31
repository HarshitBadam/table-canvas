export type QuickDateFilter = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_30_days' | 'last_90_days'

export interface QuickDateOption {
  id: QuickDateFilter
  label: string
  getRange: () => { start: string; end: string }
}

/** Format a Date as YYYY-MM-DD for date inputs, using local timezone. */
export function formatDateForInput(date: Date): string {
  if (isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return startOfDay(d)
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return endOfDay(end)
}

function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  return startOfDay(d)
}

function endOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return endOfDay(d)
}

export const quickDateOptions: QuickDateOption[] = [
  {
    id: 'today',
    label: 'Today',
    getRange: () => {
      const today = new Date()
      return {
        start: formatDateForInput(startOfDay(today)),
        end: formatDateForInput(endOfDay(today)),
      }
    },
  },
  {
    id: 'yesterday',
    label: 'Yesterday',
    getRange: () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      return {
        start: formatDateForInput(startOfDay(yesterday)),
        end: formatDateForInput(endOfDay(yesterday)),
      }
    },
  },
  {
    id: 'this_week',
    label: 'This Week',
    getRange: () => {
      const today = new Date()
      return {
        start: formatDateForInput(startOfWeek(today)),
        end: formatDateForInput(endOfWeek(today)),
      }
    },
  },
  {
    id: 'last_week',
    label: 'Last Week',
    getRange: () => {
      const lastWeek = new Date()
      lastWeek.setDate(lastWeek.getDate() - 7)
      return {
        start: formatDateForInput(startOfWeek(lastWeek)),
        end: formatDateForInput(endOfWeek(lastWeek)),
      }
    },
  },
  {
    id: 'this_month',
    label: 'This Month',
    getRange: () => {
      const today = new Date()
      return {
        start: formatDateForInput(startOfMonth(today)),
        end: formatDateForInput(endOfMonth(today)),
      }
    },
  },
  {
    id: 'last_month',
    label: 'Last Month',
    getRange: () => {
      const lastMonth = new Date()
      lastMonth.setMonth(lastMonth.getMonth() - 1)
      return {
        start: formatDateForInput(startOfMonth(lastMonth)),
        end: formatDateForInput(endOfMonth(lastMonth)),
      }
    },
  },
  {
    id: 'last_30_days',
    label: 'Last 30 Days',
    getRange: () => {
      const today = new Date()
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return {
        start: formatDateForInput(startOfDay(thirtyDaysAgo)),
        end: formatDateForInput(endOfDay(today)),
      }
    },
  },
  {
    id: 'last_90_days',
    label: 'Last 90 Days',
    getRange: () => {
      const today = new Date()
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      return {
        start: formatDateForInput(startOfDay(ninetyDaysAgo)),
        end: formatDateForInput(endOfDay(today)),
      }
    },
  },
]
