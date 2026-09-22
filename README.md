# Prompt Parade

A meetup-ready, three-minute demonstration of a common GPU infrastructure problem: traffic is bursty, accelerators are costly while idle, and scaling to zero introduces startup latency. The audience invents a poster, watches a worker start from zero, then triggers a burst of jobs and sees the queue fan out across more workers.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app starts in a deterministic simulation mode, so the complete talk works without credentials or venue Wi-Fi.

## Connect a Runpod Serverless endpoint

Copy `.env.example` to `.env.local` and provide:

```env
RUNPOD_API_KEY=...
RUNPOD_ENDPOINT_ID=...
```

The server-side adapter submits asynchronous jobs to `POST /run` and polls `GET /status/{id}`. Once configured, a **Use live endpoint** control appears in the footer. The API key is never sent to the browser.

The default worker payload is:

```json
{
  "input": {
    "prompt": "Audience prompt. Selected visual style"
  }
}
```

Set `RUNPOD_PROMPT_FIELD` if your handler uses a different prompt property. The adapter recognizes common output shapes: a URL string, `image`, `image_url`, `url`, or the first item in `images`.

## Three-minute presenter flow

1. Start with the traffic shape: **quiet → crowd → quiet**. Ask what happens if capacity is sized for the quiet period—or for the crowd.
2. Point out **0 workers**, ask the audience for a ridiculous prompt, and click **Print one**.
3. Narrate the cold start. Nothing was sitting idle, so the first request has to wait for a GPU worker to become ready.
4. Click **Send four jobs**. The important thing to watch is the queue and worker count: concurrency increases to absorb the burst.
5. Once the queue clears, show the workers scaling down again.
6. Compare **Scale to zero** with **Keep one warm**. This is a latency-versus-idle-capacity decision, not a universally correct setting.
7. Close by connecting the mechanics to Runpod: the endpoint accepts jobs, manages the queue, and changes the number of GPU workers within the limits you configure.

For a real endpoint, configure `workersMax: 3`. Use `workersMin: 0` for the scale-to-zero story, or `workersMin: 1` when demonstrating the latency-versus-standing-cost tradeoff.
