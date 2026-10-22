import type { GenerationJob } from "@/registry/lib/generation-queue-reducer"
import { jobName } from "@/registry/ui/generation-card/generation-card"

// What screen readers hear about a job: its change of state, never its progress.
function changeOf(job: GenerationJob, previous: GenerationJob | undefined) {
  if (previous?.status === job.status && previous.attempt === job.attempt) return null
  const name = jobName(job)
  switch (job.status) {
    case "queued":
      return `${name} queued`
    // A job that waited in line starts quietly: its card shows it.
    case "running":
      return previous?.status === "queued" ? null : `${name} started`
    case "succeeded":
      return `${name} is ready`
    case "failed":
      return `${name} failed: ${job.error ?? "something went wrong"}`
    case "canceled":
      return job.refunded ? `${name} canceled, refunded` : `${name} canceled`
  }
}

/**
 * What changed from one list of jobs to the next, in one message, oldest job first: "Image 1 is
 * ready. Image 3 started". Empty when no job changed state.
 */
export function describeChanges(before: readonly GenerationJob[], after: readonly GenerationJob[]) {
  const messages: string[] = []
  for (const job of [...after].reverse()) {
    const message = changeOf(job, before.find((other) => other.id === job.id))
    if (message) messages.push(message)
  }
  for (const job of before) {
    if (!after.some((other) => other.id === job.id)) messages.push(`${jobName(job)} removed`)
  }
  return messages.join(". ")
}
