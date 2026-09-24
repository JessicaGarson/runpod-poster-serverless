# Runpod Serverless poster demo

**Most of the time, nothing happens. Then everyone shows up.**

This interactive demo shows what happens when a quiet GPU workload suddenly gets busy. Make a poster from your own prompt, then send four requests at once to watch [Runpod Serverless](https://docs.runpod.io/serverless/overview) bring workers online and work through the queue. When the jobs are done, the workers can scale back down.

Every poster is a real GPU job. The page shows the live queue, worker activity, and how long each job waited and ran. There is no simulation mode.

## What happens when you press the button

With no requests, the endpoint can sit at zero workers. Your first prompt enters the queue while Runpod starts a GPU worker and loads the image model. **Send 4 at once** adds a burst: more workers can start, take jobs from the same queue, and then wind down after it clears. The first request may take a couple of minutes; actual times depend on your endpoint and GPU availability.

The generated image becomes a subtle layer in a poster designed with CSS, so the gallery has a consistent look while each image is made by the model.

## Set up the Runpod backend

You'll need a Runpod account and API key. Create a [Serverless endpoint](https://docs.runpod.io/serverless/overview) using the [`worker-vllm-omni` worker](https://github.com/runpod-workers/worker-vllm-omni), which serves [Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo) for this demo.

Configure the endpoint with:

| Setting | Value for this demo | Why |
| --- | --- | --- |
| Worker environment variable | `MODEL_NAME=Tongyi-MAI/Z-Image-Turbo` | Loads the image model |
| GPU | At least 32 GB VRAM | Provides room for the model |
| Minimum workers | `0` | Lets the endpoint scale to zero |
| Maximum workers | `3` | Lets a burst spread across workers |
| Idle timeout | Short | Makes the scale-down visible after jobs finish |

Runpod bills for the GPU capacity your endpoint uses. A longer idle timeout keeps workers ready for the next request, while a shorter one makes a cold start more likely.

## Run the app

You'll also need Node.js 20 or later.

1. Copy `.env.example` to `.env.local` and add the API key and ID of the endpoint you created:

   ```bash
   cp .env.example .env.local
   ```

   ```env
   RUNPOD_API_KEY=your-api-key
   RUNPOD_ENDPOINT_ID=your-endpoint-id
   ```

   The example file includes optional `RUNPOD_MODEL` and `RUNPOD_IMAGE_SIZE` settings. Their defaults match the endpoint configuration above. Keep your API key in `.env.local`.

2. Install dependencies and start the app:

   ```bash
   npm install
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000). Enter a prompt and select **Make poster**, or select **Send 4 at once** to see a burst. The controls stay disabled until the API key and endpoint ID are configured.

## How the pieces connect

```text
Browser → Next.js app → Runpod job queue → GPU worker → generated image
```

The Next.js backend keeps the API key off the browser. It submits jobs to Runpod, checks their status until images are ready, and reads endpoint health to display queue and worker counts. The app's **Warm up 3 GPUs** control sends real jobs ahead of a presentation if you want workers ready before the first audience request.
