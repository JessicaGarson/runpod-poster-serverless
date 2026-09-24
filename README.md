# Runpod Serverless poster demo

**Most of the time, nothing happens. Then everyone shows up.**

This interactive demo shows what happens when a quiet GPU workload suddenly gets busy. Make a poster from your own prompt, then send four requests at once to watch [Runpod Serverless](https://docs.runpod.io/serverless/overview) bring workers online and work through the queue. When the jobs are done, the workers can scale back down.

The posters use real generated images, and the worker counts and job times come from the live endpoint. There is no simulation mode.

## Run it yourself

You'll need Node.js 20 or later, a Runpod account, and a Runpod API key.

1. **Create a Serverless endpoint** using the [`worker-vllm-omni` worker](https://github.com/runpod-workers/worker-vllm-omni). Set `MODEL_NAME=Tongyi-MAI/Z-Image-Turbo` and choose a GPU with at least 32 GB of VRAM. To see the full scale-up and scale-down story, set minimum workers to **0**, maximum workers to **3**, and a short idle timeout.
2. **Configure the app.** Copy `.env.example` to `.env.local`, then add your API key and endpoint ID:

   ```bash
   cp .env.example .env.local
   ```

   ```env
   RUNPOD_API_KEY=your-api-key
   RUNPOD_ENDPOINT_ID=your-endpoint-id
   ```

   The example file also includes optional model and image-size settings. Keep your API key in `.env.local`; the app sends it to Runpod from the server.

3. **Start the app.**

   ```bash
   npm install
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000). Enter a prompt and select **Make poster**, or select **Send 4 at once** to see a burst. The controls require both Runpod settings above.

## What you'll see

- **Workers starting, running, and winding down** as demand changes.
- **A live queue** when requests arrive faster than workers can take them.
- **Wait and run times** on each finished poster, so you can see where the time went.

The generated image appears as a subtle layer in each poster's design. A first request to an idle endpoint can take a couple of minutes while its worker starts and loads the model; later requests may be faster while workers are still warm. Actual times depend on your endpoint and GPU availability.
