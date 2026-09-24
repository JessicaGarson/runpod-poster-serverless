"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Phase = "queued" | "starting" | "generating" | "complete" | "failed";

type PosterJob = {
  id: string;
  prompt: string;
  style: string;
  phase: Phase;
  startedAt: number;
  completedAt?: number;
  image?: string | null;
  error?: string;
  delayMs?: number | null;
  executionMs?: number | null;
  accent: number;
};

type Health = {
  workers: { idle?: number; initializing?: number; running?: number; throttled?: number };
  jobs: { inQueue?: number; inProgress?: number };
};

type WorkerState = "running" | "starting" | "warm" | "off";

// Matches the endpoint's workersMax; see README.
const MAX_WORKERS = 3;

const workerLabel: Record<WorkerState, string> = {
  running: "Running",
  starting: "Starting",
  warm: "Idle",
  off: "Off",
};

const STYLES = ["Neon editorial", "Retro risograph", "Cosmic minimal", "Brick built"];
const BURST_PROMPTS = [
  "A robot tending a rooftop garden",
  "An astronaut ordering noodles at midnight",
  "A disco octopus hosting developer karaoke",
  "A capybara debugging code in a rainstorm",
  "A pigeon running a tiny corner shop",
  "A deep-sea diver walking a moonlit dog",
  "A fox repairing satellites in the desert",
  "A choir of frogs inside a subway station",
  "A bear baking bread on a research ship",
  "A knight delivering pizza through a thunderstorm",
];

const phaseLabel: Record<Phase, string> = {
  queued: "Queued",
  starting: "Starting",
  generating: "Generating",
  complete: "Printed",
  failed: "Failed",
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

type JobResult = { status: string; image?: string | null; delayTime?: number | null; executionTime?: number | null; error?: string | null };

async function submitJob(prompt: string, style: string): Promise<{ id: string }> {
  const response = await fetch("/api/runpod", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, style }),
  });
  const submitted = await response.json();
  if (!response.ok || !submitted.id) throw new Error(submitted.error || "Could not submit job");
  return submitted;
}

async function waitForJob(id: string, onInProgress?: () => void): Promise<JobResult> {
  // A true cold start on this endpoint takes about 2.5 minutes, so allow up to five.
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await wait(1500);
    const response = await fetch(`/api/runpod?id=${encodeURIComponent(id)}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not read Runpod job status");
    if (result.status === "IN_PROGRESS") onInProgress?.();
    if (result.status === "COMPLETED") return result;
    if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(result.status)) throw new Error(result.error || result.status);
  }
  throw new Error("Job polling timed out");
}

function styleKey(style: string) {
  if (style.startsWith("Retro")) return "riso";
  if (style.startsWith("Cosmic")) return "cosmic";
  if (style.startsWith("Brick")) return "brick";
  return "neon";
}

function Poster({ job, index, now }: { job: PosterJob; index: number; now: number }) {
  return (
    <article className={`poster poster-${job.accent % 4} style-${styleKey(job.style)} ${job.phase === "complete" ? "is-done" : ""}`}>
      {job.image && (
        // The generated image is intentionally a faint texture beneath the CSS poster.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="poster-image-trace" src={job.image} alt="" aria-hidden="true" />
      )}
      <div className="poster-orbit" />
      <div className="poster-grain" />
      <div className="poster-bricks" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </div>
      <span className="poster-number">0{index + 1}</span>
      <div className="poster-copy">
        <span>{job.style}</span>
        <h3>{job.prompt}</h3>
      </div>
      <span className="poster-foot">
        {job.phase === "complete" && job.delayMs != null && job.executionMs != null
          ? `Waited ${seconds(job.delayMs)} · Ran ${seconds(job.executionMs)}`
          : "Made on Runpod"}
      </span>
      {job.phase !== "complete" && (
        <div className={`poster-process ${job.phase === "failed" ? "is-failed" : ""}`} title={job.error}>
          {job.phase !== "failed" && <span className="spinner" />}
          <span>{phaseLabel[job.phase]}</span>
          {job.phase !== "failed" && <span className="poster-elapsed">{seconds(Math.max(0, now - job.startedAt))}</span>}
          {job.error && <small>{job.error}</small>}
        </div>
      )}
    </article>
  );
}

export default function Home() {
  const [prompt, setPrompt] = useState("A raccoon DJ performing on Mars");
  const [style, setStyle] = useState(STYLES[0]);
  const [jobs, setJobs] = useState<PosterJob[]>([]);
  const [liveAvailable, setLiveAvailable] = useState<boolean | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [warmup, setWarmup] = useState<{ ready: number; failed: number } | null>(null);

  useEffect(() => {
    fetch("/api/runpod")
      .then((response) => response.json())
      .then((data) => setLiveAvailable(Boolean(data.liveAvailable)))
      .catch(() => setLiveAvailable(false));
  }, []);

  // Poll endpoint health the whole time, so the audience can watch workers scale back down after the burst.
  useEffect(() => {
    if (liveAvailable !== true) return;
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch("/api/runpod?health=1");
        if (response.ok && !cancelled) setHealth(await response.json());
      } catch {
        // Keep the last reading; the inferred worker view below covers gaps.
      }
    }
    void poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [liveAvailable]);

  const activeJobs = jobs.filter((job) => !["complete", "failed"].includes(job.phase));
  const hasActiveJobs = activeJobs.length > 0;

  // Tick elapsed timers so a cold start reads as time passing rather than a frozen screen.
  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs]);

  const queued = health?.jobs.inQueue ?? jobs.filter((job) => job.phase === "queued" || job.phase === "starting").length;
  const starting = jobs.some((job) => job.phase === "starting");
  const generating = jobs.some((job) => job.phase === "generating");
  const running = health?.workers.running ?? Math.min(MAX_WORKERS, jobs.filter((job) => job.phase === "generating").length);
  const initializing = health?.workers.initializing ?? 0;
  const warm = health?.workers.idle ?? 0;
  const throttled = health?.workers.throttled ?? 0;
  const workerStates: WorkerState[] = Array.from({ length: MAX_WORKERS }, (_, slot) => {
    if (slot < running) return "running";
    if (slot < running + initializing) return "starting";
    if (slot < running + initializing + warm) return "warm";
    return "off";
  });
  const latestCompleted = [...jobs].reverse().find((job) => job.phase === "complete");
  const lastDuration = latestCompleted?.completedAt
    ? ((latestCompleted.completedAt - latestCompleted.startedAt) / 1000).toFixed(1)
    : "—";
  const oldestStarting = jobs.find((job) => job.phase === "starting");
  const startingFor = oldestStarting ? Math.round((now - oldestStarting.startedAt) / 1000) : 0;

  const story = useMemo(() => {
    if (starting && activeJobs.length > 1) return { eyebrow: "BURST TRAFFIC", title: "More jobs arrived than one worker can handle.", note: throttled > 0 && initializing === 0 ? "Jobs are queued while Runpod waits for free GPUs in this endpoint's pool." : `Runpod is starting more workers, up to ${MAX_WORKERS}, to work through the queue in parallel.` };
    if (starting) return { eyebrow: `STARTING · ${startingFor}s`, title: running > 0 ? "A running worker is picking up the job." : "No GPU was running, so Runpod is starting one.", note: "This wait is the cost of scaling to zero: nothing was billing while idle, so the first request pays the startup time." };
    if (activeJobs.length > 1) return { eyebrow: "BURST TRAFFIC", title: "Several GPU workers are running at once.", note: "Each worker takes a job from the same queue. No load balancer to configure." };
    if (activeJobs.length === 1) return { eyebrow: "ONE ACTIVE JOB", title: "A GPU worker is running the model.", note: "When the queue clears, this worker can be removed instead of sitting idle." };
    if (jobs.length > 0 && warm > 0) return { eyebrow: "QUEUE CLEAR", title: "Queue clear. Workers are winding down.", note: "Workers stay up for the endpoint's idle timeout, then scale down to zero. That timeout is the dial between startup latency and idle cost." };
    if (jobs.length > 0) return { eyebrow: "SCALED TO ZERO", title: "Queue clear. No GPUs running.", note: "Nothing is billing until the next request arrives." };
    return { eyebrow: "IDLE", title: "No requests in the queue.", note: "Submit a prompt to send a real job to the Runpod Serverless endpoint." };
  }, [activeJobs.length, initializing, jobs.length, running, starting, startingFor, throttled, warm]);

  const lifecycleStep = starting
    ? "starting"
    : generating
      ? "generating"
      : queued > 0
        ? "queued"
        : jobs.length > 0
          ? "complete"
          : "idle";

  function patchJob(id: string, patch: Partial<PosterJob>) {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }

  async function runOnRunpod(job: PosterJob) {
    try {
      patchJob(job.id, { phase: "queued" });
      const submitted = await submitJob(job.prompt, job.style);

      patchJob(job.id, { phase: "starting" });
      const result = await waitForJob(submitted.id, () => patchJob(job.id, { phase: "generating" }));
      if (!result.image) throw new Error("Runpod completed without returning an image");
      patchJob(job.id, {
        phase: "complete",
        image: result.image,
        completedAt: Date.now(),
        delayMs: result.delayTime,
        executionMs: result.executionTime,
      });
    } catch (error) {
      patchJob(job.id, {
        phase: "failed",
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : "Runpod job failed",
      });
    }
  }

  function launch(nextPrompt: string, nextStyle: string, accentOffset = 0) {
    if (liveAvailable !== true) return;
    const id = crypto.randomUUID();
    const job: PosterJob = {
      id,
      prompt: nextPrompt,
      style: nextStyle,
      phase: "queued",
      startedAt: Date.now(),
      accent: jobs.length + accentOffset,
    };
    setJobs((current) => [...current, job]);
    void runOnRunpod(job);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (prompt.trim()) launch(prompt.trim(), style);
  }

  function runBurst() {
    const promptsAlreadyShown = new Set([
      prompt.trim().toLowerCase(),
      ...jobs.map((job) => job.prompt.trim().toLowerCase()),
    ]);
    const burst = BURST_PROMPTS
      .filter((item) => !promptsAlreadyShown.has(item.toLowerCase()))
      .slice(0, 4);

    burst.forEach((item, index) => launch(item, STYLES[index % STYLES.length], index));
  }

  function reset() {
    setJobs([]);
  }

  // Presenter-only: start every worker before the talk so on-stage posters skip the cold start.
  // Warm-up jobs never enter the gallery.
  function warmUp() {
    setWarmup({ ready: 0, failed: 0 });
    for (let worker = 0; worker < MAX_WORKERS; worker += 1) {
      submitJob(`Warm-up ${worker + 1}: a simple geometric shape`, STYLES[0])
        .then((submitted) => waitForJob(submitted.id))
        .then(() => setWarmup((current) => current && { ...current, ready: current.ready + 1 }))
        .catch(() => setWarmup((current) => current && { ...current, failed: current.failed + 1 }));
    }
  }

  const warmupDone = warmup !== null && warmup.ready + warmup.failed === MAX_WORKERS;
  const warmupLabel = warmup === null
    ? `Warm up ${MAX_WORKERS} GPUs`
    : warmupDone
      ? warmup.failed > 0 ? `Warm-up: ${warmup.failed} failed` : `${MAX_WORKERS} GPUs warm ✓`
      : `Warming… ${warmup.ready}/${MAX_WORKERS}`;

  return (
    <main>
      <section className="hero">
        <div>
          <span className="overline">A small GPU workload, running on Runpod</span>
          <h1>Most of the time,<br />nothing happens.<br /><em>Then everyone shows up.</em></h1>
        </div>
        <p>This poster generator makes a familiar infrastructure problem visible: GPUs cost money while they wait, take time to start, and can get backed up when requests arrive together.</p>
      </section>

      <section className="why-serverless">
        <div className="traffic-shape">
          <span className="overline">What we&apos;re testing</span>
          <div className="traffic-flow">
            <strong>Quiet</strong><i>→</i><strong className="crowd">Crowd</strong><i>→</i><strong>Quiet</strong>
          </div>
          <p>GPU demand is often spiky. A meetup demo just makes the pattern easy to see.</p>
        </div>
        <div className="compare-card old-way">
          <span>Keep a GPU running</span>
          <h2>Keep one GPU running.</h2>
          <p>Requests start quickly, but the GPU sits idle between jobs and a burst still creates a queue.</p>
          <small>Fast to respond · costs money while idle</small>
        </div>
        <div className="compare-arrow">or</div>
        <div className="compare-card runpod-way">
          <span>Start from zero</span>
          <h2>Start workers from a queue.</h2>
          <p>Runpod starts GPU workers as jobs arrive, adds concurrency for a burst, and scales down after the queue clears.</p>
          <small>Less idle capacity · slower first request</small>
        </div>
      </section>

      <section className="control-panel">
        <form className={`prompt-form style-ui-${styleKey(style)}`} onSubmit={handleSubmit}>
          <label htmlFor="prompt">What should we make?</label>
          <div className="prompt-row">
            <input id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="An impossible meetup poster…" disabled={liveAvailable !== true} />
            <button className="primary" type="submit" disabled={liveAvailable !== true}>
              {liveAvailable === null ? "Checking Runpod…" : liveAvailable ? "Make poster" : "Runpod required"}
            </button>
          </div>
          {liveAvailable === false && <p className="runpod-required">Add <code>RUNPOD_API_KEY</code> and <code>RUNPOD_ENDPOINT_ID</code> to <code>.env.local</code>, then restart the app.</p>}
          <div className="style-row">
            {STYLES.map((item) => (
              <button type="button" key={item} aria-pressed={style === item} className={`${styleKey(item)} ${style === item ? "selected" : ""}`} onClick={() => setStyle(item)}>
                <i />{item}
              </button>
            ))}
            <span className="active-style">Next poster: <strong>{style}</strong></span>
          </div>
        </form>
        <div className="burst-card">
          <div><span className="burst-icon">4</span><div><strong>Now add a crowd</strong><small>See what happens when requests arrive together</small></div></div>
          <button onClick={runBurst} disabled={liveAvailable !== true}>Send 4 at once</button>
        </div>
      </section>

      <section className="stage">
        <div className="story-card">
          <span>{story.eyebrow}</span>
          <h2>{story.title}</h2>
          <p>{story.note}</p>
          <div className="lifecycle-track" aria-label={`Current lifecycle stage: ${lifecycleStep}`}>
            {[
              ["idle", "Idle"],
              ["queued", "Queue"],
              ["starting", "Start GPU"],
              ["generating", "Run model"],
              ["complete", "Done"],
            ].map(([step, label]) => <span key={step} className={lifecycleStep === step ? "active" : ""}><i />{label}</span>)}
          </div>
          <small className="pipeline-title">Where the request goes</small>
          <div className="runpod-pipeline" aria-label="Runpod Serverless request flow">
            <span>Your app</span><b>→</b><span>Runpod queue</span><b>→</b><span>Runpod GPU</span><b>→</b><span>Your result</span>
          </div>
          <div className="metric-strip">
            <div><strong>{queued}</strong><small>Queued</small></div>
            <div><strong>{running}</strong><small>Running</small></div>
            <div><strong>{lastDuration}{lastDuration !== "—" && "s"}</strong><small>Last job</small></div>
          </div>
          <div className="workers" aria-label={`${running} of ${MAX_WORKERS} workers running`}>
            {workerStates.map((state, worker) => (
              <span key={worker} className={`worker-${state}`}><i />GPU WORKER {worker + 1}<em>{workerLabel[state]}</em></span>
            ))}
          </div>
          <small className="health-source">{health ? "Live from the Runpod endpoint health API" : "Estimated from job status"}</small>
        </div>

        <div className="gallery">
          {jobs.length === 0 ? (
            <div className="empty-gallery">
              <div className="empty-art"><span>0</span><small>workers</small></div>
              <p>Your first CSS poster lands here after Runpod completes the job.</p>
            </div>
          ) : jobs.slice(-6).map((job, index) => <Poster key={job.id} job={job} index={index} now={now} />)}
        </div>
      </section>

      <footer>
        <div className="footer-actions">
          <button onClick={warmUp} disabled={liveAvailable !== true || (warmup !== null && !warmupDone)}>{warmupLabel}</button>
          {jobs.length > 0 && <button onClick={reset}>Reset demo</button>}
        </div>
      </footer>
    </main>
  );
}
