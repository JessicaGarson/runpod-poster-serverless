# Poster demo

**Most of the time, nothing happens. Then everyone shows up.**

GPU traffic is spiky. Keep a GPU running all the time and you pay for it while it sits idle. Scale to zero and the first request after a quiet period waits for a GPU to start. This demo makes that tradeoff visible with a poster generator running on [Runpod Serverless](https://docs.runpod.io/serverless/overview).

Type a prompt, and a real GPU job generates your poster. Then send four at once and watch Runpod spread the queue across several GPU workers, then scale them back down when it's empty.

## What you'll see

- **A live worker panel.** Each GPU worker shows as running, starting, idle, or off. The counts come from the endpoint's `/health` API every 2 seconds.
- **A story card** that explains each stage as it happens: idle, cold start, burst, and scaling back down.
- **Real timings on every poster.** The footer shows how long the job **waited** (queue plus worker startup) and how long the model **ran**, as reported by Runpod.
- **A burst button.** "Send 4 at once" queues four jobs together, so you can watch more workers come online.

Every poster is a real Runpod job. There's no simulated mode.

## What we learned

Measured on this demo's endpoint (Z-Image-Turbo, 512×512, 48GB GPUs, September 2026):

| | Time |
| --- | --- |
| Cold start (worker starts and loads the model) | about 2–2½ minutes |
| Generating one image | about 13–20 seconds |
| Burst of 4 jobs, 3 workers max | 3 workers running within seconds, all 4 done in about 2½ minutes |

Startup, not inference, is the expensive part. That's what the endpoint's scaling settings trade off:

- **Minimum workers** keeps GPUs running at all times. There are no cold starts, but you pay around the clock.
- **Idle timeout** keeps workers up for a while after their last job. A short timeout costs little while idle; a long one lets the next request start fast.
- **Maximum workers** caps how far a burst can fan out.

There's no universally right setting. It depends on how long your users can wait.

## How it works

```
Browser ──▶ Next.js API route ──▶ Runpod queue ──▶ GPU worker ──▶ image
             (holds the API key)    POST /run       vLLM-Omni
                                    GET /status      Z-Image-Turbo
                                    GET /health
```

- `app/page.tsx` is the whole UI: prompt form, burst button, worker panel, and gallery.
- `app/api/runpod/route.ts` is a small server-side proxy. It submits jobs with `POST /run`, polls `GET /status/{id}`, and reads worker counts from `GET /health`. The API key never reaches the browser.
- The GPU side is the [`worker-vllm-omni`](https://github.com/runpod-workers/worker-vllm-omni) worker serving [Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) through an OpenAI-style images API.

Each job sends this payload:

```json
{
  "input": {
    "openai_route": "/v1/images/generations",
    "openai_input": {
      "model": "Tongyi-MAI/Z-Image-Turbo",
      "prompt": "Create an image of exactly this subject: … Use a Neon editorial visual style. …",
      "size": "512x512",
      "n": 1
    }
  }
}
```

The posters are CSS designs. The generated image is blended in underneath as a faint texture, so every poster keeps the same look while still proving the GPU did the work.

## Run it yourself

You'll need a Runpod account and Node.js 20 or later.

**1. Deploy the worker.** Create a Serverless endpoint from [`runpod-workers/worker-vllm-omni`](https://github.com/runpod-workers/worker-vllm-omni) with:

- Environment variable `MODEL_NAME=Tongyi-MAI/Z-Image-Turbo`
- A GPU with at least 32GB of VRAM (the model peaks around 24GB)
- **Max workers: 3**, so the burst has room to fan out
- **Min workers: 0** and a short idle timeout, so you can see it scale to zero

**2. Configure the app.** Copy `.env.example` to `.env.local` and fill in:

```env
RUNPOD_API_KEY=your-api-key
RUNPOD_ENDPOINT_ID=your-endpoint-id

# Optional
RUNPOD_MODEL=Tongyi-MAI/Z-Image-Turbo
RUNPOD_IMAGE_SIZE=512x512
```

An API key restricted to this endpoint is enough. The app only runs jobs and reads status.

**3. Start it.**

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The controls stay disabled until the app can see both environment variables. The first poster pays the full cold start, so expect a couple of minutes' wait.
