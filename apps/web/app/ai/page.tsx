'use client'

import { useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage } from '@/lib/api'

type Insight = {
  priority: string
  title: string
  detail: string
}

export default function AIPage() {
  const [prompt, setPrompt] = useState('What should I prioritize today?')
  const [summary, setSummary] = useState('')
  const [response, setResponse] = useState<Insight | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = async (event?: React.FormEvent) => {
    if (event) event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const encoded = encodeURIComponent(prompt)
      const result = await apiRequest<any>(`/api/ai/insights?prompt=${encoded}`)
      setSummary(result.data.summary)
      setResponse(result.data.response)
      setInsights(result.data.insights || [])
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to generate operational insights'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModuleShell title="AI Assistant" description="Data-backed operational guidance for the property">
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-hospiflow-200 bg-white p-5 lg:col-span-1">
          <h2 className="text-lg font-semibold">Ask the assistant</h2>
          <p className="mt-2 text-sm text-hospiflow-600">Get a prioritized view of sales, arrivals, room readiness, maintenance, and stock risk.</p>
          <form onSubmit={() => void generate()} className="mt-5 space-y-3">
            <label className="block"><span className="text-sm text-hospiflow-700">Question</span><textarea required rows={5} className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
            <button type="submit" disabled={loading} className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">{loading ? 'Analyzing...' : 'Generate guidance'}</button>
          </form>
          {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        </section>
        <section className="rounded-lg border border-hospiflow-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Operational brief</h2>
          {!response ? <div className="mt-6 flex min-h-[220px] items-center justify-center rounded-lg bg-hospiflow-50 text-hospiflow-600">Ask a question to generate a brief.</div> : (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-primary-50 p-4"><p className="text-sm font-medium text-primary-800">{summary}</p><p className="mt-2 text-hospiflow-900">{response.detail}</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {insights.map((insight) => <div key={insight.title} className="rounded-lg border border-hospiflow-200 p-4"><div className="flex items-center justify-between gap-2"><p className="font-medium">{insight.title}</p><span className={`rounded px-2 py-1 text-xs ${insight.priority === 'HIGH' ? 'bg-red-100 text-red-800' : insight.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{insight.priority}</span></div><p className="mt-2 text-sm text-hospiflow-600">{insight.detail}</p></div>)}
              </div>
            </div>
          )}
        </section>
      </div>
    </ModuleShell>
  )
}
