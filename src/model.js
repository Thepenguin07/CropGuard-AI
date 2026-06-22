/**
 * model.js
 * --------
 * Loads the TF.js model produced by training/convert_to_tfjs.sh and runs
 * on-device inference. This is the bridge between the trained Python model
 * and the React PWA.
 *
 * Files expected at /public/model/ (served as static assets, cached by the
 * service worker for offline use):
 *   model.json
 *   group1-shard1of4.bin ... group1-shard4of4.bin   (exact count depends
 *                                                      on quantized size)
 */

import * as tf from "@tensorflow/tfjs";
import labels from "../training/labels.json"; // {"0": "wheat_healthy", ...}

const MODEL_URL = "/model/model.json";
const INPUT_SIZE = 224; // must match IMG_SIZE used in train_model.py

let model = null;
let backendReady = false;

/**
 * Picks WebGL when available (fast, GPU-accelerated), falls back to WASM
 * on devices without WebGL 2.0 — matching the deck's stated inference path.
 */
async function initBackend() {
  if (backendReady) return;
  try {
    await tf.setBackend("webgl");
    await tf.ready();
  } catch (err) {
    console.warn("WebGL unavailable, falling back to WASM:", err);
    // Requires @tensorflow/tfjs-backend-wasm to be imported once at app startup
    await tf.setBackend("wasm");
    await tf.ready();
  }
  backendReady = true;
}

/** Loads the model once and caches it in memory for subsequent calls. */
export async function loadModel(onProgress) {
  await initBackend();
  if (model) return model;

  model = await tf.loadGraphModel(MODEL_URL, {
    onProgress: (fraction) => onProgress && onProgress(fraction),
  });

  // Warm-up pass: first inference is always slower because TF.js compiles
  // GPU shaders on first run. Doing this at load time keeps the user-facing
  // "photograph -> result" step under the deck's <10s target.
  const dummy = tf.zeros([1, INPUT_SIZE, INPUT_SIZE, 3]);
  const warmup = model.execute(dummy);
  tf.dispose([dummy, warmup]);

  return model;
}

/**
 * Converts an HTMLImageElement/HTMLCanvasElement/HTMLVideoElement (i.e. the
 * photo just taken by the camera) into the normalized tensor the model
 * expects: 224x224, RGB, values in [0, 1].
 */
function preprocess(imageSource) {
  return tf.tidy(() => {
    let tensor = tf.browser.fromPixels(imageSource);
    tensor = tf.image.resizeBilinear(tensor, [INPUT_SIZE, INPUT_SIZE]);
    tensor = tensor.div(255.0);
    return tensor.expandDims(0); // add batch dimension -> [1,224,224,3]
  });
}

/**
 * Runs inference and returns the top prediction plus full class
 * probability list, e.g.:
 *   { classKey: "rice_blast", confidence: 0.94, allProbabilities: [...] }
 */
export async function predict(imageSource) {
  const net = await loadModel();
  const inputTensor = preprocess(imageSource);

  const output = net.execute(inputTensor);
  const probabilities = await output.data(); // Float32Array, length 15

  tf.dispose([inputTensor, output]);

  let bestIdx = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[bestIdx]) bestIdx = i;
  }

  return {
    classKey: labels[String(bestIdx)],
    confidence: probabilities[bestIdx],
    allProbabilities: Array.from(probabilities).map((p, i) => ({
      classKey: labels[String(i)],
      confidence: p,
    })),
  };
}
