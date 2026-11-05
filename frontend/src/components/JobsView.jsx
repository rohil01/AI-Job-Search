import { useEffect, useMemo, useState } from 'react'
import { getJobs, setJobStatus } from '../api.js'
import { istDayRange, toUtcIso } from '../datetime.js'
import JobCard from './JobCard.jsx'
import { ErrorBanner, PageHead, Spinner } from './ui.jsx'

const PAGE_SIZE = 40

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'ai-failed', label: 'AI failed' },
]

function queryFor(filter, order, page) {
  const query = { order, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
  if (filter === 'new') {
    const { start, end } = istDayRange()
    return {
      ...query,
      status: 'new',
      firstSeenFrom: toUtcIso(start),
      firstSeenTo: toUtcIso(end),
    }
  }
  if (filter === 'accepted') return { ...query, status: 'accepted' }
  if (filter === 'rejected') return { ...query, status: 'rejected' }
  if (filter === 'ai-failed') return { ...query, aiFailed: true, excludeStatus: 'rejected' }
  return { ...query, excludeStatus: 'rejected' }
}

export default function JobsView() {
  const [filter, setFilter] = useState('all')
  const [order, setOrder] = useState('score')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [reloadToken, setReloadToken] = useState(0)
  const [jobs, setJobs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [busyKey, setBusyKey] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    getJobs(queryFor(filter, order, page))
      .then((data) => {
        if (!alive) return
        const nextTotal = data.filtered_total ?? (data.jobs || []).length
        const maxPage = Math.max(0, Math.ceil(nextTotal / PAGE_SIZE) - 1)
        if (page > maxPage) {
          setPage(maxPage)
          return
        }
        setJobs(data.jobs || [])
        setTotal(nextTotal)
        setLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        setError(e)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [filter, order, page, reloadToken])

  async function handleStatus(job, status) {
    setBusyKey(job.job_key)
    setError(null)
    try {
      await setJobStatus(job.job_key, status)
      setReloadToken((n) => n + 1)
    } catch (e) {
      setError(e)
    } finally {
      setBusyKey(null)
    }
  }

  const visible = useMemo(() => searchFilter(jobs, search), [jobs, search])
  const searching = search.trim().length > 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section className="page">
      <PageHead title="Jobs" lede="Postings from the latest scrapes. Accept or reject from the row." />
      <div className="toolbar">
        <div className="chips-row" role="tablist" aria-label="Job status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`chip-btn ${filter === f.key ? 'chip-btn--on' : ''}`}
              onClick={() => {
                setFilter(f.key)
                setPage(0)
                setJobs([])
                setLoading(true)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="input"
          type="search"
          placeholder="Search this page"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          title="Filters the jobs loaded on this page"
        />
        <label className="inline">
          sort
          <select
            className="select"
            value={order}
            onChange={(e) => {
              setOrder(e.target.value)
              setPage(0)
              setJobs([])
              setLoading(true)
            }}
          >
            <option value="score">by score</option>
            <option value="recent">by recency</option>
            <option value="title">by title</option>
          </select>
        </label>
        <button className="btn" type="button" onClick={() => setReloadToken((n) => n + 1)} disabled={loading}>
          {loading ? <Spinner label="Loading…" /> : 'Refresh'}
        </button>
      </div>

      <ErrorBanner error={error} />

      {loading ? <Spinner label="Loading jobs…" /> : null}

      {!loading && !visible.length ? (
        <div className="empty">
          {searching && jobs.length ? (
            <>
              <h3>Nothing matches your search</h3>
              <p>Search looks through the jobs on this page.</p>
            </>
          ) : (
            <EmptyCopy filter={filter} />
          )}
        </div>
      ) : null}

      {!loading ? (
        <div className="shortlist">
          {visible.map((job) => (
            <JobCard key={job.job_key} job={job} onStatus={handleStatus} busy={busyKey === job.job_key} />
          ))}
        </div>
      ) : null}

      {!loading && total > 0 ? (
        <div className="pager">
          <button
            className="btn"
            type="button"
            disabled={page <= 0}
            onClick={() => {
              setJobs([])
              setLoading(true)
              setPage((n) => Math.max(0, n - 1))
            }}
          >
            Previous
          </button>
          <span className="pager__count">
            {page * PAGE_SIZE + 1}–{Math.min(total, page * PAGE_SIZE + jobs.length)} of {total}
          </span>
          <button
            className="btn"
            type="button"
            disabled={page + 1 >= pageCount}
            onClick={() => {
              setJobs([])
              setLoading(true)
              setPage((n) => n + 1)
            }}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  )
}

function EmptyCopy({ filter }) {
  if (filter === 'rejected') {
    return (
      <>
        <h3>No rejected jobs</h3>
        <p>Jobs you reject, and ones the pipeline turns down for experience, show up here.</p>
      </>
    )
  }
  if (filter === 'ai-failed') {
    return (
      <>
        <h3>No scoring failures</h3>
        <p>Jobs that fail AI scoring show up here until a later run scores them.</p>
      </>
    )
  }
  if (filter === 'new') {
    return (
      <>
        <h3>No new jobs today</h3>
        <p>Jobs first seen today show up here.</p>
      </>
    )
  }
  if (filter === 'accepted') {
    return (
      <>
        <h3>No accepted jobs</h3>
        <p>Accept a job from its card to keep it here.</p>
      </>
    )
  }
  return (
    <>
      <h3>No jobs in view</h3>
      <p>Run the pipeline from Settings, or wait for the scheduler.</p>
    </>
  )
}

function searchFilter(list, search) {
  if (!search.trim()) return list
  const needle = search.trim().toLowerCase()
  return list.filter(
    (j) =>
      (j.title || '').toLowerCase().includes(needle) ||
      (j.company || '').toLowerCase().includes(needle) ||
      (j.location || '').toLowerCase().includes(needle),
  )
}
