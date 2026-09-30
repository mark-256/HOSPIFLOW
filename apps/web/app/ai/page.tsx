'use client'

import { useState } from 'react'
import { Lightbulb, Send, Sparkles } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import Button from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Input'
import { apiRequest, getErrorMessage } from '@/lib/api'
import { PRIORITY_STATUS } from '@/lib/status'

type Insight = { priority: string; title: string; detail: string }
type Brief = { summary: string; response: { title?: string; detail: string }; insights: Insight[] }

const SUGGESTED_PROMPTS = [
  'What should I prioritize today?',
  'Which rooms are not ready for arrival?',
  'Summarise today revenue and occupancy',
  'What are the main operational risks right now?',
]

export default function AIPage() {
  const [prompt, setPrompt] = useState(SUGGESTED_PROMPTS[0])
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = async (event?: React.FormEvent) => {
    if (event) event.preventDefault()
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<Brief>(`/api/ai/insights?prompt=${encodeURIComponent(prompt)}`)
      setBrief({
        summary: response.data?.summary || '',
        response: response.data?.response || { detail: '' },
        insights: response.data?.insights || [],
      })
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to generate operational insights'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModuleShell title="AI Assistant" description="Data-backed operational guidance for the property">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle description="Answers are generated from HOSPIFLOW operational data">Ask the assistant</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={(event) => void generate(event)} className="space-y-4" noValidate>
              <div>
                <label htmlFor="aiPrompt" className="hf-label mb-1.5 block">
                  Question
                </label>
                <Textarea
                  id="aiPrompt"
                  rows={4}
                  required
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Ask about arrivals, room readiness, revenue, or stock risk"
                />
              </div>
              <Button type="submit" className="w-full" loading={loading} loadingLabel="Analysing" leadingIcon={<Send aria-hidden="true" className="h-4 w-4" />}>
                Generate guidance
              </Button>
              <div>
                <p className="hf-overline mb-2">Suggested questions</p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTED_PROMPTS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setPrompt(suggestion)}
                      className="rounded-md border border-line px-3 py-2 text-left text-sm text-ink-600 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle description="Prioritised view of today&apos;s operations">Operational brief</CardTitle>
            {brief ? (
              <span className="hf-caption">{brief.insights.length} insight{brief.insights.length === 1 ? '' : 's'}</span>
            ) : null}
          </CardHeader>
          <CardBody>
            {error ? (
              <ErrorState title="Unable to generate insights" message={error} onRetry={() => void generate()} />
            ) : loading ? (
              <div className="space-y-4" role="status" aria-label="Generating brief">
                <Skeleton className="h-20 w-full" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              </div>
            ) : !brief ? (
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title="No brief generated yet"
                description="Ask a question to receive a prioritised summary of sales, arrivals, room readiness, maintenance, and stock risk."
              />
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
                  <div className="flex items-center gap-2">
                    <Lightbulb aria-hidden="true" className="h-4 w-4 text-brand-600" />
                    <p className="text-sm font-semibold text-brand-900">{brief.summary}</p>
                  </div>
                  {brief.response?.title ? <p className="mt-2 text-sm font-medium text-ink-900">{brief.response.title}</p> : null}
                  {brief.response?.detail ? <p className="mt-1 text-sm leading-6 text-ink-700">{brief.response.detail}</p> : null}
                </div>

                {brief.insights.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {brief.insights.map((insight) => (
                      <div key={insight.title} className="rounded-lg border border-line p-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-ink-900">{insight.title}</p>
                          <StatusBadge status={insight.priority} registry={PRIORITY_STATUS} showDot={false} />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-ink-600">{insight.detail}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    size="icon"
                    title="No additional insights"
                    description="The brief above summarises the current operational picture."
                  />
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </ModuleShell>
  )
}
