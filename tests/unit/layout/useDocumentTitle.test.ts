import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDocumentTitle } from '@/layout/useDocumentTitle'

describe('useDocumentTitle', () => {
  it('falls back to the bare app name when nothing is open', () => {
    renderHook(() => useDocumentTitle({
      projectName: null,
      viewMode: 'canvas',
      nodeName: null,
      reportName: null,
    }))
    expect(document.title).toBe('Table Canvas')
  })

  it('shows the project name on the canvas view', () => {
    renderHook(() => useDocumentTitle({
      projectName: 'MyBudget',
      viewMode: 'canvas',
      nodeName: null,
      reportName: null,
    }))
    expect(document.title).toBe('MyBudget | Table Canvas')
  })

  it('leads with the table name when a table is open', () => {
    renderHook(() => useDocumentTitle({
      projectName: 'MyBudget',
      viewMode: 'grid',
      nodeName: 'Sheet1',
      reportName: null,
    }))
    expect(document.title).toBe('Sheet1 | MyBudget | Table Canvas')
  })

  it('leads with the chart name when a chart is open', () => {
    renderHook(() => useDocumentTitle({
      projectName: 'MyBudget',
      viewMode: 'chart',
      nodeName: 'Revenue Trend',
      reportName: null,
    }))
    expect(document.title).toBe('Revenue Trend | MyBudget | Table Canvas')
  })

  it('labels the dashboard view', () => {
    renderHook(() => useDocumentTitle({
      projectName: 'MyBudget',
      viewMode: 'dashboard',
      nodeName: null,
      reportName: null,
    }))
    expect(document.title).toBe('Dashboard | MyBudget | Table Canvas')
  })

  it('leads with the report name when a report is open', () => {
    renderHook(() => useDocumentTitle({
      projectName: 'MyBudget',
      viewMode: 'report',
      nodeName: null,
      reportName: 'Q3 Summary',
    }))
    expect(document.title).toBe('Q3 Summary | MyBudget | Table Canvas')
  })

  it('falls back to a generic "Report" label when the report has no name yet', () => {
    renderHook(() => useDocumentTitle({
      projectName: 'MyBudget',
      viewMode: 'report',
      nodeName: null,
      reportName: null,
    }))
    expect(document.title).toBe('Report | MyBudget | Table Canvas')
  })

  it('never produces a dangling separator when the project name is missing', () => {
    renderHook(() => useDocumentTitle({
      projectName: null,
      viewMode: 'grid',
      nodeName: 'Sheet1',
      reportName: null,
    }))
    expect(document.title).toBe('Sheet1 | Table Canvas')
  })

  it('resets to the bare app name on unmount, so a signed-out tab is never stuck on a stale project title', () => {
    const { unmount } = renderHook(() => useDocumentTitle({
      projectName: 'MyBudget',
      viewMode: 'canvas',
      nodeName: null,
      reportName: null,
    }))
    expect(document.title).toBe('MyBudget | Table Canvas')

    unmount()

    expect(document.title).toBe('Table Canvas')
  })
})
