"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Phase = "queued" | "starting" | "generating" | "complete" | "failed";
type Mode = "simulation" | "live";

type PosterJob = {
  id: string;
  prompt: string;
  style: string;
  phase: Phase;
  startedAt: number;
  completedAt?: number;
  image?: string | null;
  accent: number;
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
  starting: "Cold start",
  generating: "Generating",
  complete: "Printed",
  failed: "Failed",
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function styleKey(style: string) {
  if (style.startsWith("Retro")) return "riso";
  if (style.startsWith("Cosmic")) return "cosmic";
  if (style.startsWith("Brick")) return "brick";
  return "neon";
}

function Poster({ job, index }: { job: PosterJob; index: number }) {
  return (
    <article className={`poster poster-${job.accent % 4} style-${styleKey(job.style)} ${job.phase === "complete" ? "is-done" : ""}`}>
      {job.image ? (
        // The endpoint may return a remote URL or data URL; a regular img supports both.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="poster-image" src={job.image} alt={job.prompt} />
      ) : (
        <>
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
          <span className="poster-foot">PROMPT PARADE · RUNPOD</span>
        </>
      )}
      {job.phase !== "complete" && (
        <div className="poster-process">
          <span className="spinner" />
          {phaseLabel[job.phase]}
        </div>
      )}
    </article>
  );
}

export default function Home() {
  const [prompt, setPrompt] = useState("A raccoon DJ performing on Mars");
  const [style, setStyle] = useState(STYLES[0]);
  const [jobs, setJobs] = useState<PosterJob[]>([]);
  const [workersMin, setWorkersMin] = useState<0 | 1>(0);
  const [mode, setMode] = useState<Mode>("simulation");
  const [liveAvailable, setLiveAvailable] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    fetch("/api/runpod")
      .then((response) => response.json())
      .then((data) => setLiveAvailable(Boolean(data.liveAvailable)))
      .catch(() => setLiveAvailable(false));
    return () => timers.current.forEach(window.clearTimeout);
  }, []);

  const activeJobs = jobs.filter((job) => !["complete", "failed"].includes(job.phase));
  const queued = jobs.filter((job) => job.phase === "queued").length;
  const starting = jobs.some((job) => job.phase === "starting");
  const generating = jobs.some((job) => job.phase === "generating");
  const activeWorkers = Math.max(workersMin, Math.min(3, activeJobs.length - queued));
  const latestCompleted = [...jobs].reverse().find((job) => job.phase === "complete");
  const lastDuration = latestCompleted?.completedAt
    ? ((latestCompleted.completedAt - latestCompleted.startedAt) / 1000).toFixed(1)
    : "—";

  const story = useMemo(() => {
    if (starting) return { eyebrow: "COLD START", title: "No worker was ready, so a GPU is starting.", note: "This startup time is the latency tradeoff of scaling all the way to zero." };
    if (activeJobs.length > 1) return { eyebrow: "BURST TRAFFIC", title: "More jobs arrive than one worker can handle.", note: `Runpod can add up to ${Math.min(3, activeJobs.length)} GPU workers to process the queue in parallel.` };
    if (activeJobs.length === 1) return { eyebrow: "ONE ACTIVE JOB", title: "A GPU worker is running the model.", note: "When the queue clears, this worker can be removed instead of sitting idle." };
    if (jobs.length > 0 && workersMin === 1) return { eyebrow: "QUEUE CLEAR", title: "The poster is done. One worker stays warm.", note: "The next request starts faster, but idle capacity still has a cost." };
    if (jobs.length > 0) return { eyebrow: "QUEUE CLEAR", title: "The poster is done. The worker scales down.", note: "No warm workers means no active GPU compute while idle." };
    if (workersMin === 1) return { eyebrow: "WARM WORKER", title: "One GPU is ready before the first request.", note: "That reduces startup latency in exchange for paying for idle capacity." };
    return { eyebrow: "IDLE", title: "No requests. No GPU workers running.", note: "Submit a prompt to see what happens from an empty queue." };
  }, [activeJobs.length, jobs.length, starting, workersMin]);

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

  function schedule(id: string, phase: Phase, delay: number, extra: Partial<PosterJob> = {}) {
    timers.current.push(window.setTimeout(() => patchJob(id, { phase, ...extra }), delay));
  }

  async function runLive(job: PosterJob) {
    try {
      patchJob(job.id, { phase: "queued" });
      const submit = await fetch("/api/runpod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: job.prompt, style: job.style }),
      });
      const submitted = await submit.json();
      if (!submit.ok || !submitted.id) throw new Error(submitted.error || "Could not submit job");

      patchJob(job.id, { phase: workersMin === 0 ? "starting" : "generating" });
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await wait(1500);
        const response = await fetch(`/api/runpod?id=${encodeURIComponent(submitted.id)}`);
        const result = await response.json();
        if (result.status === "IN_PROGRESS") patchJob(job.id, { phase: "generating" });
        if (result.status === "COMPLETED") {
          patchJob(job.id, { phase: "complete", image: result.image, completedAt: Date.now() });
          return;
        }
        if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(result.status)) throw new Error(result.error || result.status);
      }
      throw new Error("Job polling timed out");
    } catch {
      patchJob(job.id, { phase: "failed", completedAt: Date.now() });
    }
  }

  function launch(nextPrompt: string, nextStyle: string, offset = 0) {
    const id = crypto.randomUUID();
    const job: PosterJob = {
      id,
      prompt: nextPrompt,
      style: nextStyle,
      phase: "queued",
      startedAt: Date.now() + offset,
      accent: jobs.length + Math.round(offset / 100),
    };
    timers.current.push(window.setTimeout(() => {
      setJobs((current) => [...current, job]);
      if (mode === "live") {
        void runLive(job);
        return;
      }
      const coldDelay = workersMin === 0 && jobs.length === 0 ? 1800 : 350;
      schedule(id, workersMin === 0 && jobs.length === 0 ? "starting" : "generating", 250);
      schedule(id, "generating", coldDelay);
      schedule(id, "complete", coldDelay + 3000 + (offset % 3) * 230, { completedAt: Date.now() + coldDelay + 3000 });
    }, offset));
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

    burst.forEach((item, index) => launch(item, STYLES[index % STYLES.length], index * 180));
  }

  function reset() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setJobs([]);
  }

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
            <input id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="An impossible meetup poster…" />
            <button className="primary" type="submit">Make poster</button>
          </div>
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
          <button onClick={runBurst}>Send 4 at once</button>
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
            <div><strong>{activeWorkers}</strong><small>Workers</small></div>
            <div><strong>{lastDuration}{lastDuration !== "—" && "s"}</strong><small>Last job</small></div>
          </div>
          <div className="workers" aria-label={`${activeWorkers} of 3 workers active`}>
            {[0, 1, 2].map((worker) => <span key={worker} className={worker < activeWorkers ? "active" : ""}><i />GPU WORKER {worker + 1}</span>)}
          </div>
        </div>

        <div className="gallery">
          {jobs.length === 0 ? (
            <div className="empty-gallery">
              <div className="empty-art"><span>0</span><small>workers</small></div>
              <p>Your first poster lands here.</p>
            </div>
          ) : jobs.slice(-6).map((job, index) => <Poster key={job.id} job={job} index={index} />)}
        </div>
      </section>

      <section className="tradeoff">
        <div><span className="overline">When the queue is empty</span><h2>Scale down, or keep one ready?</h2></div>
        <div className="mode-switch">
          <button className={workersMin === 0 ? "active" : ""} onClick={() => setWorkersMin(0)}><span>Scale to zero</span><small>0 warm workers · cold starts possible</small></button>
          <button className={workersMin === 1 ? "active" : ""} onClick={() => setWorkersMin(1)}><span>Keep one warm</span><small>1 warm worker · lower startup latency</small></button>
        </div>
        <div className="cost-line"><span>While nothing is happening</span><strong>{workersMin === 0 ? "No active GPU workers" : "1 GPU worker stays active"}</strong></div>
      </section>

      <footer>
        <p><strong>There isn&apos;t one right setting.</strong> <span>It depends on how long people can wait.</span></p>
        <div className="footer-actions">
          {liveAvailable && <button onClick={() => { reset(); setMode(mode === "live" ? "simulation" : "live"); }}>{mode === "live" ? "Use simulation" : "Use live endpoint"}</button>}
          {jobs.length > 0 && <button onClick={reset}>Reset demo</button>}
        </div>
      </footer>
    </main>
  );
}
