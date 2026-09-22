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

## What the demo shows

GPU workloads rarely arrive at a steady rate. This demo follows one simple traffic pattern—**quiet → crowd → quiet**—and makes the infrastructure response visible.

1. The demo begins at **0 workers**, with no GPU capacity sitting idle.
2. Enter a prompt and select **Make poster**. The first request waits while a GPU worker starts.
3. Select **Send 4 at once** to create a burst. Watch the queue and worker count as more capacity comes online.
4. When the queue clears, the additional workers scale down again.
5. Switch between **Scale to zero** and **Keep one warm** to compare lower idle cost with lower startup latency.

Runpod Serverless handles the request queue and adjusts the number of GPU workers within the limits configured for the endpoint. There is no universally correct minimum worker count—the useful setting depends on how much startup latency the application and its users can tolerate.

> The default simulation is designed to explain the lifecycle clearly and consistently. It is not a performance benchmark. Connect a live endpoint to observe timings from a real workload.

## Suggested endpoint settings

Set `workersMax: 3` to make concurrent scaling visible during the burst. Use `workersMin: 0` to demonstrate scaling to zero, or `workersMin: 1` to keep one worker ready between requests.
