import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatIstDate } from '../datetime.js'
import { renderMarkdown } from '../markdown.js'

function requiredYearsText(job) {
  const { required_years_min, required_years_max } = job
  if (required_years_min == null && required_years_max == null) return null
  if (required_years_max == null) return `needs ${required_years_min}+ yrs`
  if (required_years_min === required_years_max) {
    return `needs ${required_years_min} yr${required_years_min === 1 ? '' : 's'}`
  }
  return `needs ${required_years_min}–${required_years_max} yrs`
}

function verdictBadgeClass(verdict) {
  const v = (verdict || '').toLowerCase()
  if (v.includes('strong')) return 'badge badge--ok'
  if (v.includes('good') || v.includes('moderate')) return 'badge badge--warn'
  if (v.includes('weak') || v.includes('poor')) return 'badge badge--no'
  return 'badge'
}

function detailLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function detailValue(value) {
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' && /_at$/.test(value)) {
    const asDate = new Date(value)
    if (!Number.isNaN(asDate.getTime())) return formatIstDate(value)
  }
  return String(value)
}

function JobDetails({ job, onClose, onStatus }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const aiKeys = new Set([
    'score', 'verdict', 'required_years', 'experience_match',
    'matched_skills', 'missing_skills', 'reasoning',
  ])
  const entries = Object.entries(job).filter(
    ([key]) => key !== 'description' && !aiKeys.has(key),
  )
  const hasAiDetails = Object.keys(job).some((key) => aiKeys.has(key))

  return (
    <div
      className="details-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="details-modal__window" role="dialog" aria-modal="true" aria-labelledby="job-details-title">
        <div className="details-modal__head">
          <div>
            <h2 id="job-details-title">{job.title || 'Untitled role'}</h2>
            <p className="muted">{job.company || 'Unknown company'}</p>
            {job.location ? <p className="muted">{job.location}</p> : null}
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close details">×</button>
        </div>
        <div className="details-modal__body">
          {hasAiDetails ? (
            <div className="details-ai">
              <h3>AI assessment</h3>
              <div className="details-ai__summary">
                {job.score != null ? <strong className="details-ai__score">{job.score}<small>/100 fit</small></strong> : null}
                {job.verdict && job.verdict !== 'unknown' ? (
                  <span className={verdictBadgeClass(job.verdict)}>{job.verdict} fit</span>
                ) : null}
                {job.required_years_min != null || job.required_years_max != null ? (
                  <span className="badge badge--accent">{requiredYearsText(job)}</span>
                ) : null}
                {job.experience_match != null ? (
                  <span className={job.experience_match ? 'badge badge--ok' : 'badge badge--no'}>
                    {job.experience_match ? '✓ matches experience' : '✕ outside experience window'}
                  </span>
                ) : null}
              </div>
              {Array.isArray(job.matched_skills) && job.matched_skills.length ? (
                <div className="details-ai__skills"><b>Matched skills</b>{job.matched_skills.map((skill, index) => <span className="chip chip--ok" key={`matched-${index}`}>{skill}</span>)}</div>
              ) : null}
              {Array.isArray(job.missing_skills) && job.missing_skills.length ? (
                <div className="details-ai__skills"><b>Missing skills</b>{job.missing_skills.map((skill, index) => <span className="chip chip--miss" key={`missing-${index}`}>{skill}</span>)}</div>
              ) : null}
              {job.reasoning ? <p className="details-ai__reasoning">{job.reasoning}</p> : null}
            </div>
          ) : null}
          {job.description ? (
            <div className="details-modal__description">
              <h3>Description</h3>
              {/* Scraped postings are markdown; render rich text like the
                  original dashboard (input is HTML-escaped in markdown.js). */}
              <div className="desc desc--rich" dangerouslySetInnerHTML={{ __html: renderMarkdown(job.description) }} />
            </div>
          ) : null}
          <dl className="details-grid">
            {entries.map(([key, value]) => (
              <div className="details-grid__item" key={key}>
                <dt>{detailLabel(key)}</dt>
                <dd>{detailValue(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="details-modal__foot">
          {job.job_url ? (
            <a className="btn btn--primary" href={job.job_url} target="_blank" rel="noreferrer">
              Open original
            </a>
          ) : null}
          <button className="btn" type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  )
}

export default function JobCard({ job, onStatus, busy }) {
  const [detailsJob, setDetailsJob] = useState(null)
  const status = job.status || 'new'
  const scoreLabel = typeof job.score === 'number' ? `${Math.round(job.score)} of 100 fit` : 'No fit score'

  function openFromRow(event) {
    if (event.target.closest('button, a, input, select, textarea')) return
    setDetailsJob(job)
  }

  function openFromKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (event.target.closest('button, a, input, select, textarea')) return
    event.preventDefault()
    setDetailsJob(job)
  }

  return (
    <article
      className={`card card--${status}`}
      onClick={openFromRow}
      onKeyDown={openFromKey}
      tabIndex={0}
      aria-label={`${job.title || 'Untitled role'}, ${scoreLabel}`}
    >
      <div className="card__main">
        <h3 className="card__title">{job.title || 'Untitled role'}</h3>
        <p className="card__company">{job.company || 'Unknown company'}</p>
        {job.location ? <p className="card__loc">{job.location}</p> : null}
        {job.auto_rejected ? (
          <p className="card__note">Outside the experience window</p>
        ) : null}
        {job.score_error && (job.score_attempts || 0) > 0 ? (
          <p className="card__note">
            {(job.score_attempts || 0) >= 3 ? 'Scoring failed' : `Scoring will retry (${job.score_attempts} of 3)`}
          </p>
        ) : null}
        <div className="card__actions">
          <button
            className={`btn btn--small ${status === 'accepted' ? 'btn--ok' : ''}`}
            disabled={busy}
            onClick={() => onStatus(job, 'accepted')}
            title="Accept this job"
          >
            {status === 'accepted' ? 'Accepted' : 'Accept'}
          </button>
          <button
            className={`btn btn--small ${status === 'rejected' ? 'btn--danger' : ''}`}
            disabled={busy}
            onClick={() => onStatus(job, 'rejected')}
            title="Reject this job"
          >
            {status === 'rejected' ? 'Rejected' : 'Reject'}
          </button>
        </div>
        {job.first_seen_at ? (
          <p className="card__seen">Seen {formatIstDate(job.first_seen_at)}</p>
        ) : null}
      </div>
      <p className={`card__score ${typeof job.score === 'number' ? '' : 'card__score--none'}`}>
        {typeof job.score === 'number' ? Math.round(job.score) : '—'}
      </p>

      {detailsJob
        ? createPortal(<JobDetails job={detailsJob} onClose={() => setDetailsJob(null)} />, document.body)
        : null}
    </article>
  )
}
